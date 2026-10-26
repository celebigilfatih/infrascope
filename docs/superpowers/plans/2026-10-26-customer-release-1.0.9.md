# InfraScope 1.0.9 Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the approved latest application changes as immutable 1.0.9 images and a Windows installer, and prove a fresh customer installation.

**Architecture:** Merge a stable, allowlisted snapshot of the primary working tree into the tested v1.0.8 release source in the existing isolated worktree. Preserve patched runtimes and guide automation. Use the existing gated GitHub Actions publication workflow and validate its real downloaded artifacts.

**Tech Stack:** Next.js, TypeScript, Prisma/PostgreSQL, Node 24.22.1, Python NMS, Docker Desktop Linux amd64, GitHub Actions/GHCR, Windows PowerShell 5.1.

**Spec:** User-approved four-step release plan in this chat; customer has not installed any version, so customer acceptance focuses on fresh installation.

## Global Constraints

- Preserve npm Undici 6.29.1, Node 24.22.1 / bundled Undici 7.30.1, runtime guards, TLS policy and full npm audit gate.
- Preserve exact-version HTML/PDF generation and automatic Release attachment.
- Never alter existing v1.0.7/v1.0.8 tags, assets or image digests.
- Do not modify, reset or commit the user's primary checkout/index.
- Exclude temporary files, generated guides, live environment/identity/license/database state from source intake.
- Publish only after all required CI checks pass for the exact source commit.

## Review Focus

- Older primary build/workflow files must not remove v1.0.8 runtime pins or guide generation.
- New application imports must have their previously untracked source files included.
- New database models must work with a completely empty PostgreSQL volume.
- Topology overview controls, selection/actions and connections must remain accessible and rendered.
- Published images, installer metadata and guide commands must all identify 1.0.9 and the same source commit.

### Task 1: Integrate the latest source

**Files:** Latest `app/`, `components/`, `lib/`, `prisma/`, `scripts/`, `tests/`, related docs/config; protected `Dockerfile*`, `.nvmrc`, `.github/workflows/`, security guards and guide sources.

**Interfaces:** Consume v1.0.8 commit `edf0adc96aa78054e860f0018f12cfdb4d9db2ba` and a hashed primary source snapshot; produce a reviewed 1.0.9 candidate tree.

- [ ] Snapshot tracked changes and allowlisted new source files with a separate temporary Git index; verify the primary index and source bytes were not modified.
- [ ] Merge against v1.0.8, inspect conflicts and preserve security/publication changes.
- [ ] Validate runtime floors, imports, Prisma generation, TypeScript, lint, focused new-feature regressions and source-file completeness.

### Task 2: Validate and review the candidate

**Files:** Existing release-quality, alarm, backup, dashboard, customer deployment and incident workflows; new-feature checks in `package.json` and existing relevant gates.

**Interfaces:** Consume the candidate tree; produce a tested immutable source commit.

- [ ] Wire any new feature checks missing from existing release gates without weakening checks.
- [ ] Run full regression, audit, compiler and release checks; fix failures at their source.
- [ ] Perform one fresh whole-branch review; address material findings and commit the final candidate.

### Task 3: Publish 1.0.9

**Files:** Existing `publish-image.yml`, `docs/releases/customer.md`, versioned generated release assets.

**Interfaces:** Consume the tested commit; produce stable Release v1.0.9 and digest-pinned app/NMS images.

- [ ] Confirm version/tag absence and green CI, then push immutable v1.0.9 on the tested source.
- [ ] Monitor every publication gate and production build; verify all publication jobs succeed.
- [ ] Download the six real Release assets anonymously; verify checksums, manifest source/digests, HTML/PDF version commands and rendered PDF layout.

### Task 4: Prove fresh customer installation

**Files:** Downloaded 1.0.9 `install-infrascope.ps1`, installer ZIP, HTML/PDF guides and a final validation report under `output/releases/1.0.9/`.

**Interfaces:** Consume the public Release/GHCR artifacts; produce a verified Windows/Docker installation receipt.

- [ ] Run the actual published Windows bootstrap with an empty destination/database and a distinct Docker project, with no GitHub/Docker account credentials.
- [ ] Confirm readiness/version, setup page in Chromium, image source/version labels and patched Undici runtime.
- [ ] Remove only the test project's containers/volumes and synthetic state; retain public artifacts and validation evidence.
- [ ] Report the Release/HTML/PDF links and fresh-install instructions; no customer update step is necessary.
