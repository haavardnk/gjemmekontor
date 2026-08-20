ARG APP_VERSION=unreleased

FROM node:26-trixie-slim AS build

WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates curl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

ARG PMTILES_VERSION=1.31.2
ARG PMTILES_ARCHIVE_SHA256=3ed7dbf4ec2e6dfe5e25b6f70d1ffc932729f93c86db353bf514dd71010a312f
ARG PROTOMAPS_BUILD=20260722
ARG OFFLINE_MAP_SHA256=441e771449aaba6f7028ab420c347665c60030dfb7a8533896803e5c37f7f9e5

RUN curl --fail --location --silent --show-error \
        "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_Linux_x86_64.tar.gz" \
        --output /tmp/pmtiles.tar.gz \
    && echo "${PMTILES_ARCHIVE_SHA256}  /tmp/pmtiles.tar.gz" | sha256sum --check \
    && tar --extract --gzip --file /tmp/pmtiles.tar.gz --directory /usr/local/bin pmtiles \
    && mkdir -p /app/offline \
    && pmtiles extract "https://build.protomaps.com/${PROTOMAPS_BUILD}.pmtiles" /app/offline/normal.pmtiles \
        --bbox=15.7,42.7,17.0,43.7 --maxzoom=14 \
    && pmtiles verify /app/offline/normal.pmtiles >/dev/null \
    && echo "${OFFLINE_MAP_SHA256}  /app/offline/normal.pmtiles" | sha256sum --check \
    && touch --date='2026-07-22T00:00:00Z' /app/offline/normal.pmtiles \
    && rm /tmp/pmtiles.tar.gz /usr/local/bin/pmtiles

COPY . .
RUN HUSKY=0 npm ci
RUN npm run validate
RUN npm run build
RUN npm prune --omit=dev --ignore-scripts

FROM node:26-trixie-slim AS runtime

ARG APP_VERSION

LABEL org.opencontainers.image.version="${APP_VERSION}"

ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    BUNDLED_OFFLINE_MAP_DIR=/app/offline \
    BODY_SIZE_LIMIT=6M

WORKDIR /app

RUN groupadd --gid 10001 gjemmekontor \
    && useradd --uid 10001 --gid 10001 --create-home --home-dir /home/gjemmekontor gjemmekontor \
    && mkdir -p /data \
    && chown gjemmekontor:gjemmekontor /data

COPY --from=build --chown=gjemmekontor:gjemmekontor /app/node_modules ./node_modules
COPY --from=build --chown=gjemmekontor:gjemmekontor /app/build ./build
COPY --from=build --chown=gjemmekontor:gjemmekontor /app/offline ./offline
COPY --chown=gjemmekontor:gjemmekontor package.json ./

USER gjemmekontor

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"]

CMD ["node", "build"]
