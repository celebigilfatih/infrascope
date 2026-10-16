# ADR-015: VMware Python Collection Contract

**Status:** Accepted  
**Date:** 2026-10-16  
**Scope:** Audit B08; completes the source-error boundary reserved by ADR-014.

## Decision

Keep REST, SOAP and PyVmomi as complementary sources. Route all Python collection through one asynchronous, bounded, shell-free process bridge. Select fixed repository-relative scripts internally and send profile, VM identity and TLS policy through versioned stdin JSON, never command arguments. Validate success envelopes and item shapes; only an explicit successful empty array establishes absence. Missing runtime/SDK/script, malformed output, denied access, TLS errors, timeout and incomplete host enrichment are unavailable sources, not empty inventory.

Use the existing VMware TLS policy for both Node and Python, including the configured CA bundle and production insecure-policy rejection. Python independently rejects production bypass and verifies certificate chains and hostnames. The legacy thumbprint field remains metadata; it is not certificate pinning. Require explicit cleanup of SDK views/sessions and bounded process/output handling. Do not include helper stdout, stderr, command details or raw exception messages in user errors or logs.

Connection testing first checks the actual Python/SDK capability, then authenticates REST and exercises the same host and uncached snapshot loaders using the entered credentials. It reports `connected: false` with a safe actionable error if any required path fails and closes its owned REST session. Preserve the UI's existing connected/version/error response contract. Normal REST status remains a transport status and is not a full collection certification.

Host hardware collection becomes required for enriched inventory: failing the source explicitly is preferable to silently claiming zero CPU/memory. Match enrichment by host MoRef, not display name, and propagate failures through VM host mapping, recent-snapshot aggregation, dashboard and existing alarm error handling. Do not create another alarm engine, redefine unrelated SOAP best-effort behavior or expand into session/encryption redesign.

Declare the pinned Python/SDK dependency and package helper files in production and development runtime recipes. This is the application's runtime capability contract, not a broader Docker redesign. No schema, migration or Node package upgrade is needed.

## Validation

Exercise the real process bridge, Python protocol/TLS boundary, service, API cache and existing alarm evaluator with synthetic fixtures. No customer system, database or notification recipient is required. Record actual verification results and remaining limits after the implementation.

### Verification status (2026-10-16)

Base commit `816e6036fea121be4402fcdc81a68aaadda7331e`, with existing uncommitted B01–B07, dashboard and incident collaboration work preserved. Before the change, a real-service reproduction failed because a helper exception resolved to an empty list instead of rejecting. The final collection suite passes that reproduction and the legitimate empty-success control.

Executed 65 Node collection scenarios, 18 Python tests, all 52 B07 cache scenarios and the existing B01–B06 occurrence/source/dispatch/authorization/authentication/cache/health suites successfully. Python checks include actual pinned SDK import preflight, missing-SDK execution, local certificate/hostname validation and real SmartConnect login/logout against a loopback-only synthetic SOAP server. No customer vCenter or database was used.

Strict TypeScript and the production TLS check passed. Lint comparison adds zero diagnostics; existing route/service diagnostics decreased from 34 to 29, and the new bridge/TLS export has none. Workflow YAML and the required SDK/helper packaging declarations were checked; this does not constitute a newly built production image or a hosted CI run. Changes introduce no schema migration, Node dependency upgrade, process restart, commit or push.

The independent boundary investigation and one fresh candidate review found no surviving shell/TLS bypass. Verification details are recorded in the task's managed B08 validation report. The retained report is supplemental; this ADR and the runbook define the repository's runtime contract.

### Limits

No live customer interoperability test, full Next build, full-repository lint, production image build/publish or deployment was performed. Per-company trust/permissions still require the customer's real CA and account to pass the full connection test. Existing stale-cache bounds and unrelated SOAP/event best-effort paths remain as documented in ADR-014. Force-killing a timed-out SDK process cannot guarantee remote logout or cancel an operation already accepted by vCenter. General VMware shared-session/backoff and credential-persistence redesign remain outside B08.
