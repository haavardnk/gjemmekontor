# Backup and restore

All durable state lives under `DATA_DIR` (`/data` in the container). Database migrations are forward-only, so back up before upgrades.

## Scope

Back up the complete directory. It contains:

- SQLite, including archived GPX files
- SQLite WAL/SHM files when the app is running
- Google map cache and PMTiles stored below `map/`

Files mounted into `/data/map/offline` from another host path are outside this backup and must be handled separately.

## Cold backup

```sh
docker compose stop gjemmekontor
tar -C /mnt/user/appdata -czf "gjemmekontor-$(date +%Y%m%d-%H%M%S).tar.gz" gjemmekontor
docker compose start gjemmekontor
```

## Restore

```sh
docker compose stop gjemmekontor
mv /mnt/user/appdata/gjemmekontor /mnt/user/appdata/gjemmekontor.previous
tar -C /mnt/user/appdata -xzf gjemmekontor-BACKUP.tar.gz
chown -R 10001:10001 /mnt/user/appdata/gjemmekontor
docker compose start gjemmekontor
docker compose ps
```

Verify the app and an archived GPX-backed leg before deleting the previous directory. Restoring an older image may require its matching data backup.
