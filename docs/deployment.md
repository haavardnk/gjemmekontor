# Deployment

Gjemmekontor runs as one non-root Node.js container. Mount persistent storage at `/data`; the process runs as UID/GID `10001`.

## Compose

Copy `docker-compose.example.yml` and create a sibling `.env`:

```env
APP_PASSWORD=replace-with-a-strong-password
SESSION_SECRET=replace-with-32-random-bytes
ENABLED_MODULES=map,shots,logbook,shopping-list,menu
GOOGLE_MY_MAPS_ID=replace-with-a-public-map-id
GOOGLE_PLACES_SERVER_API_KEY=
GOOGLE_PLACES_UI_KIT_API_KEY=
TRIPADVISOR_TERRA_API_KEY=
TRIPADVISOR_TERRA_PHOTOS_ENABLED=false
TRIPADVISOR_CACHE_DAYS=30
AISSTREAM_API_KEY=replace-with-an-aisstream-api-key
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

| Variable                           | Purpose                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `APP_PASSWORD`                     | Shared application password, at least 8 characters                      |
| `APP_VERSION`                      | Image-owned version derived from the GitHub Release tag                 |
| `SESSION_SECRET`                   | Session signing secret, at least 32 bytes                               |
| `DATA_DIR`                         | Persistent data directory; use `/data` in Docker                        |
| `ENABLED_MODULES`                  | Optional comma-separated module IDs; defaults to all                    |
| `BUNDLED_OFFLINE_MAP_DIR`          | Optional directory containing image-bundled PMTiles                     |
| `GOOGLE_MY_MAPS_ID`                | Public Google My Maps map ID                                            |
| `GOOGLE_PLACES_SERVER_API_KEY`     | Optional server-only Places API (New) key for POI identity matching     |
| `GOOGLE_PLACES_UI_KIT_API_KEY`     | Optional browser Places UI Kit key, restricted to the public origin     |
| `TRIPADVISOR_TERRA_API_KEY`        | Optional server-only Tripadvisor key for POI enrichment                 |
| `TRIPADVISOR_TERRA_PHOTOS_ENABLED` | Enable on-demand Tripadvisor photos when the subscription supports them |
| `TRIPADVISOR_CACHE_DAYS`           | Shared Tripadvisor cache lifetime; defaults to `30` days                |
| `AISSTREAM_API_KEY`                | Server-side key for the live AISStream vessel layer                     |
| `BRING_EMAIL`                      | Email for the shared Bring account                                      |
| `BRING_PASSWORD`                   | Password for the shared Bring account                                   |
| `BRING_LIST_UUID`                  | UUID of the trip shopping list                                          |
| `ORIGIN`                           | Exact public HTTP or HTTPS origin without a trailing slash              |
| `BODY_SIZE_LIMIT`                  | Adapter request limit; keep at `6M` for 5 MB GPX uploads                |
| `HOST`                             | Listen address; image default is `0.0.0.0`                              |
| `PORT`                             | Listen port; image default is `3000`                                    |

Available module IDs are `map`, `shots`, `logbook`, `shopping-list`, and `menu`. At least one must be enabled. Unknown or duplicate IDs fail configuration validation. Map configuration is required only when `map` is enabled. Bring configuration remains optional for `shopping-list`; without it, the module shows its provider-unavailable state.

## Maps

`GOOGLE_MY_MAPS_ID` must reference a map shared as **Anyone with the link can view**. `AISSTREAM_API_KEY` remains on the server and subscribes the live vessel feed to this map's initial bounds. The image includes a Protomaps normal basemap for the sailing region at zoom 0–14. The app offers only packages present in the image or data directory.

Licensed operator-provided packages in `/data` override bundled files with the same name:

```text
/data/map/offline/normal.pmtiles
/data/map/offline/nautical.pmtiles
/data/map/offline/satellite.pmtiles
```

Only redistribute archives permitted by their data providers. Back up externally mounted archives separately.

### Google POI enrichment credentials

POI enrichment uses two Google keys so browser and server traffic can have different application restrictions. Create or select a Google Cloud project with billing enabled, then enable **Places API (New)** and **Maps JavaScript API**.

Create `gjemmekontor-places-server`:

1. In **Google Maps Platform → Credentials**, create an API key.
2. Restrict the application to the deployment host's fixed public egress IP address when one is available.
3. Restrict the key to **Places API (New)** only.
4. Set it as `GOOGLE_PLACES_SERVER_API_KEY`. Never expose this key to the browser.

Create `gjemmekontor-places-ui`:

1. Create a second API key and select the **Websites** application restriction.
2. Add the exact `ORIGIN`, both bare and with a path wildcard; for example `https://app.example.com` and `https://app.example.com/*`.
3. Restrict the key to **Maps JavaScript API** and **Places API (New)**. The custom Google card calls `Places.GetPlace`; a key restricted to Places UI Kit returns `PERMISSION_DENIED`.
4. Set it as `GOOGLE_PLACES_UI_KIT_API_KEY`. This key is visible to authenticated browsers, so both restrictions are required.

Use a separate development browser key for `http://localhost:5173/*` and `http://127.0.0.1:4173/*`; do not allow localhost on the production key. Start with low quotas suitable for four users, such as 10 server searches per minute and 100 UI Kit queries per day where those controls are available. Add project billing alerts at 50%, 90%, and 100%; billing alerts are notifications, while API quotas are the request guardrail.

After deployment, open one eligible restaurant or marina and verify in Google Cloud metrics that the server key records a Places Text Search request and the browser key records a Places details request. Reopening the same POI should reuse the loaded Maps JavaScript API, while the stored Place ID prevents another server search.

### Tripadvisor POI enrichment

Set `TRIPADVISOR_TERRA_API_KEY` to enable shared Tripadvisor ratings and links. Details are cached server-side for `TRIPADVISOR_CACHE_DAYS`, so all four users share the first successful lookup. Enable `TRIPADVISOR_TERRA_PHOTOS_ENABLED=true` only when photo access is active; photos are requested once, when first expanded, and then added to the shared cache.

The key must come from the current Tripadvisor Terra dashboard. The server calls `https://terra.tripadvisor.com/api` with the key in the `X-API-Key` header; legacy Content API keys and endpoints are not interchangeable. The Catalog Nearby response supplies the matched ID, rating, count, and Tripadvisor links in one call. A separate catalog-details request is made only for a manual or previously stored ID whose shared details cache has expired.

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

Database schema updates run at startup and are forward-only.
