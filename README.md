# Gjemmekontor

A shared mobile-first travel app for a sailing trip in Croatia.

## Features

- Read-only trip map sourced from Google My Maps
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
