#!/bin/sh
# Atomic custom-format dumps. Destination must be a persistent, private mount.
set -eu
umask 077
BACKUP_DIR="${DB_BACKUP_DIR:-/var/lib/postgresql/backups}"
INTERVAL="${DB_BACKUP_INTERVAL_SECONDS:-86400}"
RETENTION="${DB_BACKUP_RETENTION_DAYS:-14}"
case "$INTERVAL:$RETENTION" in *[!0-9:]*|:*|*:) echo "Invalid backup limits" >&2; exit 1;; esac
[ "$INTERVAL" -ge 60 ] && [ "$RETENTION" -ge 1 ] || exit 1

health() {
  [ -s "$BACKUP_DIR/last-success" ] || return 1
  last=$(cat "$BACKUP_DIR/last-success")
  [ "$(($(date +%s) - last))" -lt "$((INTERVAL * 2))" ]
}

backup_once() (
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  temporary=$(mktemp "$BACKUP_DIR/.dump.XXXXXX") || exit 1
  trap 'rm -f "$temporary"' EXIT HUP INT TERM
  pg_dump --no-owner --no-acl -Fc -U "$POSTGRES_USER" "$POSTGRES_DB" -f "$temporary" || exit 1
  pg_restore --list "$temporary" > /dev/null || exit 1
  target="$BACKUP_DIR/infrascope_$(date -u +%Y%m%dT%H%M%SZ)_$(basename "$temporary" | cut -d. -f3).dump"
  mv "$temporary" "$target" || exit 1
  sha256sum "$target" > "$target.sha256" || exit 1
  date +%s > "$BACKUP_DIR/.last-success.tmp" || exit 1
  mv "$BACKUP_DIR/.last-success.tmp" "$BACKUP_DIR/last-success" || exit 1
  find "$BACKUP_DIR" -type f -name 'infrascope_*.dump*' -mtime +"$RETENTION" -delete
  echo "Database backup completed: $(basename "$target")"
)

case "${1:-}" in
  --health) health;;
  --loop)
    while true; do
      if backup_once; then sleep "$INTERVAL"; else echo "Database backup failed" >&2; sleep 60; fi
    done;;
  '') backup_once;;
  *) echo "Usage: postgres-backup.sh [--loop|--health]" >&2; exit 1;;
esac
