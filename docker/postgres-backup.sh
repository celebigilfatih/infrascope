#!/bin/bash
# ============================================================================
# PostgreSQL Backup Script
# Usage: docker compose exec db /usr/local/bin/backup-db.sh
# ============================================================================

set -e

BACKUP_DIR="/var/lib/postgresql/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/infrascope_backup_$TIMESTAMP.sql"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "📦 Starting PostgreSQL backup..."
echo "   Database: $POSTGRES_DB"
echo "   File: $BACKUP_FILE"

# Run pg_dump
pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$BACKUP_FILE"

# Compress the backup
gzip "$BACKUP_FILE"
BACKUP_FILE="$BACKUP_FILE.gz"

# Get file size
SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

echo "✅ Backup completed!"
echo "   Size: $SIZE"
echo "   Location: $BACKUP_FILE"

# Optional: Clean up old backups (keep last 7 days)
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete
echo "🧹 Cleaned up old backups"
