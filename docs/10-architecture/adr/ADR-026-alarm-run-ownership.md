# ADR-026: Atomic alarm-run ownership and cancellation

**Status:** Accepted  
**Date:** 2026-10-16

## Decision

Audit B19 identified a read/create race in the runner, unsafe startup orphan cleanup, uncancelled timeout continuations and duplicate retention startup timers. Keep the existing runner/engine. Use a short PostgreSQL advisory transaction lock to atomically claim a versioned owner lease in the existing unique SystemConfig key and create its RUNNING log. Use database time, a 12-minute lease and a 10-minute execution deadline. Database claim failures fail closed. Startup only reconciles expired ownership and old legacy RUNNING rows; it cannot orphan another live owner.

An AsyncLocalStorage execution scope propagates cancellation and the owner fence through the existing engine, incident and notification paths. A scoped Prisma facade checks cancellation before/after reads and guards mutations/transactions with the same DB ownership lock, validating again before commit. Calls outside a runner scope keep their current behavior. Cancelled or superseded continuations cannot start new mutations or notifications. Finalization/release is owner-checked and cannot overwrite a successor's state. A busy request returns a busy result rather than a previous successful result.

FortiAnalyzer source searches combine run cancellation with their existing source signal. Shared background cache collection is explicitly detached from the finite run scope: cancelling a check must not poison a process-wide collector or its recurring timers. Its existing configuration revision/shared initialization promise remains authoritative. Sources that do not expose cancellation may finish their already-issued bounded read, but its continuation is fenced. SMTP already handed to a server and a transaction already committing cannot be recalled; do not claim exactly-once external delivery or rollback of previously committed effects.

Guard the retention startup timeout as well as its recurring timer, and provide stop/restart cleanup. The scheduler delegates orphan reconciliation to the owner-aware runner. No new alarm engine, schema migration, dependency or customer data rewrite is introduced. Deploy all workers together; old binaries do not implement the new ownership fence.

## Verification

The manual VMware action shares ownership with full checks. Its SOURCE-prefixed completion status cannot establish full-source health recovery or keep the full-run watchdog alive. Search-stage deadlines fence only their child continuations; runner cancellation also covers finalization, retry processing and health notifications.

Use deterministic timers and synthetic I/O for overlap, failed claims, cancellation, late source results, stale finalization, startup/stop/restart and cache isolation. Use a disposable PostgreSQL database for independent-client claims, crash expiry, transaction rollback and owner fencing. Retain surrounding occurrence, dispatch, source, cache and health regressions. See `docs/30-runbooks/ALARM_RUN_OWNERSHIP.md` for actual results and operational limits.
