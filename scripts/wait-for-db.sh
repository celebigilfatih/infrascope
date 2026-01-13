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
  if nc -z "$HOST" "$PORT" 2>/dev/null; then
    echo "✅ PostgreSQL is ready!"
    exit 0
  fi
  
  counter=$((counter + 1))
  echo "   Attempt $counter/$TIMEOUT..."
  sleep 1
done

echo "❌ PostgreSQL failed to start within $TIMEOUT seconds"
exit 1
