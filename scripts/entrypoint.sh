#!/bin/sh
# ============================================================================
# entrypoint.sh
# Container entrypoint - Runs database migrations and starts the application
# ============================================================================

set -e

echo "🚀 InfraScope Container Starting..."

# Wait for database to be ready
echo "📍 Waiting for database to be ready..."
./scripts/wait-for-db.sh "${DB_HOST:-db}" "${DB_PORT:-5432}" 30

# Run database migrations
echo "🗄️ Running Prisma migrations..."
if ! npx prisma migrate deploy; then
  echo "⚠️ Migration warning - continuing..."
fi

# Generate Prisma client to ensure it matches the runtime environment
echo "💎 Generating Prisma client..."
npx prisma generate

# Seed database if in development
if [ "$NODE_ENV" = "development" ]; then
  echo "🌱 Seeding database with sample data..."
  if [ -f "prisma/seed.ts" ]; then
    npx ts-node prisma/seed.ts || echo "⚠️ Seed script not available - skipping"
  fi
fi

echo "✅ Database ready!"
echo "🌐 Starting Next.js application on port $PORT..."

# Execute the main application
exec "$@"
