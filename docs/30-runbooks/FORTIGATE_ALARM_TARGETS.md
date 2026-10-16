# FortiGate Alarm Targets

**Scope:** B10, direct SSL-VPN rules in the existing engine. No customer credentials or raw source sessions belong in tickets.

## Expected Behavior

Each enabled FortiGate integration contributes one alarm target using its saved VDOM, default `root`. Multiple enabled configurations must not require selecting a single global firewall. The engine resolves each explicit configuration through the shared factory every cycle. It does not enumerate appliance VDOMs, override disabled profiles, or choose the first configuration. Configurations on the same management host can have different credentials and VDOMs.

For per-user rules, cooldown identity includes target and username. Business-hours aggregation retains a target-wide cooldown. Incident grouping and email cooldowns must not cross targets. The same source session is recorded once even when counters change or the evaluation cooldown expires. A new session after cooldown may add an occurrence to its own incident. Whitelist, notification preferences and global delivery limits remain in effect.

## Diagnosis

1. Inspect enabled FortiGate integration IDs and saved VDOM metadata without printing configuration secrets. Check that each intended VDOM has its own configured target. UI browsing a different VDOM does not change the saved alarm scope.
2. Use the authorized manual alarm check (POST `/api/alarms/check`) or wait for the normal scheduler. GET is not a trigger. The watchdog uses the same runner.
3. Compare `triggered[].target` and `errors[].target`: configuration ID, normalized VDOM and target key identify the rule evaluation. Resolution failures may identify only `configId`. Overall totals count target/rule evaluations rather than distinct rule definitions. A target failure produces a `PARTIAL` check while successful targets continue.
4. A missing/disabled optional source is skipped; an explicit required-source action with enabled rules reports missing configuration. Authentication, malformed replies, decryption or persistence failures are errors, not valid empty user lists. Resolve the failing target's actual source error and confirm a subsequent successful check; retain earlier history.
5. Review target context in occurrence evidence and notification content. Display usernames remain readable; incident entity IDs carry the scope. Do not rewrite old incident/entity IDs or assign ambiguous legacy sessions to a guessed target.

The first check after upgrading can create a new scoped incident for an active session previously recorded without target identity. That is an explicit transition limitation; historical records are preserved. Single-target profiles and unlinked legacy configurations remain valid. Source-specific request/session lifecycle limits and other audit findings are not changed here.

## Safe Verification

```text
npm run test:fortigate-alarm-targets
npm run test:alarm-dispatch
npm run test:alarm-occurrences
npm run test:alarm-sources
npm run test:alarm-health
npm run security:fortigate-connector-check
npm run type-check
```

The target suite runs the real factory, FortiGate REST serializer, existing evaluator, recording service, manual route and scheduler interval with synthetic configuration, source transport and persistence. A separate case runs the real email cooldown/template code with a fake SMTP transporter and attempt recorder. No application ENV file, customer device, database or recipient is needed.

`npm run test:fortigate-alarm-targets:db` additionally requires `INFRASCOPE_FG_ALARM_DB_TEST=1` and a `DATABASE_URL` pointing at `127.0.0.1` with a dedicated `*_occurrence_tests` database. Use a fresh disposable database migrated from the repository; never the installation DB. Transport and SMTP remain synthetic. CI uses its own PostgreSQL service and opt-in. The suite exercises real relation filters, incident/event uniqueness, transaction behavior, replay and five concurrent checks. Local test evidence and limits are recorded in [ADR-017](../10-architecture/adr/ADR-017-fortigate-alarm-target-scope.md).
