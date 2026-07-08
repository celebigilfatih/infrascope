#!/bin/sh
# ============================================================================
# entrypoint.sh
# Container entrypoint - Runs database migrations and starts the application
# ============================================================================

set -e

echo "🚀 InfraScope Container Starting..."

if [ "$NODE_ENV" = "production" ]; then
  if [ -z "$NEXTAUTH_SECRET" ] || echo "$NEXTAUTH_SECRET" | grep -q "^change-me"; then
    echo "❌ NEXTAUTH_SECRET is missing or uses a placeholder value."
    exit 1
  fi

  if echo "$DATABASE_URL" | grep -q "infrascope-prod"; then
    echo "❌ DATABASE_URL contains the default production password placeholder."
    exit 1
  fi

  if [ "$NODE_TLS_REJECT_UNAUTHORIZED" = "0" ]; then
    echo "❌ NODE_TLS_REJECT_UNAUTHORIZED=0 is forbidden in production. Configure CA certificate paths instead."
    exit 1
  fi

  for insecure_var in FORTIANALYZER_TLS_INSECURE FORTIGATE_TLS_INSECURE VMWARE_TLS_INSECURE; do
    insecure_value=$(printenv "$insecure_var" || true)
    if [ "$insecure_value" = "true" ] || [ "$insecure_value" = "1" ] || [ "$insecure_value" = "yes" ]; then
      echo "❌ ${insecure_var}=${insecure_value} is forbidden in production. Configure the matching *_TLS_CA_CERT_PATH instead."
      exit 1
    fi
  done
fi

# Wait for database to be ready
echo "📍 Waiting for database to be ready..."
DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_READY=0
for i in $(seq 1 30); do
  if node -e "var n=require('net').createConnection(${DB_PORT},'${DB_HOST}');n.setTimeout(2000);n.on('connect',function(){process.exit(0)}).on('error',function(){process.exit(1)}).on('timeout',function(){n.destroy();process.exit(1)})" 2>/dev/null; then
    echo "✅ Database is ready!"
    DB_READY=1
    break
  fi
  echo "   Attempt $i/30..."
  sleep 1
done

if [ "$DB_READY" != "1" ]; then
  echo "❌ Database did not become ready at ${DB_HOST}:${DB_PORT}."
  exit 1
fi

# Run database migrations
echo "📋 Running Prisma migrations..."
npx prisma migrate deploy

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
