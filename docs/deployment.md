# Deployment

Gjemmekontor runs as one non-root Node.js container. Mount persistent storage at `/data`; the process runs as UID/GID `10001`.

## Compose

Copy `docker-compose.example.yml` and create a sibling `.env`:

```env
APP_PASSWORD=replace-with-a-strong-password
SESSION_SECRET=replace-with-32-random-bytes
GOOGLE_MY_MAPS_ID=replace-with-a-public-map-id
BRING_EMAIL=replace-with-bring-account-email
BRING_PASSWORD=replace-with-bring-account-password
BRING_LIST_UUID=replace-with-bring-list-uuid
ORIGIN=https://app.example.com
```

Generate `SESSION_SECRET` with `openssl rand -base64 32`. Update the host volume path, then create it with the container's ownership:

```sh
mkdir -p /mnt/user/appdata/gjemmekontor
chown -R 10001:10001 /mnt/user/appdata/gjemmekontor
docker compose up -d
docker compose ps
```

Health endpoint: `GET /api/health`.

## Runtime environment

| Variable                  | Purpose                                                    |
| ------------------------- | ---------------------------------------------------------- |
| `APP_PASSWORD`            | Shared application password, at least 8 characters         |
| `APP_VERSION`             | Image-owned version derived from the GitHub Release tag    |
| `SESSION_SECRET`          | Session signing secret, at least 32 bytes                  |
| `DATA_DIR`                | Persistent data directory; use `/data` in Docker           |
| `BUNDLED_OFFLINE_MAP_DIR` | Optional directory containing image-bundled PMTiles        |
| `GOOGLE_MY_MAPS_ID`       | Public Google My Maps map ID                               |
| `BRING_EMAIL`             | Email for the shared Bring account                         |
| `BRING_PASSWORD`          | Password for the shared Bring account                      |
| `BRING_LIST_UUID`         | UUID of the trip shopping list                             |
| `ORIGIN`                  | Exact public HTTP or HTTPS origin without a trailing slash |
| `BODY_SIZE_LIMIT`         | Adapter request limit; keep at `6M` for 5 MB GPX uploads   |
| `HOST`                    | Listen address; image default is `0.0.0.0`                 |
| `PORT`                    | Listen port; image default is `3000`                       |

## Reverse proxy

Set `ORIGIN` to the exact external origin. For a containerized proxy, attach it to the `gjemmekontor` network and route traffic to `http://gjemmekontor:3000`. Example Cloudflare Tunnel ingress:

```yml
ingress:
  - hostname: app.example.com
    service: http://gjemmekontor:3000
  - service: http_status:404
```

Compose binds direct access to `127.0.0.1:3000`. Remove `ports` when only another container needs access.

## Maps

`GOOGLE_MY_MAPS_ID` must reference a map shared as **Anyone with the link can view**. The image includes a Protomaps normal basemap for the sailing region at zoom 0–14. The app offers only packages present in the image or data directory.

Licensed operator-provided packages in `/data` override bundled files with the same name:

```text
/data/map/offline/normal.pmtiles
/data/map/offline/nautical.pmtiles
/data/map/offline/satellite.pmtiles
```

Only redistribute archives permitted by their data providers. Back up externally mounted archives separately.

## Bring

Handleliste uses one server-side Bring account and one list. Find the list UUID before deployment:

```sh
npm run bring:lists
```

The command reads `BRING_EMAIL` and `BRING_PASSWORD` from the ignored `.env` file. Set the matching UUID as `BRING_LIST_UUID`. Credentials never reach the browser. The app keeps the last successful list snapshot on each device for read-only use without a connection.

The integration uses the unofficial `bring-shopping` wrapper. Bring does not publish this API, so upstream changes may interrupt Handleliste without affecting the other modules.

## Upgrade

Create a [backup](backup-and-restore.md), then replace the container:

```sh
docker compose pull
docker compose up -d
```

Migrations run at startup and are forward-only.

## GHCR

The GitHub Release tag is the only release-version source. The first release is `v0.1.0`; later tags must use stable `vMAJOR.MINOR.PATCH` format and point to `main`. The workflow derives `MAJOR.MINOR.PATCH` from the tag, injects it into the image metadata and health response, then smoke-tests and publishes `ghcr.io/haavardnk/gjemmekontor:MAJOR.MINOR.PATCH` and `latest`. Do not set `APP_VERSION` in Compose; the image owns it.
