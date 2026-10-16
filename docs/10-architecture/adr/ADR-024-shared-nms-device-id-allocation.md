# ADR-024: Shared transactional NMS device ID allocation

Status: Accepted
Date: 2026-10-16
Related: Audit B17

## Context

Firewall onboarding already uses `reserveNextNmsDeviceId` with a PostgreSQL transaction advisory lock. Legacy NMS enablement and discovery import independently compute MAX + 1 without that lock, so concurrent requests can select the same integer and fail uniqueness. Checks outside the lock also allow repeated enable/import requests to replace an already assigned identity. Discovery's imported marker is currently committed separately from the inventory update.

## Decision

All three allocating entry points use the existing `lib/nms/device-id.ts` helper and its unchanged advisory key. Acquire its transaction lock before eligibility/duplicate checks in legacy enablement and discovery import; persist the reserved integer before returning from that same transaction. Re-read inventory/discovery state under the lock so a repeated request returns the existing 409/404 contract instead of overwriting the winner. Discovery inventory mutation and imported marker commit or roll back together.

Use explicit ReadCommitted isolation in all three writer transactions. After waiting for the advisory lock, the MAX query and eligibility reads must see the preceding transaction's commit even if a customer database has a different default isolation level. The unique `Device.nmsDeviceId` constraint remains the final integrity boundary. Calculate MAX + 1 as bigint, validate the positive PostgreSQL integer range and reject missing/invalid allocator results; never guess an identifier after an allocator failure.

Return an integer sentinel from the advisory-lock SELECT rather than its native void column. Isolated PostgreSQL reproduced Prisma 5.22 `P2010` on the original direct SELECT of `pg_advisory_xact_lock`; the sentinel keeps the same lock semantics while allowing successful deserialization.

Input validation, secret encryption, authorization, HTTP success payloads and firewall probe-after-commit behavior remain in their existing owners. No network polling/probe runs while holding the ID lock. Do not introduce a new allocator, process-local mutex, retry that hides uniqueness failures, sequence/table migration or alarm engine.

## Consequences and verification

IDs are reserved only by the enclosing write transaction, not permanently consumed by the helper. Rollback releases the lock and permits retry. MAX-based reuse after removal remains the existing policy; historical backup ownership is a separate contract. Out-of-band writers that bypass this helper are not certified.

Verify actual routes with synthetic dependencies and isolated PostgreSQL: legacy/legacy, legacy/firewall, discovery/legacy/firewall concurrency, repeated device/import requests, rollback at each write boundary, lock release, preserved credentials/response shape, denied/invalid requests and allocator bounds. Use a repeatable-read-default fixture database to verify explicit ReadCommitted writer transactions. No installation schema/data migration is required.
