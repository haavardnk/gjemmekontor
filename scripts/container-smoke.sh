#!/bin/sh

set -eu

image="${1:?Usage: $0 IMAGE}"
expected_version="${2:-}"
name="gjemmekontor-smoke-$$"
volume="$name-data"

cleanup() {
	docker rm -f "$name" >/dev/null 2>&1 || true
	docker volume rm "$volume" >/dev/null 2>&1 || true
}

start() {
	docker run -d \
		--name "$name" \
		--mount "source=$volume,target=/data" \
		-e APP_PASSWORD=test-password \
		-e SESSION_SECRET=0123456789abcdef0123456789abcdef \
		-e DATA_DIR=/data \
		-e GOOGLE_MY_MAPS_ID=test-map \
		-e ORIGIN=http://127.0.0.1:3000 \
		-e BODY_SIZE_LIMIT=6M \
		-e AISSTREAM_API_KEY=test-aisstream-key \
		-p 127.0.0.1:3000:3000 \
		"$image" >/dev/null

	for attempt in $(seq 1 30); do
		if node -e "fetch('http://127.0.0.1:3000/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"; then
			return
		fi
		if [ "$attempt" -eq 30 ]; then
			docker logs "$name"
			return 1
		fi
		sleep 1
	done
}

trap cleanup EXIT INT TERM
docker volume create "$volume" >/dev/null
start
test "$(docker exec "$name" id -u)" = "10001"
docker exec "$name" test -s /data/gjemmekontor.sqlite
if [ -n "$expected_version" ]; then
	test "$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.version" }}' "$name")" = "$expected_version"
fi
EXPECTED_VERSION="$expected_version" node --input-type=module - <<'NODE'
const origin = 'http://127.0.0.1:3000';
const expectedVersion = process.env.EXPECTED_VERSION;
const health = await fetch(`${origin}/api/health`);
const healthBody = await health.json();
if (!health.ok || healthBody.status !== 'ok' || (expectedVersion && healthBody.version !== expectedVersion)) process.exit(1);
const login = await fetch(`${origin}/api/auth/login`, {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ password: 'test-password' })
});
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!login.ok || !cookie) process.exit(1);
const manifest = await fetch(`${origin}/api/map/offline`, { headers: { cookie } });
const body = await manifest.json();
if (!manifest.ok || body.packages?.length !== 1 || body.packages[0]?.mode !== 'normal') process.exit(1);
const archive = await fetch(`${origin}${body.packages[0].url}`, {
	headers: { cookie, range: 'bytes=0-7' }
});
const signature = Buffer.from(await archive.arrayBuffer());
if (archive.status !== 206 || !signature.equals(Buffer.from([80, 77, 84, 105, 108, 101, 115, 3]))) process.exit(1);
NODE
docker exec "$name" node -e "const Database=require('better-sqlite3');const db=new Database('/data/gjemmekontor.sqlite');db.prepare(\"INSERT OR REPLACE INTO meta (key, value) VALUES ('smoke_marker', 'persisted')\").run();db.close()"
docker rm -f "$name" >/dev/null
start
docker exec "$name" node -e "const Database=require('better-sqlite3');const db=new Database('/data/gjemmekontor.sqlite');const row=db.prepare(\"SELECT value FROM meta WHERE key='smoke_marker'\").get();db.close();if(row?.value!=='persisted')process.exit(1)"
