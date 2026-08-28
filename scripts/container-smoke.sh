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
		-e ADMIN_PASSWORD=test-administrator-password \
		-e SESSION_SECRET=0123456789abcdef0123456789abcdef \
		-e DATA_DIR=/data \
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
docker exec "$name" node -e "const Database=require('better-sqlite3');const db=new Database('/data/gjemmekontor.sqlite');db.exec(\"CREATE TABLE container_smoke (value TEXT NOT NULL); INSERT INTO container_smoke VALUES ('persisted')\");db.close()"
docker rm -f "$name" >/dev/null
start
docker exec "$name" node -e "const Database=require('better-sqlite3');const db=new Database('/data/gjemmekontor.sqlite');const row=db.prepare(\"SELECT value FROM container_smoke\").get();db.close();if(row?.value!=='persisted')process.exit(1)"
