#!/bin/sh
# ============================================================================
# wait-for-db.sh
# Waits for PostgreSQL to be ready before proceeding
# Usage: ./wait-for-db.sh <host> <port>
# ============================================================================

HOST=${1:-db}
PORT=${2:-5432}
TIMEOUT=${3:-30}

echo "⏳ Waiting for PostgreSQL at $HOST:$PORT..."

counter=0
while [ $counter -lt $TIMEOUT ]; do
  # Use node to check TCP connectivity (works in both sh and bash)
  if node -e "var n=require('net').createConnection($PORT,'$HOST');n.setTimeout(1000);n.on('connect',function(){process.exit(0)}).on('error',function(){process.exit(1)}).on('timeout',function(){n.destroy();process.exit(1)})" 2>/dev/null; then
    echo "✅ PostgreSQL is ready!"
    exit 0
  fi

  counter=$((counter + 1))
  echo "   Attempt $counter/$TIMEOUT..."
  sleep 1
done

echo "❌ PostgreSQL failed to start within $TIMEOUT seconds"
exit 1
