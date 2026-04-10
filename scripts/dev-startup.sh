#!/bin/bash
# Development startup script
# Ensures alarm services are running after Next.js starts

set -e

PORT=${PORT:-3000}
APP_URL="http://localhost:$PORT"
MAX_ATTEMPTS=60
ATTEMPT=0

echo "⏳ Waiting for development server to be ready..."

# Wait for server to respond
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  if curl -s "$APP_URL/api/health" > /dev/null 2>&1; then
    echo "✅ Server is ready!"
    break
  fi
  ATTEMPT=$((ATTEMPT + 1))
  echo "   Attempt $ATTEMPT/$MAX_ATTEMPTS - waiting for server..."
  sleep 1
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
  echo "❌ Server failed to start within timeout"
  exit 1
fi

echo ""
echo "🚀 Starting alarm services..."

# Start alarm scheduler
echo "⏰ Starting alarm scheduler..."
curl -s -X POST "$APP_URL/api/alarms/scheduler" \
  -H 'Content-Type: application/json' \
  -d '{}' > /dev/null 2>&1 && echo "   ✓ Scheduler started" || echo "   ⚠️ Scheduler start failed (may already be running)"

# Start alarm monitor
echo "🔔 Starting alarm monitor..."
curl -s -X POST "$APP_URL/api/alarms/monitor" \
  -H 'Content-Type: application/json' \
  -d '{"action":"start","intervalMinutes":5}' > /dev/null 2>&1 && echo "   ✓ Monitor started (5 min interval)" || echo "   ⚠️ Monitor start failed (may already be running)"

# Check health
HEALTH=$(curl -s "$APP_URL/api/health/alarms" | grep -o '"status":"[^"]*"' | head -1 || echo '"status":"unknown"')
echo ""
echo "📊 Alarm System Status: $HEALTH"
echo ""
echo "✨ Development environment ready!"
echo "   - API: $APP_URL/api"
echo "   - Dashboard: $APP_URL/dashboard"
echo "   - Health: $APP_URL/api/health"

# Keep this process alive so the container doesn't exit
# (next dev runs as a sibling process via &, container exits if this exits)
exec tail -f /dev/null
