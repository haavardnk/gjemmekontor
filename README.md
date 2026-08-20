# Gjemmekontor

A shared mobile-first travel app for a sailing trip in Croatia.

## Features

- Read-only trip map sourced from Google My Maps
- Normal, nautical, and satellite map views
- Downloadable PMTiles packages for offline maps
- Daily video shot list and media digest
- Shared sailing logbook
- Offline editing and synchronization between devices
- Installable progressive web app

## Local development

Install dependencies:

```sh
npm install
```

Copy `.env.example` to `.env`, configure the values, and start the development server:

```sh
npm run dev
```

Run the complete local validation gate:

```sh
npm run validate
```

Run end-to-end tests separately:

```sh
npx playwright install
npm run test:e2e
```

See `.env.example` for required runtime configuration.

## Deployment

The application is designed to run as a single Docker container with a persistent data volume.

Optional offline packages are read from `DATA_DIR/map/offline/`. Name the files `normal.pmtiles`, `nautical.pmtiles`, and `satellite.pmtiles`. The app lists each available package with its size and lets users download or remove it on their device.

Only use archives you may redistribute for offline use. Public web tile services usually forbid bulk downloads.
