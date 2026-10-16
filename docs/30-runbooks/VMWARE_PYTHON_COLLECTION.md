# VMware Python Collection

**Scope:** Audit B08. Full test capability is different from REST transport status.

## Runtime Contract

- Production/development recipes install Python and the pinned `pyvmomi==9.1.1.0` SDK under `/opt/vmware`. Production copies `scripts/vmware_helper.py`, `scripts/get-snapshots.py` and `scripts/get-host-details.py` explicitly. Rebuild application images to include this runtime change; updating source files in an older SDK-free image is insufficient.
- Outside those recipes, install `scripts/requirements-vmware.txt` in an owned virtual environment and set `VMWARE_PYTHON_BIN` to its Python executable. The application working directory must contain `scripts/`; the bridge does not assume the installation is `/app`.
- Existing deployment templates mount `./certs` read-only at `/app/certs` and pass `VMWARE_TLS_CA_CERT_PATH`. Use the appropriate trusted CA PEM bundle, for example `/app/certs/vcenter-ca.pem`. No private key is needed. The same policy is carried to PyVmomi; production cannot disable certificate/hostname verification. Thumbprint metadata is not a replacement for CA trust.
- Helper calls accept only versioned JSON on stdin. Do not pass credentials on command lines, copy raw helper output into tickets or invoke the old positional-password CLI.

## Diagnosis

Use the ADMIN connection test with the intended credentials. It does not save configuration and cannot borrow a snapshot cache result. Success means runtime preflight, REST authentication, host hardware collection and snapshot collection all completed. This can reveal missing SDKs, invalid CA trust or insufficient SDK permissions even when ordinary REST status succeeds.

| Safe code/symptom | Action |
|---|---|
| `VMWARE_HELPER_UNAVAILABLE`, `PROCESS_EXIT` | Check the configured interpreter and packaged helper files in the application runtime. Rebuild an old image when needed. |
| `VMWARE_HELPER_SDK_MISSING` | Install the pinned runtime requirements in the selected interpreter, not a different host Python installation. |
| `VMWARE_HELPER_TLS_POLICY`, `TLS_ERROR` | Remove production insecure flags; check CA path/readability, trust chain, certificate expiry and hostname. |
| `VMWARE_HELPER_AUTH_FAILED`, `PERMISSION_DENIED` | Check the entered account and read permissions for the same vCenter inventory used by PyVmomi. Do not retry passwords in a loop. |
| `VMWARE_HELPER_SOURCE_TIMEOUT` | Investigate source/network latency. Process execution is bounded; cold API reads use 504. |
| `VMWARE_HELPER_OUTPUT_INVALID`, `SOURCE_INCOMPLETE` | Check runtime/source compatibility and host inventory visibility. Partial/malformed data is not empty inventory. |
| `VMWARE_HELPER_VM_NOT_FOUND` | Refresh inventory and verify the VM MoRef on this target. It is different from an existing VM with no snapshots. |

All helper-source failures are unavailable, not authoritative empty collections. Cold reads normally return 503; timeouts return 504. Dashboard snapshot aggregation and recent-snapshot alarms preserve the error. Previously successful cached responses may still be served as `STALE` within the existing bounded window; failed refresh must not reset their age. Check `X-Cache` and `X-Cache-Age` without recording source inventories or credentials.

Enriched host reads now require complete SDK hardware. Host display names are not unique, so matching uses MoRefs. Missing enrichment cannot silently report zero capacity. Unrelated SOAP/event best-effort behavior, first-enabled configuration selection and general VMware singleton/session redesign are unchanged.

## Safe Verification

Run with installed dependencies and synthetic fixtures:

```text
npm run test:vmware-collection
npm run test:vmware-python
npm run test:vmware-cache
npm run type-check
npm run security:tls-check
```

The collection suite substitutes source/ORM/process I/O, then also tests actual preflight pipes and missing interpreter/script cases. Python tests use controlled SDK objects, the installed pinned SDK for import preflight, generated temporary certificates and loopback-only TLS/SOAP servers. They verify actual SmartConnect login/logout with punctuation and Unicode credentials against a synthetic source. They never contact a customer vCenter or deliver notifications. Use an isolated temporary directory for generated certificate fixtures.

Normal paths destroy SDK views and disconnect sessions, including collector failures. The connection test closes its owned REST session only after both collectors settle. A force-killed/timed-out remote operation may not complete logout; server-side session expiry may still be needed. No claim is made that a killed request can revoke an already accepted remote operation.
