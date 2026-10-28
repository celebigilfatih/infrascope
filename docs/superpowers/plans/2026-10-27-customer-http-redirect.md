# Customer HTTP Redirect Implementation Plan

> Execute inline in the existing isolated worktree; the requested outcome and existing IP HTTPS approach are explicit.

**Goal:** Old :8170 bookmarks reach the equivalent HTTPS page.
**Architecture:** Independent redirect container; existing app loopback port set through persistent APP_PORT. Preserve existing HTTPS CA and all image/data identities.
**Spec:** docs/superpowers/specs/2026-10-27-customer-http-redirect-design.md

**Deferred standard-package integration:** [Next customer package plan](2026-10-27-next-customer-package.md). User requested planning only; build/package/publish after the remaining improvements are completed.

- [x] Extend real production HTTPS regression to demonstrate missing legacy redirect.
- [x] Add redirect config/Compose and PS5.1 migration with preflight, locks, journal, recovery and retry.
- [x] Verify HTTPS session, redirect URI/Host, CA identity, repeat/restart, unaffected services/settings and failure rollback.
- [x] Document copy/install command (CMD single line), client trust requirement and recovery. Package only installer/config/docs/checksums.
- [x] Final evidence review: one Important recovery issue fixed with RED/GREEN verification. All 39 checks passed after the fix. Customer package ready for manual execution.
- [x] Actual customer redirect installation: user reported Redirect ready; live HTTP308 and exact Location verified.
- [x] Client CA trust: user imported public root, parsed certificate thumbprint matches a trusted root, HTTPS login page opens without warning.
- [x] Actual customer browser login and authenticated refresh: Chrome customer profile opened the old HTTP dashboard URL, reached HTTPS, displayed authenticated dashboard, and retained the same account after reload. Existing device form left untouched.

Customer follow-up: user reported Redirect ready. Live HTTP request returned308 with the exact HTTPS path/query, also observed in the browser. Initial browser CA warning resolved after user import; a matching trusted certificate and warning-free HTTPS login page were verified. The user's actual Chrome session was then used in a separate tab for old-HTTP dashboard navigation and reload; both showed the authenticated dashboard at HTTPS. Customer verification completed.

## Evidence / rulings

- Existing HTTPS default stays unchanged. Redirect is an optional independent service, so no CA/config identity replacement is necessary.
- Initial failure: legacy redirect installer absent. Runtime preflight then caught the official Caddy executable's required NET_BIND_SERVICE capability; same limited capability as the HTTPS service added.
- Final reviewer found that HTTPS readiness prevented recovery with an absent/stopped app. Reproduced failure with a stopped synthetic app; persisted Compose file identity and allowed journal-validated recovery before backend readiness. Final suite includes both stopped and missing app recovery.
- 2026-10-27: output/customer-ip-https/check-https.log reports 39 PASS lines and HTTPS INTEGRATION PASSED (native Windows PowerShell5.1; real production1.0.9 image).
- Owned synthetic fixture containers, networks, CA/database volumes and credential files were removed. Concise evidence and source fixture files remain.
- Delivery ZIP: output/customer-http-redirect/InfraScope-HTTP-Redirect.zip; SHA256 0a16cbe2c12fad53766deaed8fa6eafbabdec190df0c196806cadb8e7474d692.
- No product TypeScript changed; full application regression/lint/build were not rerun for this deployment-only change. No customer commands were executed by the agent.
