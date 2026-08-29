# Gjemmekontor

![Monsieur Bintang](static/monsieur-bintang-readme.png)

A shared, offline-first app for planning and using multiple trips.

## Features

- Read-only trip map sourced from Google My Maps
- Shared vertical travel timeline with multi-leg journeys, transfers, stays, rentals, and bookings
- Normal, nautical, and satellite map views
- Downloadable PMTiles packages for offline maps
- Daily video shot list and media digest
- Shared sailing logbook with Orca GPX import and actual routes
- Live shared Bring shopping list with completion, restore, detail editing, and cached offline access
- Shared meal planning with recipe import, cooking mode, and Bring shopping list integration
- Shared gear archive, planning, and packing with categories, owners, purchasing status, and progress
- Shared trip rule book with a randomized daily participant rotation
- Optional server-side FlightAware lookup for flight times, airports, terminals, gates, and status
- Offline editing and synchronization between devices
- Installable progressive web app

## Local development

```sh
npm install
cp .env.example .env
npm run dev
```

```sh
npm run validate
npx playwright install
npm run test:e2e
```

Configure the required runtime values in `.env` before starting the app.

## Trips and modules

Product features are statically bundled modules under `src/lib/modules`. An administrator creates
trips, adds people, sets the trip dates and password, enables modules, orders their navigation, and
configures their connections in Trip Settings. Disabled modules retain their data.

The module catalog controls protected routes and APIs, PWA page warming, state namespaces, and
optional cross-module capabilities. See [Deployment](docs/deployment.md) for shared provider
configuration.

## Deployment

Run the app as one Docker container with a persistent `/data` volume. See
[Deployment](docs/deployment.md) for setup and upgrades, and
[Backup and restore](docs/backup-and-restore.md) before upgrading.
