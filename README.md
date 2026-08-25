# Gjemmekontor

![Monsieur Bintang](static/monsieur-bintang-readme.png)

A shared, offline-first travel app for a sailing trip in Croatia.

## Features

- Read-only trip map sourced from Google My Maps
- Normal, nautical, and satellite map views
- Downloadable PMTiles packages for offline maps
- Daily video shot list and media digest
- Shared sailing logbook with Orca GPX import and actual routes
- Live shared Bring shopping list with completion, restore, detail editing, and cached offline access
- Shared meal planning with recipe import, cooking mode, and Bring shopping list integration
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

## Modules

Product features are statically bundled modules under `src/lib/modules`. Enable a subset with a comma-separated runtime value such as:

```env
ENABLED_MODULES=map,shots,logbook,shopping-list,menu
```

The module catalog controls navigation, protected routes and APIs, PWA page warming, state namespaces, and optional cross-module capabilities. Disabled modules retain their data. See [Deployment](docs/deployment.md) for module-specific configuration.

## Deployment

Run the app as one Docker container with a persistent `/data` volume. See
[Deployment](docs/deployment.md) for setup and upgrades, and
[Backup and restore](docs/backup-and-restore.md) before upgrading.
