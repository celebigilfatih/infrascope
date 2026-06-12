#!/bin/sh
# ============================================================================
# entrypoint.sh
# Container entrypoint - Runs database migrations and starts the application
# ============================================================================

set -e

echo "🚀 InfraScope Container Starting..."

# Wait for database to be ready
echo "📍 Waiting for database to be ready..."
for i in $(seq 1 30); do
  if node -e "var n=require('net').createConnection(5432,'db');n.setTimeout(2000);n.on('connect',function(){process.exit(0)}).on('error',function(){process.exit(1)}).on('timeout',function(){n.destroy();process.exit(1)})" 2>/dev/null; then
    echo "✅ Database is ready!"
    break
  fi
  echo "   Attempt $i/30..."
  sleep 1
done

# Run database migrations
echo "📋 Running Prisma migrations..."
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

# Alarm services + pre-warming handled by dev-startup.sh
exec "$@"
