# VMware snapshot collection contracts

## Active path and compatibility

`GET /api/integrations/vmware?type=snapshot-workspace&configId=<saved-id>` authorizes
devices/read, resolves the saved source, enters the existing target-scoped cache,
authenticates that service and calls `fetchSnapshotWorkspace`. The existing
Python bridge selects the fixed `get-snapshot-workspace.py` script. Credentials
and TLS policy travel over stdin; the script uses the shared verified SDK
login/logout lifecycle and destroys its container view on both success and error.

The response contains VM records, snapshots, associated file references,
`collectedAt`, request-specific `capabilities` and the existing cache headers.
The data TTL is two minutes with the established stale/revalidation policy.
Capabilities are calculated after the cache read, so cached ADMIN data cannot
grant EDITOR deletion or VIEWER mutation rights. `x-cache-bypass: 1` performs the
existing forced-refresh path. An ambiguous multi-source request fails with 409;
explicit source IDs preserve equal remote VM/snapshot IDs across different targets.
The presentation model accepts an optional `configId` in mutation payloads for
the existing source-selecting POST routes; those routes still enforce permissions.

The legacy `type=snapshots` and existing create/delete/revert behavior are retained.
This change adds the collection contract and reusable snapshot presentation
helpers; concurrently developed screen/QA changes are outside this commit.
No alarm engine, schema, dependency version or scheduled collector is added.

## Data semantics and review fixes

Snapshot references use VM plus snapshot identity. File keys belong to a VM;
shared keys are deduplicated within that VM when computing totals, not across
unrelated VM inventories. UTC timestamps retain source offsets during conversion;
missing or future dates are displayed as unknown. Snapshot age thresholds are
7 and 30 elapsed days, and the date display uses Europe/Istanbul.

The metric is **associated file size**, including referenced disk-chain files,
not reclaimable storage or unique snapshot delta usage. This follows the SDK
[snapshot layout reference](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/vim.vm.FileLayoutEx.SnapshotLayout.html)
and [file size definition](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/vim.vm.FileLayoutEx.FileInfo.html).
The SDK memory-file sentinel `-1` is excluded. Missing layouts, absent file
records, inaccessible files and unavailable sizes remain unknown. A measured
zero-byte file stays zero; an empty snapshot reference list cannot claim zero.
Partial totals retain an unknown-snapshot count.

The initial review reproduced three correctness gaps and fixed them:

- Empty snapshot file-key lists produced a false zero size. The bridge now rejects
  that invalid collection shape, and the presentation helper preserves unknown.
- Fractional or unsafe JavaScript integer byte measurements/keys passed bridge
  validation. The new operation requires exact nonnegative safe integer values,
  while retaining explicit null measurements.
- Python dictionary construction silently overwrote duplicate layout or file
  identities. The collector now rejects them; the shared helper emits a sanitized
  source error and runs cleanup instead of publishing a partial successful set.

## Validation — 2026-10-16

Commands: `npm run test:snapshot-contracts` and
`npm run test:snapshot-collector-contracts`. The reusable alarm/integration workflow
requires both and includes the new source/model/Docker paths in its PR trigger.

The Node suite exercises five groups using the real model, bridge, source
selector, permission policy, target cache and API with synthetic process/ORM/source
I/O. It checks malformed payload rejection, valid empty inventory, exact zero,
shared-file totals, date offsets, source isolation, cold/cached role capabilities,
forced-refresh errors, authorization before source reads, explicit-source mutation
payloads and runtime Docker COPY dependencies.

The Python suite exercises nine tests with actual pinned PyVmomi layout objects,
nested snapshot trees, unknown/zero/inaccessible files, the memory-file sentinel,
duplicate rejection and sanitized permission failures with view destruction and
SDK logout. No customer source or remote mutation is invoked.

### Final staged-source results

Base commit: `b35d1b2aec650002e09fab6c931fd4a12fcbfddc`.
The tested source tree was `9618ad6bc2740cd7e8f3bd11c84df56883985523`; only this
verification section was updated afterward. The package scripts were staged
independently so concurrent snapshot-screen scripts and unrelated UI/QA edits
were not included accidentally.

| Check | Actual result |
|---|---|
| New Node snapshot contracts | PASS, five groups using actual model/bridge/selector/permissions/cache/API |
| New Python collector contracts | PASS, 9 tests using real PyVmomi layout types and synthetic source records |
| Related Node regressions | PASS: VMware cache, collection, health, inventory source scope, integration permissions, cluster/host/VM/datastore workspaces, release policy and local font checks; 12 Node scripts in total including the new suite |
| Related Python regressions | PASS: VMware protocol/TLS 18, cluster 3, host 4, VM 4 and datastore 5; 43 Python tests in total including the new suite |
| Focused ESLint | PASS for the changed API, service, bridge, model and new ESM contract test |
| Full `npm run build` | PASS, exit 0; full policy/TLS/TypeScript/lint gate, native Next checks, production compilation, 113/113 static pages, optimization and build traces |
| Local font output contract | PASS against the actual product artifact |
| Runtime Docker file contract | PASS: new collector plus both shared Python helpers are copied to the configured runtime script directory |

Checks ran in a fresh Git archive of the staged source under tmpfs, with Docker
`--network none`, read-only source/dependency mounts and a read-only root
filesystem. Image: `sha256:daf880f6655d0fdb5bd863f8a0407dcb93f57c2f530f3fa89dd573c36f60d3b0`;
Node 20.20.2, Next 14.2.35, TypeScript 5.9.3, Prisma 5.22.0 and Python 3.11.2 /
PyVmomi 9.1.1.0. Dependencies were already installed and the Prisma client was
generated only in tmpfs. Build mode used the existing `INFRASCOPE_BUILD=1`, with
no installation credentials or reachable database. No real VMware source, source
mutation or notification recipient was contacted. The 9 existing lint warnings
and existing build dependency warnings were preserved.

A full Docker image build, live vCenter operation and snapshot UI/browser tests
were not performed in this scoped review. No database/schema migration or package
upgrade was needed. The owned checks container was removed after verification.
