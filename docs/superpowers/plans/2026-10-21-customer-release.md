# Customer Release 1.0.1 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for the already authorized native execution. Track evidence in output/customer-release-20261021/progress.md.

**Goal:** Deliver the current application as matching, tested 1.0.1 application/NMS images and an installation package, verified on an empty database.

**Architecture:** Reuse the existing Dockerfiles, customer Compose, installer, package scripts and isolated regression runner. Freeze all current tracked and untracked source files after packaging corrections; build and test that same snapshot. Produce local image archives and checksums; no registry publication or real-customer writes.

**Tech Stack:** Docker/Compose, Next.js/TypeScript, PostgreSQL 16, Python NMS, Chromium/Playwright, Bash/Python packaging.

**Spec:** The user's 21 October request and the four-step release/clean-install proposal immediately preceding it; existing deploy/INSTALL.md is the installation contract.

**Confirmed target:** Windows + Docker Desktop in Linux x86_64 container mode, local localhost use. Include a native PowerShell installer, portable encrypted backup command and Windows guide. Rehearse using that installer on this Windows host, with private fixture settings. No public hostname is required.

## Global Constraints

- Include the current uncommitted application work, preserve unrelated edits and existing installations.
- Version 1.0.1 for both app and NMS; no shared branch commit, push, registry publish or actual customer activation.
- Disposable databases and internal test networks; unique fixture keys and machine state. No installation ENV, data, license cache or backups in build context or package.
- Fresh production build, full discovered regression suite, TypeScript and lint must pass. Tests must not be skipped or retried into an unexplained green result.
- Package includes offline app/NMS image archives, PostgreSQL support image, versioned templates, Unix scripts, installation guide and SHA-256 evidence.

## Review Focus

- A non-default requested release must survive packaging in both ENV templates and image names.
- Incomplete image input or invalid version must fail before creating a deliverable.
- Offline install must load its included PostgreSQL image as well as app/NMS, without reaching a registry.
- Clean setup must create only the requested first admin, reject subsequent setup, preserve identity after restart and keep another installation independent.
- No production data, machine identity or fixture credentials may enter delivered files; recovery must work with the installation's own keys.

### Task 1: Versioned, complete customer packaging

**Files:** scripts/package-customer-deploy.sh, scripts/package-appliance-assets.sh, deploy/install.sh, Dockerfile, nms_service/Dockerfile; create scripts/check-customer-release-package.py.
**Consumes:** Existing deploy templates and explicit VERSION=1.0.1, IMAGE_TAR_DIR.
**Produces:** Correctly pinned ZIP/appliance files with optional verified image archive set and matching OCI version metadata.

- [x] Add executable behavioral tests using private fixture directories for non-default version, missing images, invalid versions, Unix modes and offline image preparation.
- [x] Observe the existing scripts fail the new version/image requirements; retain RED evidence.
- [x] Apply minimal packaging/installer/version metadata corrections and verify GREEN.

### Task 2: Frozen production images and full regression

**Files:** Frozen source and orchestration/evidence under output/customer-release-20261021/.
**Consumes:** Task 1's corrected source plus the complete current working tree.
**Produces:** App/NMS image IDs and labels; full production build logs; complete merged regression report and fixture audits.

- [x] Freeze source excluding installation secrets, ignored operational data and output; record all source hashes.
- [x] Run the official preflight and all discovered browser cases against isolated PostgreSQL, with bounded parallelism.
- [x] Build both real production Dockerfiles using the same snapshot and version 1.0.1, with production quality gates active.
- [x] Verify resulting runtime, Python collectors, image metadata and build-context hygiene; preserve all failures and repair evidence.

### Task 3: Empty-database installation and recovery rehearsal

**Consumes:** Actual 1.0.1 production images and the customer's deployment Compose contract.
**Produces:** Rehearsal evidence for migrations, setup, login, readiness, persistence, NMS authentication and backup/restore.

- [x] Start private PostgreSQL 16/app/NMS/backup services with fresh keys and empty database; prove no default users/customer inventory.
- [x] Exercise setup/license flow with an isolated synthetic licensing service, create first admin through real HTTP/UI, log in and verify protected pages and roles.
- [x] Reject a second setup, restart and verify persisted identity/state, test private backup and recovery and independently check a second empty installation.
- [x] Dispose test records/resources; retain test-only evidence outside customer artifacts.

### Task 4: Deliver and audit the exact tested release

**Consumes:** Verified image IDs, passed Task 2/3 evidence, Task 1 packaging tools.
**Produces:** dist/infrascope-customer-deploy-1.0.1.zip, appliance files, image archives, checksum manifest and deployment instructions.

- [x] Export exact app/NMS/PostgreSQL images, generate versioned customer artifacts and verify archive contents against source/image hashes.
- [x] Run package checks, review bounded release changes and inspect final source consistency.
- [x] Record tests, installation proof, actual-license/customer-integration limitations and cleanup in QA/release report.

## Execution rulings

- The user explicitly requested execution of the preceding four-step proposal; no additional design/plan permission is needed.
- Use immutable private source snapshots and disposable containers rather than switching the shared dirty checkout to a HEAD-only worktree, which would omit the requested current work.
- Do not commit unrelated shared changes. The source manifest/image IDs are the release identity.
