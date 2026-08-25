# Backup and restore

All durable state lives under `DATA_DIR` (`/data` in the container). Database schema updates are forward-only, so back up before upgrades.

## Scope

Back up the complete directory. It contains:

- SQLite, including archived GPX files
- SQLite WAL/SHM files when the app is running
- Google map cache and PMTiles stored below `map/`

Files mounted into `/data/map/offline` from another host path are outside this backup and must be handled separately.
