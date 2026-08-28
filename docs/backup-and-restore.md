# Backup and restore

All durable state lives under `DATA_DIR` (`/data` in the container). Database schema updates are forward-only, so back up before upgrades.

## Scope

Back up the complete directory. It contains:

- SQLite, including archived GPX files
- SQLite WAL/SHM files when the app is running
- Per-trip Google map caches and PMTiles stored below `trips/{tripId}/map/`

Files mounted into a trip map directory from another host path are outside this backup and must be
handled separately.
