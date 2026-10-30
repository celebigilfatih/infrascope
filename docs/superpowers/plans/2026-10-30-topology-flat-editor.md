# Ağ topolojisi: eski görünüm ve anlaşılır düzenleme

Approved in chat on 2026-10-30. Supersedes the visual-section UI, preserving its stored documents and safe persistence.

1. Restore the full-width icon map, compact toolbar, contextual edit actions and in-map guide.
2. Keep real groups, legacy positions and the presentation API queue. Position priority: presentation all > legacy > automatic. Never write on view/filter/search.
3. Apply the same controls to the device workspace; keep dialogs/fullscreen/connection validation safe.
4. Replace obsolete section UI scenarios with flat-map regression coverage; run the full suite, TS and lint in disposable infrastructure, then verify localhost:8170.

Defaults: view click opens the building dialog; edit click selects. Initial camera is at least 65%, centered on the highest-degree building when fit is smaller. Explicit fit may zoom further out. Separate new camera storage key.

No customer data, NMS implementation, release or publication changes.

## Execution ledger

- Environment: existing isolated codex/customer-release-1.0.10 worktree; previous presentation changes are uncommitted in both this worktree and D:/Dev/infrascope. Preserve them and compare before local activation.
- Ruling: reuse the presentation persistence hook with scope all, retain legacy rendering as an advanced fallback; do not revert the entire component and lose revision/error protections.
- Preflight: shared mode control, guide and search styling affect building and device maps; browser tests must cover both. Existing section API/model tests stay; obsolete section UI tests will be replaced.
- Implemented: full-width old icon map, flat position/camera policy, compact edit controls, shared in-map guide and optional-field disclosure. New flat-policy test observed red then green. Updated obsolete section UI expectations.
- Review fixes: persistence moved into NetworkTopologyPage so queued/failed drafts survive group/detail navigation; hydrated selection does not refocus camera; real group return restores keyboard focus once. View/edit click separation uses a 4px drag threshold to avoid write-on-click.
- Camera investigation: ReactFlow v11 programmatic zoom does not emit onMoveEnd; immediate getViewport reads the previous frame. Persist the committed useViewport transform. Selected-building/manual-camera reload test observed failure before correction, then passed.
- Browser checks: 25 editing/lifecycle/header-overlap cases passed; desktop/mobile overview and real-group keyboard return passed; 32/33 no-write rendering, device guide/click, error/retry, pin/preview/undo, CAS and camera cases passed in targeted runs. Final full-suite run pending.
- Test ruling: native Escape may also exit browser fullscreen while dismissing the guide. Assert guide closes and a second Escape safely returns/stays normal, preserving rendered paths; do not require native Escape to remain fullscreen. Updated both full-suite snapshots before their relevant tests run.
- Full suite: infrascope-flat-target (shard 1/2, private DB infrascope-flat-check-postgres-1, log /tmp/full1.log, exit marker /tmp/full1.exit). Initial shard2 infrascope-flat-full2-tests finished 307/309 with two failures. Actual peak RAM required raising each active test container to 6GB, with local web-dev stopped. Targeted artifacts retained in shard1 /tmp/flat-target-results.
- Full-suite fixes: native fullscreen Escape can be consumed before Radix sees it, leaving the guide modal open; TopologyMapGuide now closes on native fullscreen exit. Object-menu test failure reproduced with stack instrumentation in a private test copy: a queued scroll event dismissed a newly opened menu. Actual anchor geometry is now compared before dismissing. Added red/green pure anchor check and repeating the exact browser scenarios.
- Rerun infrastructure: infrascope-flat-repeat, same private shard2 DB/network, /tmp/menu-guide-fixed.log; temporary image infrascope-flat-test-cache:20261030 is an internal test dependency snapshot only and must be removed at cleanup. No instrumentation is in repo source; private debug copies restored from source before final validation. Full shard2 rerun will use final source and current test expectations; initial snapshot had collected the older Escape expectation before the on-disk test update.
- Local activation: runtime files copied to D:/Dev/infrascope after initial concurrent-change check; originals under output/topology-flat/preactivate. Later review/camera refinements recopied. Customer deployment not touched. Browser tab 436878674 is localhost, customer tab 436878671 must not be changed.
- Complete: 638 unique collected browser IDs matched passing evidence (329 + 309; missing/unexpected lists empty). Resource-failed/interrupted cases were recovered explicitly; one interrupted rule-viewer case was separately verified rather than skipped. Evidence output/topology-flat/coverage-summary.json.
- Runner fix: select once, execute exact --test-list batches of at most 80 with fresh servers; independent HTML/JSON; aggregate recovery state includes unexecuted/interrupted tests and global failures. Red/green planner/aggregate/interruption checks pass; real batches validated exact IDs/counts. Current browser-batch process limit fixed future large-suite memory accumulation.
- Final verification: global TypeScript and lint 0; topology contracts/model/API/navigation/layout/queue/hover and flat/anchor checks 0. Independent review findings resolved.
- Cleanup complete: both disposable databases read zero users/devices/buildings/building_connections; all infrascope-flat test containers/networks and temporary cache image removed. Web-dev restarted healthy; other development apps and customer untouched.
- Local browser verification complete: compact toolbar, guide, edit selection, selected-source form (cancelled without save), fullscreen fallback filling 1920x911, close/assign non-overlap, building close restoring normal map. Final image D:/Dev/infrascope/output/topology-flat/overview.png. No real positions/links were written during manual verification.
