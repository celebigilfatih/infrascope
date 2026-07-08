# Port Mismatch Troubleshooting Guide

> **Problem:** Docker container `unhealthy`, 500 errors, or "address already in use" when starting the app.

---

## Root Cause

InfraScope uses **two-port architecture**:
- **Internal container port:** `3000` (Next.js binds to this inside Docker)
- **External host port:** `8170` (mapped via `docker-compose.yml` `ports: "8170:3000"`)

Health checks and internal API calls **must** use the internal port (`3000`), while browser access uses the external port (`8170`).

---

## Common Symptoms

### 1. Container Status: `unhealthy`
```bash
docker ps
# Output: infrascope-web-dev   Up 2 minutes (unhealthy)
```

**Cause:** Health check expects port 3000, but Next.js is listening on 8170 (or vice versa).

**Fix:**
```bash
# Check what port Next.js is actually listening on
docker exec infrascope-web-dev netstat -tlnp | grep node

# Check health check configuration
docker inspect infrascope-web-dev --format='{{.Config.Healthcheck.Test}}'
# Expected: [CMD curl -f http://localhost:3000/api/health/ready]

# Restart container to apply fixes
docker compose down && docker compose up -d
```

---

### 2. "Address already in use" Error
```bash
docker compose up -d
# Error: Ports are not available: listen tcp 0.0.0.0:8170: bind: address already in use
```

**Cause:** Zombie Node.js process from previous `npm run dev` session still holding port 8170.

**Fix:**
```bash
# Find the process using port 8170
lsof -i :8170
# Output: COMMAND   PID  USER   ...
#         node    12345  celebigil  ...

# Kill the process
kill -9 12345

# Now start Docker
docker compose up -d
```

---

### 3. 500 Internal Server Error
```bash
curl http://localhost:8170/
# Response: Internal Server Error
```

**Cause:** Database connection failed (Docker not running), or Next.js compiled with wrong port.

**Fix:**
```bash
# Check database container
docker ps --filter "name=db" --format "{{.Status}}"
# Expected: Up X minutes (healthy)

# Check web container logs
docker logs infrascope-web-dev --tail=50 | grep -i "error\|failed"

# If database is healthy, rebuild web container
docker compose down
docker compose build --no-cache web
docker compose up -d
```

---

## Prevention Checklist

### ✅ `package.json` Scripts

**BAD** (hardcoded port):
```json
{
  "scripts": {
    "dev": "PORT=8170 next dev -p 8170",
    "start": "next start -p 8170"
  }
}
```

**GOOD** (respects `PORT` env var):
```json
{
  "scripts": {
    "dev": "NEXT_TURBOPACK=1 next dev --turbo -p ${PORT:-3000}",
    "start": "next start -p ${PORT:-3000}"
  }
}
```

**Why:** Docker sets `PORT=3000` in `docker-compose.yml`. Hardcoded `8170` overrides it, causing health check mismatch.

---

### ✅ `docker-compose.yml` Port Mapping

```yaml
services:
  web:
    environment:
      PORT: 3000  # Internal container port
    ports:
      - "8170:3000"  # External:Internal mapping
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health/ready"]
      # Must use INTERNAL port (3000), not external (8170)
```

---

### ✅ Local Development (Outside Docker)

```bash
# Option 1: Use default port 3000
npm run dev
# Access: http://localhost:3000

# Option 2: Override port for consistency with Docker
PORT=8170 npm run dev
# Access: http://localhost:8170
```

---

### ✅ Entrypoint Script (`scripts/entrypoint.sh`)

The entrypoint already uses `$PORT` correctly:
```bash
APP_PORT=${PORT:-3000}  # Default to 3000 if not set

# Wait for readiness endpoint
curl -s "http://localhost:${APP_PORT}/api/health/ready"

# Start alarm scheduler
curl -s -X POST "http://localhost:${APP_PORT}/api/alarms/scheduler"
```

**Do NOT hardcode** `8170` here — it breaks Docker health checks.

---

## Quick Diagnostic Commands

```bash
# 1. Check container health status
docker ps --filter "name=infrascope-web" --format "table {{.Names}}\t{{.Status}}"

# 2. View health check configuration
docker inspect infrascope-web-dev --format='{{.Config.Healthcheck.Test}}'

# 3. Check what port Next.js is listening on
docker exec infrascope-web-dev ss -tlnp | grep node

# 4. Test health endpoint from inside container
docker exec infrascope-web-dev curl -s http://localhost:3000/api/health | jq

# 5. Test health endpoint from host
curl -s http://localhost:8170/api/health | jq

# 6. Find zombie processes holding ports
lsof -i :8170
lsof -i :3000

# 7. View container logs for errors
docker logs infrascope-web-dev --tail=100 | grep -E "Error|error|failed"

# 8. Restart with clean state
docker compose down
docker compose build --no-cache web
docker compose up -d
```

---

## Port Reference Table

| Context | Port | Used By |
|---------|------|---------|
| **Internal (container)** | `3000` | Next.js, health checks, alarm scheduler, alarm monitor |
| **External (host)** | `8170` | Browser access, `curl` from host, Postman |
| **Database (internal)** | `5432` | PostgreSQL (container-to-container) |
| **Database (external)** | `5434` | Local `psql` debugging |
| **NMS (internal)** | `8500` | NMS Python sidecar (container) |
| **NMS (external)** | `8500` | Host debug access |

---

## Common Mistakes

### ❌ Hardcoding port in `package.json`
```json
"dev": "PORT=8170 next dev -p 8170"  # Breaks Docker
```

### ❌ Using external port in health check
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8170/api/health/ready"]  # Wrong!
```

### ❌ Hardcoding port in entrypoint
```bash
curl -s http://localhost:8170/api/health/ready  # Breaks when PORT=3000
```

### ❌ Forgetting to kill zombie processes
```bash
# Always check for port conflicts before starting Docker
lsof -i :8170
kill -9 <PID>
docker compose up -d
```

---

## Related Files

- `package.json` — dev/start scripts
- `docker-compose.yml` — port mapping + health check
- `docker-compose.prod.yml` — production port mapping
- `scripts/entrypoint.sh` — startup script (uses `$PORT`)
- `next.config.js` — Next.js configuration

---

## ADR Reference

See [ADR-004: Port Mapping Strategy](../10-architecture/adr/ADR-004-port-mapping-strategy.md) for architectural decisions on port management.

---

## Last Updated

**Date:** 2026-02-17  
**Author:** InfraScope Team  
**Status:** Active
