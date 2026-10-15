# ADR-007: Durable device configuration backups

**Status:** Accepted
**Date:** 2026-10-15

## Context

Each customer runs an independent application, PostgreSQL database and NMS sidecar. Synchronous HTTP backups lose their operational state on disconnect, accept incomplete output and depend on the monitoring registry. Device deletion currently cascades into backup history.

## Decision

- Keep backups in the integrations/NMS context; use PostgreSQL as the durable queue, without another broker.
- Accept requests with HTTP 202. A unique active-device key and idempotency key prevent duplicate work. Workers use row locking, expiring leases, fenced completion and a session advisory lock per device. Only transient transport failures retry, with bounded backoff.
- Resolve credentials from the current database independently of SNMP polling. Use fixed platform profiles, bounded SSH reads and platform-aware output validation. Unsupported platforms/types fail explicitly; never substitute running configuration for startup configuration.
- Preserve encrypted artifacts and device-name snapshots when inventory devices are deleted (nullable relation, SET NULL). This changes the deletion contract and requires a forward migration. Archived backups remain accessible through the global endpoint.
- Use existing ADMIN/EDITOR/VIEWER roles: metadata and job status are readable by active users; ADMIN/EDITOR can create and read content; only ADMIN can delete artifacts or change schedules. Content access and worker outcomes are audited.
- Keep schedules and retention in per-device policies, disabled until explicitly configured. Retain at least the configured number of newest artifacts. Failure and overdue signals use the existing alarm registry and cooldown/auto-resolve mechanisms.
- Package the same NMS service for production and customer installs. Require a dedicated encryption key in production. Store database dumps in persistent storage and provide a separate encrypted recovery bundle containing the database and installation keys.
- Build application images without customer database settings. The singleton Prisma query middleware uses Next.js `unstable_noStore` to keep database-backed routes dynamic; a build-only syntactic URL permits module initialization, never a database connection or runtime fallback. Existing explicit service caches retain their contracts.

## Consequences

The browser does not own job lifetime. Restarts recover expired jobs, and stale workers cannot commit a result. PostgreSQL is required for scheduling and claim coordination. Platform fixtures are regression evidence, not hardware certification. Customers must provide routed SSH access and a compatible device account.

Deploy the migration and application before the NMS worker. Rollback stops workers and schedules first; do not reverse SET NULL or drop queue tables while archived artifacts or jobs exist. Database and keys must be recovered together. An installation recovery bundle remains local until the operator copies it to an independent destination.

## Related

- `docs/00-product/CONSTITUTION.md`
- `docs/20-modules/integrations/nms.md`
- `docs/30-runbooks/nms-backups.md`
