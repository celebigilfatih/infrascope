# ADR-004: Port Mapping Strategy

**Status:** Accepted  
**Date:** 2026-02-17  
**Deciders:** InfraScope Team  
**Category:** Infrastructure  
**Supersedes:** N/A

---

## Context

InfraScope runs Next.js in Docker containers with a two-port architecture:
- Internal container port (Next.js binding)
- External host port (browser access)

Previous implementation hardcoded `PORT=8170` in `package.json`, causing:
1. Docker health check failures (expected port 3000, got 8170)
2. `unhealthy` container status
3. 500 Internal Server Error on API calls
4. "Address already in use" conflicts with zombie processes

---

## Decision

**Adopt environment-variable-driven port mapping with sensible defaults:**

### 1. `package.json` Scripts

All port references use `${PORT:-3000}` to respect environment variables:

```json
{
  "scripts": {
    "dev": "NEXT_TURBOPACK=1 next dev --turbo -p ${PORT:-3000}",
    "start": "next start -p ${PORT:-3000}"
  }
}
```

**Rationale:** Allows Docker to inject `PORT=3000` while local development can override.

---

### 2. `docker-compose.yml` Port Mapping

```yaml
services:
  web:
    environment:
      PORT: 3000  # Internal container port
    ports:
      - "8170:3000"  # External:Internal mapping
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health/ready"]
      interval: 60s
      timeout: 5s
      retries: 3
      start_period: 60s
```

**Rationale:** Health checks must use internal port (3000), not external (8170).

---

### 3. Entrypoint Script (`scripts/entrypoint.sh`)

```bash
APP_PORT=${PORT:-3000}

# Wait for readiness endpoint
curl -s "http://localhost:${APP_PORT}/api/health/ready"

# Start alarm scheduler
curl -s -X POST "http://localhost:${APP_PORT}/api/alarms/scheduler"
```

**Rationale:** Entrypoint must respect container's internal port, never hardcode.

---

## Port Reference Table

| Context | Port | Used By |
|---------|------|---------|
| **Internal (container)** | `3000` | Next.js, health checks, alarm scheduler |
| **External (host)** | `8170` | Browser access, `curl` from host |
| **Database (internal)** | `5432` | PostgreSQL (container-to-container) |
| **Database (external)** | `5434` | Local `psql` debugging |
| **NMS (internal)** | `8500` | NMS Python sidecar |
| **NMS (external)** | `8500` | Host debug access |

---

## Consequences

### Positive

✅ **Health checks pass** — Container status: `healthy`  
✅ **No port conflicts** — Zombie processes cleaned before `docker compose up`  
✅ **Flexible local dev** — Developers can override `PORT` for consistency  
✅ **Clear separation** — Internal vs external ports documented  
✅ **Prevents 500 errors** — Next.js binds to expected port  

### Negative

⚠️ **Learning curve** — Developers must understand two-port model  
⚠️ **Debugging complexity** — Must check both internal/external ports  

---

## Implementation Checklist

- [x] Update `package.json` scripts to use `${PORT:-3000}`
- [x] Update `docker-compose.yml` health check to use port 3000
- [x] Update `scripts/entrypoint.sh` to use `$PORT` variable
- [x] Create troubleshooting runbook (`docs/30-runbooks/PORT_MISMATCH_TROUBLESHOOTING.md`)
- [x] Document port mapping strategy (this ADR)
- [ ] Add CI check to prevent hardcoded ports in `package.json`

---

## Testing

### Verify Port Alignment

```bash
# 1. Start containers
docker compose up -d

# 2. Check health status
docker ps --filter "name=infrascope-web" --format "{{.Status}}"
# Expected: Up X minutes (healthy)

# 3. Test internal health endpoint
docker exec infrascope-web-dev curl -s http://localhost:3000/api/health/ready | jq
# Expected: {"status":"ready",...}

# 4. Test external access
curl -s http://localhost:8170/api/health/ready | jq
# Expected: {"status":"ready",...}

# 5. Verify Next.js binding
docker exec infrascope-web-dev ss -tlnp | grep node
# Expected: LISTEN 0 0 *:3000 *:*
```

---

## Alternatives Considered

### Option A: Hardcode PORT=8170 Everywhere

**Pros:** Simple, consistent  
**Cons:** Breaks Docker health checks, inflexible  
**Decision:** Rejected ❌

---

### Option B: Use Same Port Internally and Externally

```yaml
ports:
  - "8170:8170"  # Same port
```

**Pros:** No port translation confusion  
**Cons:** Conflicts with standard Next.js port 3000, breaks existing setups  
**Decision:** Rejected ❌

---

### Option C: Environment-Variable-Driven (Chosen)

**Pros:** Flexible, Docker-friendly, prevents conflicts  
**Cons:** Requires understanding of two-port model  
**Decision:** Accepted ✅

---

## Related Documents

- [PORT_MISMATCH_TROUBLESHOOTING.md](../30-runbooks/PORT_MISMATCH_TROUBLESHOOTING.md) — Diagnostic guide
- [CONSTITUTION.md](../00-product/CONSTITUTION.md) — İlke #10: Singleton pattern (applies to port management)
- [OVERVIEW.md](../10-architecture/OVERVIEW.md) — System architecture

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-17 | InfraScope Team | Initial ADR after port conflict incident |
