# VMware Saved-Source Health

**Scope:** B12, `/api/health` VMware source selection and the shared saved-profile resolver. No customer credentials belong in diagnostic output.

## Expected Behavior

The health route uses the enabled saved `VMWARE_VCENTER` profile, not `VMWARE_HOST/USERNAME/PASSWORD`. The loader/factory is shared by operational VMware reads and alarm initialization. Selection is creation time then configuration ID; this preserves a deterministic first-enabled model, not aggregation of multiple vCenters. Review enabled profiles if several are configured. A selected profile failure must never be hidden by trying another profile or old ENV credentials.

Saved host normalization, exact username/password, thumbprint/profile fields and the existing TLS policy reach the same VMware client implementation. This change does not add certificate pinning or migrate credential storage. Health exposes only `target.configId` and sync metadata from that record. No previous check's metadata is reused when configuration changes, and unknown sync time/status remains explicit null.

Each request owns its lightweight REST status session. Successful modern and legacy sessions close at their corresponding endpoint. The VMware branch observes a five-second configuration/probe deadline, followed by up to one second of independent cleanup. Fetch and body reads receive cancellation. A late database result cannot start source I/O. Prisma observer timeouts do not cancel the underlying SQL query; a login accepted remotely without returning a token before abort may still require source-side session expiry. Cleanup failure is reported, not presented as a closed healthy session.

Health does not call Python/PyVmomi, sync inventory, retry notifications, start workers or warm collection caches. A successful probe establishes the saved target's REST connectivity/authentication. It does not prove collector permissions or Python capability. Use the existing B08 connection-test workflow for collection verification. A version endpoint that denies access can still leave an authenticated connection healthy with no version value.

## Diagnosis

| Code | Action |
|---|---|
| `VMWARE_HEALTH_NOT_CONFIGURED` | No enabled saved source; VMware status is unknown. Enable/configure the intended profile through the existing settings workflow. Old ENV credentials do not activate it. |
| `VMWARE_HEALTH_CONFIGURATION_INVALID` | Correct incomplete/malformed host, credentials or profile fields in the selected saved configuration. No source request was made. Do not print the saved JSON. |
| `VMWARE_HEALTH_CONFIGURATION_UNAVAILABLE` | Investigate configuration-store availability. This is unhealthy, not an absent-profile result. No ENV fallback occurs. |
| `VMWARE_HEALTH_UNAVAILABLE` | Check the selected source's connectivity, credentials, TLS policy and source response. The public error is sanitized. Confirm `target.configId` before changing settings. |
| `VMWARE_HEALTH_TIMEOUT` | Check DB/source latency and stalled body reads. The VMware deadline includes configuration lookup, authentication and version parsing; other datasources retain their own budgets. |
| `VMWARE_HEALTH_CLEANUP_FAILED` | The primary probe succeeded but its owned session could not be closed. Inspect DELETE permissions/reachability and source session expiry. If the primary probe already failed, its code is retained with `sessionCleanupFailed: true`. |

Read `datasources.vmware.status`, target, duration and sync metadata together. A healthy REST probe does not change failed sync history; a source failure does not rewrite alarm-check rows. Existing overall health aggregation remains: one unhealthy datasource contributes degradation, while additional failures or stopped background services may make overall health unhealthy. An absent/disabled optional VMware source does not itself count as unhealthy.

## Safe Regression Checks

```text
npm run test:vmware-health
npm run test:vmware-cache
npm run test:vmware-collection
npm run test:alarm-dispatch
npm run test:alarm-health
npm run type-check
```

The health suite executes the actual route, saved-source resolver, VMware REST client and owned cleanup against synthetic ORM/transport and virtual deadlines. It verifies absent/disabled/changed/invalid profiles, obsolete ENV credentials, exact source headers, API/alarm resolver agreement, metadata ownership during concurrent changes, modern/legacy auth/cleanup, malformed replies, storage/transport failures, body deadlines, cancellation, late-result suppression, cleanup failures, no collection side effects and public-result redaction. It never loads application ENV files, connects to customer systems or writes installation data.

CI includes the suite, but hosted CI execution and live vCenter verification are separate from the recorded local checks. Local commands, actual results and remaining limits are in [ADR-019](../10-architecture/adr/ADR-019-vmware-saved-source-health.md).
