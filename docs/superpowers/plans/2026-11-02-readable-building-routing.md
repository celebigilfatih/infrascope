# Readable building routing implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement task by task with failing tests first.

**Goal:** Make the existing flat building map readable on a 32-building/33-link example without changing icons or stored customer coordinates.

**Architecture:** Preserve the small-network preset and saved-position precedence. Use deterministic graph-aware compact defaults for larger networks, then route actual displayed links around measured building icon/name/count rectangles. Preview and cancel remain local; only the existing explicit apply action writes layout.

**Tech Stack:** Existing TypeScript, React Flow, obstacle-aware topology router, Node checks and Playwright.

**Spec:** User-approved scope in this conversation and the four screenshots in `D:/Dev/infrascope/output/topology-ux-audit-20261102/audit.md`.

## Global constraints

- No customer server operations, migration, release or GHCR publication.
- Preserve current building icons and real physical/logical links.
- `positions.all`, then legacy saved coordinates, then defaults; no write on opening/filtering/fitting.
- Full icon/name/count rectangles are obstacles, including the larger central icon and logical group cards.
- Keep existing save/retry/conflict, pin, preview/apply/cancel/undo behavior.

## Review focus

- Filtered inventory must retain its unfiltered default coordinates.
- Parallel/reverse links must remain independently visible.
- Saved overlapping nodes must be reported instead of silently losing a connection.
- Disconnected/empty graphs and reordered inputs must remain deterministic and non-mutating.
- Preview must not persist or discard pinned/legacy positions.

## Task 1: Actual overview routing

- [x] Add a failing pure overview test asserting route segments avoid all building labels, preserve saved points, and cover every link.
- [x] Extend the existing router with per-node geometry, add overview geometry, and stop the overview renderer from replacing routes with Bezier curves.
- [x] Memoize the routed graph; show an explicit blocked-route notice when overlapping saved objects prevent a route.
- [x] Run building/device routing and overview contracts.

## Task 2: Compact connected defaults

- [x] Add a 32-node/33-edge cyclic/chained fixture and failing layout tests for deterministic compact placement, no overlaps, short connected paths, and unchanged pinned coordinates.
- [x] Implement compact graph-aware defaults and use the same algorithm for explicit automatic-layout preview. Small maps retain their current arrangement.
- [x] Run topology checks, TypeScript and lint. No dependency installation or model changes.

## Task 3: Browser proof and local delivery

- [x] Add browser regression checking every SVG path against actual building name bounds, saved point preservation and zero view writes.
- [x] Run relevant topology browser regressions in the disposable test database; inspect the 32/33 map visually.
- [x] Transfer only verified changes to the localhost bind-mounted checkout after checking for independent edits. Verify `localhost:8170/network` in the user's browser.
- [x] Remove disposable test data, update validation report and review the complete diff. Leave implementation uncommitted for user review.

## Execution record

- Existing linked worktree clean at `663f553`; new branch `codex/topology-readable-routing`.
- Baseline `check-building-routing.cjs` passed in isolated Node container using the existing dependency volume read-only.
- Ruling: execute directly from the user's approved correction scope; no renewed design approval or release steps.

- Task 1: complete. RED: missing actual obstacle routes; GREEN: name/count clearance on 32/33 saved-grid fixture. Existing building/device routing suites passed.
- Task 2: complete. RED: ring defaults leave root routes blocked under name-safe clearance. GREEN: compact defaults, deterministic reversal/filtering and unchanged saved points.
- First integrated run: TypeScript and global lint passed; 63 selected topology/incident browser scenarios passed, including actual SVG/name collision sampling.
- Fresh review found parallel-path duplication (3 cables → 2 paths) and expensive routing during drag on unaligned saved points. Both reproduced before fixes. Parallel endpoint lanes now produce 3/3 and 10/10 distinct paths. Dragging uses projection only and restores validated routes on release; dedicated browser test failed before the fix and passed after it.
- Ruling: hide paths only during an active drag with visible explanatory status, then restore on release — avoids repeated synchronous search and misleading lines over moving labels; cost is no line preview while the pointer is held.
- Localhost 8170 source bind mount updated after clean-checkout/hash checks. User logged in; actual 10-building/1-logical-group map inspected, selection cleared and screenshot saved. No local or customer position writes.
- Minor wording/test-title findings corrected; existing position-precedence unit and pin/apply/undo browser tests cover those contracts. Deferred: optimizing layouts for ~400+ buildings; current acceptance target is 32/33.
- Final 64-scenario run: 64 passed, 0 failed/skipped/flaky (6.5 minutes). New TypeScript/script/test lint passed. Isolated database, network and both temporary containers removed. No release or commit performed.
