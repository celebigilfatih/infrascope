# InfraScope 1.0.10 Customer Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Unite completed local improvements on main and deliver one verified Windows/Docker customer version through GitHub Releases and GHCR.

**Architecture:** Preserve the existing digest-pinned release transport, mandatory encrypted recovery bundle and independent Caddy projects. Extend the verified bootstrap for upgrades from 1.0.9, including existing standalone HTTPS installations; consolidate the tested source into main before tagging the release. Every customer uses the same release image digests while retaining their own data, configuration, identity and CA.

**Tech Stack:** Windows PowerShell 5.1/7, Docker Linux amd64, Caddy, Next.js, PostgreSQL16, Python release tooling, GitHub Releases/GHCR.

**Spec:** User-approved rollout sequence in this conversation, `2026-10-27-next-customer-package.md`, and the existing customer IP HTTPS / HTTP redirect designs under `docs/superpowers/specs/`.

## Global Constraints

- Target version1.0.10; current public stable version1.0.9 was verified through GitHub API on2026-10-28.
- Main must contain all completed local changes; no per-customer source forks or mutable latest image selection.
- Include the local NMS, inventory and room improvements explicitly requested by the user on2026-10-28.
- Preserve primary working-tree changes using captured hashes and three-way integration; never reset or discard them.
- Retain installation project/network identity, ENV secrets, license, machine identity, database and existing CA; private CA material only enters encrypted recovery storage.
- Windows+Docker Linux amd64; retain server-specific addresses/ports as parameters. Do not hard-code the pilot customer IP.
- Upgrade only after a completed authenticated encrypted backup. Resume safely with the same target; no automatic image downgrade after migrations.
- Test on isolated synthetic installations/databases. Customer changes require the verified package and an identified pilot target.
- A public stable tag/Release is published only after quality gates and installation/update/restoration rehearsals pass. Candidate images may use unique commit-specific tags to obtain immutable registry digests for rehearsal; they are not advertised for customer installation.

## Review Focus

1. A 1.0.9 updater has an older ZIP allowlist: the newly downloaded verified bootstrap must upgrade it without executing an unverified file.
2. Existing standalone HTTPS/redirect projects live outside the app directory: discover and validate ownership, preserve their CA, and do not replay a completed journal against changed version hashes.
3. An interrupted update must resume without a second backup or clobbering unrelated ENV changes; failures must not claim completion.
4. Exported private CA recovery material must remain encrypted and restorable; separate customers must receive different CAs.
5. Main may receive concurrent local work during validation: compare the frozen source before integration rather than overwrite it.

## Task 1: Consolidate the release source

**Files:** primary local changed files, isolated branch, source-capture manifest under this plan's ignored workspace.

**Interfaces:** consumes primary main HEAD/worktree and current9152521 branch; produces a reviewed combined source commit and content hashes.

- [x] Capture all tracked/untracked primary changes, excluding ignored secrets and runtime data, with SHA256 hashes.
- [x] Three-way integrate against the shared main base; resolve real conflicts explicitly, preserve originals and record rulings.
- [x] Run relevant NMS/room/topology contracts and TypeScript/lint. Commit the combined source on the isolated release branch.

## Task 2: Versioned package/bootstrap compatibility

**Files:** `scripts/package-online-release.py`, `scripts/check-online-release.py`, `deploy/release-common.ps1`, `deploy/install-infrascope.ps1`, `deploy/update.ps1`, Windows transport tests.

**Interfaces:** verified ZIP/manifest allowlist; bootstrap `-Update -Destination <existing-root> -PassphraseFile <path>` invokes the candidate updater against the existing installation rather than the staging directory.

- [x] Add failing tests for nested HTTPS payload verification, traversal/duplicates/tampering and upgrading an existing1.0.9 installation through the downloaded bootstrap.
- [x] Update the fixed allowlist, safe extraction and manifest validation together; preserve old installation data and use explicit installation root parameters.
- [x] Run Python package tests and Windows5.1/7 failure/retry tests; commit when green.

## Task 3: HTTPS and encrypted recovery integration

**Files:** `deploy/https/*`, new focused release HTTPS coordinator, `deploy/install.ps1`, `deploy/update.ps1`, `deploy/backup.ps1`, recovery tooling/tests as required.

**Interfaces:** coordinator accepts installation root/project, public IPv4, HTTPS/legacy/backend ports and an existing installation lock. It returns the CA-verified HTTPS URL, exported public CA path/hash and owned proxy identities.

- [ ] Add failing tests for clean enrollment, existing standalone CA reuse, lock ownership, occupied port, canceled/failed transition and resumable completion.
- [ ] Reuse the pinned separate proxies and journals; avoid nested update-lock deadlock and preserve existing completed proxy configurations.
- [ ] Include required TLS state/CA recovery material in the mandatory encrypted backup; prove recovery into a separate synthetic installation preserves the CA fingerprint.
- [ ] Run focused Windows/Docker tests; commit when green.

## Task 4: Portable production installation/update rehearsal

**Files:** version-controlled HTTPS/production fixture tests, deployment CI and existing Windows/Docker checks.

**Interfaces:** consumes candidate app/NMS images and package; real Docker/PostgreSQL/TLS/session behavior with synthetic data. Mock only GitHub transport for unpublished assets where necessary.

- [ ] Replace the ignored historical fixture's dependency on local pilot output with source-controlled setup.
- [ ] Verify empty database installation, fresh separate CA identities, legacy HTTP308 path/query/fixed target, TLS-authenticated readiness and real login/refresh.
- [ ] Install official1.0.9, create synthetic data/settings/identity, upgrade with encrypted backup, interrupt/retry, and prove data and CA preservation plus restoration.
- [ ] Assert cleanup of every owned synthetic project/volume; preserve shared/live services.

## Task 5: Freeze, build and validate the final source

**Files:** Docker builds, existing release/security/full regression gates, source manifests and QA report.

**Interfaces:** one source commit, matching OCI revision/version labels and final image IDs/digests.

- [ ] Run security/dependency checks, TypeScript, global/scoped lint and all current browser regressions from a frozen private source copy.
- [ ] Build app/NMS production images; verify runtime, migrations and required collectors. Run Task4 against those images.
- [ ] Run whole-branch independent review; fix actual Important/Critical findings with RED/GREEN verification. Update evidence and release notes.

## Task 6: Main, guides and verified publication

**Files:** main/feature refs, versioned HTML/PDF guides, release ZIP/manifests/checksums and GHCR images.

**Interfaces:** stable v1.0.10 source tag, one pair of customer image digests and a verified Windows release asset set.

- [ ] Verify the primary snapshot has not changed; preserve its captured uncommitted state before fast-forward integration into main. Keep recovery snapshots until integration is verified.
- [ ] Build/verify versioned guides with HTTPS, public CA trust and one/two-command installation/update instructions; explain1.0.9 bootstrap migration.
- [ ] Publish the exact tested images/package to GHCR and GitHub Releases; verify public assets, digest pins and version/revision consistency.
- [ ] Rehearse download/install/update using the published assets; keep one identified customer as pilot before applying the same version to other customers.
- [ ] Update QA/report, clean synthetic data and report what was published versus any customer-side action still requiring access.
