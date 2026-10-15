#!/usr/bin/env bash
# Create a portable, authenticated recovery bundle. Copy it off this host.
set -euo pipefail
umask 077
cd "$(dirname "$0")"
: "${INFRASCOPE_RECOVERY_PASSPHRASE_FILE:?Set a path to a private passphrase file (at least 16 bytes)}"
test -r "$INFRASCOPE_RECOVERY_PASSPHRASE_FILE"
mkdir -p backups
chmod 700 backups
name="infrascope-$(date -u +%Y%m%dT%H%M%SZ)-$$"
dump="backups/.${name}.dump"
material="backups/.${name}.installation"
mkdir -m 700 "$material"
cleanup() {
  rm -f "$dump" "$material/environment.env" "$material/machine-id" "$material/license.json"
  rmdir "$material"
}
trap cleanup EXIT HUP INT TERM
cp .env "$material/environment.env"
if [ -f data/machine-id/machine-id ]; then cp data/machine-id/machine-id "$material/machine-id"; fi
if [ -f data/license-cache/license.json ]; then cp data/license-cache/license.json "$material/license.json"; fi
docker compose exec -T postgres sh -c 'pg_dump -Fc --no-owner --no-acl -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$dump"
docker compose exec -T nms python -m nms_service.recovery create \
  --dump "/recovery/.${name}.dump" --installation-dir "/recovery/.${name}.installation" \
  --output "/recovery/${name}.isbackup" < "$INFRASCOPE_RECOVERY_PASSPHRASE_FILE"
if [ -n "${INFRASCOPE_RECOVERY_DESTINATION:-}" ]; then
  test -d "$INFRASCOPE_RECOVERY_DESTINATION"
  cp "backups/${name}.isbackup" "$INFRASCOPE_RECOVERY_DESTINATION/"
fi
echo "Recovery bundle created: backups/${name}.isbackup"
echo "Keep the passphrase separately and copy the bundle to independent storage."
