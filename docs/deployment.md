# Deployment

Gjemmekontor runs as one non-root Node.js container. Mount persistent storage at `/data`; the process runs as UID/GID `10001`.

## Compose

Copy `docker-compose.example.yml` and create a sibling `.env`:

```env
ADMIN_PASSWORD=replace-with-at-least-12-characters
SESSION_SECRET=replace-with-32-random-bytes
GOOGLE_PLACES_SERVER_API_KEY=
GOOGLE_PLACES_BROWSER_API_KEY=
TRIPADVISOR_TERRA_API_KEY=
TRIPADVISOR_TERRA_PHOTOS_ENABLED=false
TRIPADVISOR_CACHE_DAYS=30
AISSTREAM_API_KEY=replace-with-an-aisstream-api-key
FLIGHTAWARE_AEROAPI_KEY=
BRING_EMAIL=replace-with-bring-account-email
BRING_PASSWORD=replace-with-bring-account-password
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
| `ADMIN_PASSWORD`                   | Administrator password, at least 12 characters                          |
| `APP_VERSION`                      | Image-owned version derived from the GitHub Release tag                 |
| `SESSION_SECRET`                   | Session signing secret, at least 32 bytes                               |
| `DATA_DIR`                         | Persistent data directory; use `/data` in Docker                        |
| `BUNDLED_OFFLINE_MAP_DIR`          | Optional directory containing image-bundled PMTiles                     |
| `GOOGLE_PLACES_SERVER_API_KEY`     | Optional server-only Places API (New) key for POI identity matching     |
| `GOOGLE_PLACES_BROWSER_API_KEY`    | Optional Maps JavaScript API key, restricted to the public origin       |
| `TRIPADVISOR_TERRA_API_KEY`        | Optional server-only Tripadvisor key for POI enrichment                 |
| `TRIPADVISOR_TERRA_PHOTOS_ENABLED` | Enable on-demand Tripadvisor photos when the subscription supports them |
| `TRIPADVISOR_CACHE_DAYS`           | Shared Tripadvisor cache lifetime; defaults to `30` days                |
| `AISSTREAM_API_KEY`                | Server-side key for the live AISStream vessel layer                     |
| `FLIGHTAWARE_AEROAPI_KEY`          | Optional server-side AeroAPI key for flight lookup in Reiseplan         |
| `BRING_EMAIL`                      | Email for the shared Bring account                                      |
| `BRING_PASSWORD`                   | Password for the shared Bring account                                   |
| `ORIGIN`                           | Exact public HTTP or HTTPS origin without a trailing slash              |
| `BODY_SIZE_LIMIT`                  | Adapter request limit; keep at `6M` for 5 MB GPX uploads                |
| `HOST`                             | Listen address; image default is `0.0.0.0`                              |
| `PORT`                             | Listen port; image default is `3000`                                    |

Available module IDs are `map`, `itinerary`, `shots`, `logbook`, `shopping-list`, `menu`, `gear`,
and `rule-book`. Module activation, order, Google My Maps IDs, and Bring list UUIDs are stored per trip
and managed through Trip Settings. Shared provider credentials remain in the environment.

## Maps

Each trip's Google My Maps ID must reference a map shared as **Anyone with the link can view**.
`AISSTREAM_API_KEY` remains on the server and subscribes the live vessel feed to the active trip
map's initial bounds. The app offers only offline packages present in the image or data directory.

Licensed operator-provided packages in `/data` override bundled files with the same name:

```text
/data/trips/{tripId}/map/offline/normal.pmtiles
/data/trips/{tripId}/map/offline/nautical.pmtiles
/data/trips/{tripId}/map/offline/satellite.pmtiles
```

Only redistribute archives permitted by their data providers. Back up externally mounted archives separately.

### Google POI enrichment credentials

POI enrichment uses two Google keys so browser and server traffic can have different application restrictions. Create or select a Google Cloud project with billing enabled, then enable **Places API**, **Places API (New)**, and **Maps JavaScript API**.

Create `gjemmekontor-places-server`:

1. In **Google Maps Platform → Credentials**, create an API key.
2. Restrict the application to the deployment host's fixed public egress IP address when one is available.
3. Restrict the key to **Places API (New)** only.
4. Set it as `GOOGLE_PLACES_SERVER_API_KEY`. Never expose this key to the browser.

Create `gjemmekontor-places-browser`:

1. Create a second API key and select the **Websites** application restriction.
2. Add the exact `ORIGIN`, both bare and with a path wildcard; for example `https://app.example.com` and `https://app.example.com/*`.
3. Restrict the key to **Maps JavaScript API**, **Places API**, and **Places API (New)**. The custom Google card and itinerary autocomplete use the new Place APIs.
4. Set it as `GOOGLE_PLACES_BROWSER_API_KEY`. This key is visible to authenticated browsers, so both restrictions are required.

Use a separate development browser key for `http://localhost:5173/*` and `http://127.0.0.1:4173/*`; do not allow localhost on the production key. Start with low quotas suitable for four users, such as 10 server searches per minute and 100 Places API queries per day where those controls are available. Add project billing alerts at 50%, 90%, and 100%; billing alerts are notifications, while API quotas are the request guardrail.

After deployment, open one eligible restaurant or marina and verify in Google Cloud metrics that the server key records a Places Text Search request and the browser key records a Places details request. Reopening the same POI should reuse the loaded Maps JavaScript API, while the stored Place ID prevents another server search.

### Tripadvisor POI enrichment

Set `TRIPADVISOR_TERRA_API_KEY` to enable shared Tripadvisor ratings and links. Details are cached server-side for `TRIPADVISOR_CACHE_DAYS`, so all four users share the first successful lookup. Enable `TRIPADVISOR_TERRA_PHOTOS_ENABLED=true` only when photo access is active; photos are requested once, when first expanded, and then added to the shared cache.

The key must come from the current Tripadvisor Terra dashboard. The server calls `https://terra.tripadvisor.com/api` with the key in the `X-API-Key` header; obsolete Content API keys and endpoints are not interchangeable. The Catalog Nearby response supplies the matched ID, rating, count, and Tripadvisor links in one call. A separate catalog-details request is made only for a manual or previously stored ID whose shared details cache has expired.

## Bring

Handleliste uses one server-side Bring account. To inspect the lists available to that account:

```sh
npm run bring:lists
```

The command reads `BRING_EMAIL` and `BRING_PASSWORD` from the ignored `.env` file. Credentials
never reach the browser. In Trip Settings, verify an existing list UUID or create a new list named
after the trip. Each trip stores its own verified connection. The app keeps the last successful list
snapshot in that trip's device database for read-only use without a connection.

The integration uses the unofficial `bring-shopping` wrapper. Bring does not publish this API, so upstream changes may interrupt Handleliste without affecting the other modules.

## Reiseplan flight lookup

Set `FLIGHTAWARE_AEROAPI_KEY` to enable the optional **Hent flydata** action for flight legs. The
key stays on the server. Reiseplan remains fully usable with manual flight details when the key is
missing or AeroAPI is unavailable. Lookups are user-initiated and limited to one result page so
provider usage remains predictable.

Existing trips receive newly bundled modules in the disabled state during startup. Enable Reiseplan
and place it in the desired navigation position through Trip Settings.

## Upgrade

Create a [backup](backup-and-restore.md), then replace the container:

```sh
docker compose pull
docker compose up -d
```

The released trip-based database uses schema version 4. Fresh installations create that schema
directly, and existing version 4 databases open without conversion. Back up the database before any
future release that announces a schema change.
