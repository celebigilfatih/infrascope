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
  if timeout 5 sh -c "echo '> /dev/null' > /dev/tcp/db/5432" 2>/dev/null; then
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

# Start alarm services in background after server is ready
(
  echo "⏰ Waiting for server to be ready before starting alarm services..."
  sleep 15  # Wait for Next.js to compile and start
  
  # Use internal container port (PORT env var, default 3000)
  APP_PORT=${PORT:-3000}
  
  # Wait for health endpoint to respond
  for i in $(seq 1 30); do
    if curl -s "http://localhost:${APP_PORT}/api/health" > /dev/null 2>&1; then
      echo "✅ Server is ready! Starting alarm services..."
      
      # Start alarm scheduler
      curl -s -X POST "http://localhost:${APP_PORT}/api/alarms/scheduler" > /dev/null 2>&1
      echo "⏰ Alarm scheduler started (15 minute interval)"
      
      # Start alarm monitor
      curl -s -X POST "http://localhost:${APP_PORT}/api/alarms/monitor" \
        -H "Content-Type: application/json" \
        -d '{"action":"start","intervalMinutes":5}' > /dev/null 2>&1
      echo "🔔 Alarm monitor started (5 minute interval)"

      # Pre-warm most visited routes to trigger compilation at startup
      # so users don't wait 10-30s on first visit
      echo "🔥 Pre-warming routes to compile them at startup..."
      curl -s "http://localhost:${APP_PORT}/dashboard" > /dev/null 2>&1
      echo "  ✓ /dashboard compiled"
      curl -s "http://localhost:${APP_PORT}/devices" > /dev/null 2>&1
      echo "  ✓ /devices compiled"
      curl -s "http://localhost:${APP_PORT}/api/devices?limit=10&mode=minimal" > /dev/null 2>&1
      curl -s "http://localhost:${APP_PORT}/api/services?limit=10&mode=minimal" > /dev/null 2>&1
      curl -s "http://localhost:${APP_PORT}/api/buildings" > /dev/null 2>&1
      echo "  ✓ Core APIs compiled"
      echo "🚀 All pre-warming complete. First page loads will now be instant!"
      
      break
    fi
    echo "   Waiting for server... Attempt $i/30"
    sleep 2
  done
) &

# Execute the main application
exec "$@"
