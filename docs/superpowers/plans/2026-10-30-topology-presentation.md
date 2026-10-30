# Topology presentation implementation

Approved specification: the conversation's “Ağ topolojisini okunabilir ve kolay düzenlenebilir hale getirme” plan.

1. Add a pure visual presentation model, graph-derived section suggestions, projection and layouts; behavior tests first.
2. Add GET/PUT persistence in SystemConfig with permission checks, validation, atomic revision comparison and safe retries.
3. Replace the building overview with searchable navigation, summary/section/all scopes and an inspector; preserve real network group and connection workflows.
4. Add automatic save/retry, section editing, layout preview/pins/undo and independent cameras.
5. Extend browser regressions, run topology + incident regressions, TypeScript and lint; clean isolated fixtures and update the report.

Constraints: no customer writes, package or release publication; preserve legacy layouts, inventory and physical connection APIs. Work in the existing isolated worktree.

Pre-flight: presentation schema is shared by graph projection, API and client save queue. Revision belongs to the persisted envelope, not the editable document. Legacy positions remain separate.

Ruling: section suggestions keep branching articulation buildings and a deterministic central building on the backbone; degree-two chains remain inside sections. Keeping every degree-two articulation on the backbone would reproduce the original long unreadable map. Isolated buildings remain unplaced.

Progress: source and runner inspected; isolated tooling dependencies installing. Host has no npm/TypeScript, so verification runs in a disposable Docker tooling container.

## Implementation ledger

- Model/projection/API complete: test-first scripts `check-topology-presentation*.cjs` pass, including 32/33 graph, aggregation, pins, duplicate memberships, permissions, CAS races and lost response replay.
- New workspace complete: searchable navigation, summary/section/all scopes, inspector, explicit suggestion application, section create/rename/move/delete, save feedback/retry, preview/pin/undo, responsive drawer. Existing connection forms/endpoints and physical NetworkGroups remain in place. Building device workspace explains the absence of connection records.
- Initial focused browser batch: 37 passed. A controlled-node dimensions regression was reproduced and fixed by preserving measured dimensions; node click/drag now survives hover/selection renders.
- Review by `topology_presentation_review`: four significant findings reproduced with regression tests and fixed. GET reconciles deleted memberships read-only; conflict recovery uses an independent draft snapshot; camera refocus is explicit rather than scope-driven; presentation readiness/mode permission is independent of the legacy layout API, with a retry banner for unavailable connection tools. Reviewer follow-up found no remaining significant issues in these fixes.
- TypeScript and full lint passed after the review fixes. Original full runner's unit/API/DB prechecks passed. Its 632-test browser run was intentionally interrupted after 37 passing cases to shard the final expanded 634-test suite.
- Final browser run is in four independent PostgreSQL databases, one worker per shard. Logs: `output/topology-presentation-shard-{1..4}.log`. Containers: `infrascope-topology-shard-{1..4}` and `infrascope-topology-shard-{1..4}-db`. Exec sessions: 66458, 63293, 54196, 42302.
- Test-infrastructure ruling: the temporary shard source copy initially excluded every directory named `backups`; restored the seven affected NMS page/API files in every test container. No NMS production code changed. Affected cases were rerun successfully, as recorded below. The repository's normal regression runner already uses correctly rooted backup exclusions.
- Additional temporary tooling: `infrascope-topology-check` (bind-mounted worktree + dependency volume), `infrascope-topology-regression` (private source copy), `infrascope-topology-recovery-db`, and Compose project `infrascope-incident-regression` postgres. Dependency volume: `infrascope-topology-check-deps`. Clean these named task-owned resources after copying results; never touch existing development/customer containers.
- Final: 634/634 unique browser cases passed after infrastructure recovery. Three visual-presentation unit/API/navigation scripts passed, legacy topology suites passed, and final TypeScript/full lint passed. The first four shards had 178 infrastructure-affected failures (source exclusions, memory pressure and too-low initial caps); recovered cases were verified on reset disposable databases. Last access groups: 38/38 and 37/37. Combined evidence: `output/topology-presentation-regression/results.json`; human report: `docs/20-modules/topology/2026-10-30-presentation-validation.md`.
- Cleanup: removed all 12 task-owned containers, disposable databases, test network and dependency volume. Kept reports/logs/screenshots. Development web process had retained ENOMEM errors from the earlier test load and was restarted for recovery; development/customer databases untouched. No commit, push, customer installation or release publication performed.
- Final local recovery evidence: `http://localhost:8170/api/health` returned HTTP 200 with `status: healthy` after the restart. New implementation remains in this worktree; the development container's source checkout was not replaced.

## Local activation follow-up

The user observed the old localhost UI. Verified that main and worktree both had base c1833d3 and main was clean, then copied the 21 implementation/documentation/test files into `D:\Dev\infrascope` (no commit/push). The running development container already bind-mounts these paths. Confirmed new workspace live in the existing authenticated Chrome tab, including the System Odası inspector and A Blok section navigation. No presentation apply or inventory/connection write was performed.

Real local data exposed a tall seven-branch star layout; added a failing compact-fan regression, implemented center/perimeter placement for four-to-eight direct branches, and reran model/API/navigation/contracts plus TypeScript/targeted lint successfully in the development container. Captured `output/topology-local-live.jpg` after a browser reload. This geometry-only follow-up did not rerun the full incident package. Local implementation and worktree are synchronized; customer publishing remains deferred.
