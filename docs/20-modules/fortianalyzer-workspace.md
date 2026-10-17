# FortiAnalyzer settings workspace

The workspace separates DB-only saved metadata, explicit saved-secret/entered-secret connection probes and the existing process-local event collector's observation. Opening this page does not authenticate or start a collector. Multiple profiles require selection; the existing collector still uses one enabled source, rather than becoming a multi-target alarm engine.

## Read and write contracts

GET /api/integrations/fortianalyzer/workspace is dynamic, uses the shared current ACTIVE settings/read guard and returns private/no-store. It exposes secret presence flags, never passwords, keys, encrypted envelopes, internal revisions or raw diagnostics. Collector status is returned only when its revision matches the exact persisted profile; absent status remains unknown, including when another process owns collection.

Save targets the immutable configId, requires the observed updatedAt and uses an atomic compare-and-set over version/configuration/enabled/interval. Stale/concurrent edits return 409 without resetting backoff or rebinding the collector. The form retains its draft and asks for undo/refresh. An existing profile prevents untargeted first creation; competing first creations cannot overwrite each other. Legacy settings endpoints remain available and are unchanged.

An ADOM-only edit can preserve the same principal's encrypted secret. Changed host, session username or auth mode requires an entered secret. Switching modes removes inactive credentials; the legacy accessToken alias is read and canonical encrypted apiKey is written. Other configuration metadata, profile name, enabled state and schedule interval survive. Authority/ADOM/masked-secret validation runs before source access or persistence. Existing account-scoped backoff recovery and revision-based collector invalidation run only after a successful save; an already active collector may rebind asynchronously. Saving is not a connection test.

## Probes and collector semantics

Both probes use the existing centralized FortiAnalyzerService.testConnection path, including bounded ephemeral session ownership and selected-ADOM device access. Saved probes resolve the selected server-side secret. Draft probes require the entered secret and do not save it. Failed probes remain explicit failures; malformed/wrong-target responses cannot imply health. Evidence is labelled with target, ADOM, scope and time. Draft edits retire draft-test evidence. Authentication failures can influence the existing account backoff; no new protocol or retry loop is introduced.

Collector metadata is process-local, not a persistent sync history. lastSyncTime means at least one log type succeeded, rather than complete coverage or the latest successful attempt. Freshness requires all seven types; failed types, consecutive incomplete cycles and the 5–60 minute planning delay are shown separately. The delay is not a countdown. Missing state/count/time is never zero or success. Dirty forms prevent target changes/refresh until save/undo; stale reads disable mutations. Uncertain saves block retry until successful explicit refresh. UI timeout does not cancel already issued server/source work.

## Verification

npm run test:fortianalyzer-workspace runs actual route/profile/encryption/revision and transport contracts using synthetic adapters. Existing authentication, profile (including actual TSX handlers), cache and UTC suites remain in use. The focused fortianalyzer-workspace.spec.ts runs against a dedicated disposable PostgreSQL application, with no external network route; browser probe replies are synthetic, while settings writes and current-identity denials use actual routes. Tests cover concurrent edits/creation, secret migration, profile isolation, role/status changes, uncertainty and responsive views. Existing opt-in cache/profile/time database checks run separately in an empty loopback-only fixture database. See design-qa.md for executed results and limits; no live appliance compatibility is claimed.
