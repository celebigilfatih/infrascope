# VMware Cache Refresh

**Scope:** B07 target isolation and response freshness. No source operation is necessary to read this runbook.

## Expected Behavior

Authorized inventory reads resolve the enabled saved VMware profile before cache access. `X-Cache: MISS` means a live load, `HIT` means a fresh cached response and `STALE` means an older response with asynchronous source revalidation. `X-Cache-Age` is seconds since successful collection, rounded as before. Inventory freshness is five minutes; snapshot HTTP freshness is two minutes. Stale responses remain usable for thirty additional minutes, then the request must load live data or report failure. A failed refresh does not reset age; the next read may retry.

Different host, credentials, thumbprint or module settings select separate cache profiles. A successful save invalidates the affected old/new profiles, including pending writes. The first subsequent read is live. A successful snapshot mutation also invalidates its profile. An installation with disabled/deleted settings cannot serve its earlier cached data.

## Investigation

1. Inspect only status and `X-Cache`/`X-Cache-Age` headers in the browser's network panel; do not copy authorization headers or response inventories into tickets.
2. Check that the saved integration is enabled and points at the intended vCenter. Do not disclose its credentials. A fresh cache hit does not retest source authentication on every read.
3. After freshness expires, `STALE` should be followed by a later `HIT` with a smaller age after successful refresh. Refresh uses source authentication directly; no sessionless request to the application's own endpoint should appear.
4. Repeated `STALE` with increasing age and the fixed background refresh failure log means refresh did not complete successfully. After the stale window, source authentication failure is HTTP 401 and thrown collection failure is HTTP 500. Normal application session/permission checks still run first.
5. B08 now propagates snapshot/helper failures instead of returning an empty list. Cold helper failures use HTTP 503 and timeouts 504; the full POST connection test checks runtime, REST, host and snapshot collection. Ordinary REST status alone remains narrower. See [collection diagnostics](VMWARE_PYTHON_COLLECTION.md).

## Safe Regression Check

`npm run test:vmware-cache` executes real service, cache and route code with synthetic credentials/hosts, mocked source transport/ORM and deterministic time. It does not load application environment files, contact vCenter, launch helpers, modify a database or deliver notifications. Use the installed dependencies; no upgrade or schema change is required. ADR-014 records the actual isolated runtime and verification outcomes.

Caches are process-local. Normal code rollout loads the new cache namespace; legacy unscoped entries are never read by it. An explicit runtime restart was not performed during this fix. Cross-process mutation invalidation and the existing shared VMware session lifecycle are outside this change.
