# Automatic release guides implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. Track the steps below.

**Goal:** Every new stable release contains verified, correctly versioned HTML and PDF installation guides.

**Architecture:** Render a single HTML template using metadata and bootstrap bytes from the online installer package. Convert that HTML with Playwright, verify both artifacts and generate checksums and release notes before the existing release publication step.

**Tech Stack:** Python stdlib, pdfplumber 0.11.9, existing Playwright dependency, GitHub Actions.

**Spec:** ../specs/2026-10-25-automatic-release-guides-design.md

## Constraints / review focus

- Preserve existing installer assets and all existing publish quality gates.
- Stable version and owner/repository must match package metadata; reject invalid or mismatched values.
- The documented bootstrap hash must match both separate asset and ZIP manifest.
- Preserve command line literals and ensure each command block fits a PDF page.
- Reusable deployment CI must also run when the template or guide generator changes.
- No network-dependent guide content, credentials, customer state, or app/database initialization.

## Task 1: Shared source and verified generation

- [x] Write failing behavioral tests in scripts/check-customer-guides.py.
- [x] Add deploy/guides/windows-install.html, scripts/build-customer-guides.py and scripts/render-customer-guide-pdf.cjs.
- [x] Validate two release versions/repositories, wrong metadata, altered bootstrap/manifest and parameter drift.
- [x] Render and visually inspect the PDF; verify all 18 commands and 14 troubleshooting entries.

## Task 2: CI and release publication

- [x] Add pinned PDF validation requirements and guide regression job to customer-deployment.yml.
- [x] Build and verify guides before gh release create; upload HTML, PDF and guide checksums, use generated exact-version release notes.
- [x] Update operator runbook and test workflow wiring and release note preservation.
- [x] Run targeted package/guide/PowerShell checks; inspect final diff, commit and prepare a reviewable integration.

## Execution record

- Existing managed release worktree was clean at 619a10a; using branch codex/automatic-release-guides. The primary checkout contains unrelated work and will be preserved.
- The old guide names a postgres-backup service, whereas the actual packaged service is database-backup. The new guide derives this from the package to keep operational commands correct.

- Verification: 9 guide checks (two versions/repositories, real HTML/PDF and Windows PowerShell parsing), 3 online package checks, native Windows PowerShell 5.1 and PowerShell 7 updater suites passed. A 16-page preview was rendered and visually inspected. Node syntax and git whitespace checks passed.
- Independent review identified one missing Repository parameter contract; a red-to-green regression now covers renames in both bootstrap and updater. No other blocking findings.
- Guide-only npm installation uses the same legacy-peer-deps resolution mode as the existing release-quality workflow; dependency lifecycle scripts remain disabled for document rendering.
- Remote quality gate reported the existing Undici 6.28.1 dependency as vulnerable after the advisory range update on 23 October. Application dependencies and security gate policy are outside this documentation change; the gate remains enabled.
