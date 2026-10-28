# Customer IP HTTPS Implementation Plan

> Execute inline. Existing user authorization covers the selected IP HTTPS approach.

**Goal:** Make customer LAN login work with Secure cookies at https://10.60.0.1.
**Architecture:** Independent digest-pinned Caddy reverse proxy with a persistent local CA, existing app network, explicit CA verification and separate client trust step.
**Tech Stack:** Docker Compose, Caddy, Windows PowerShell5.1, Python HTTPS integration test.
**Spec:** docs/superpowers/specs/2026-10-27-customer-ip-https-design.md

**Deferred standard-package integration:** [Next customer package plan](2026-10-27-next-customer-package.md). User requested planning only; build/package/publish after the remaining improvements are completed.

## Constraints
- Do not weaken Secure/HttpOnly/SameSite or TLS verification.
- Do not modify existing application containers, .env, image pins or data.
- Export only the public CA certificate; never CA private keys or customer credentials.
- Target customer port443. Do not change firewall/trust settings through UI automation.

## Tasks
- [x] Write an integration check for the HTTPS package and watch it fail because the package is absent.
- [x] Add deploy/https/Caddyfile, compose.yml, install-https.ps1 and README; pin official Caddy digest.
- [x] Run native Windows PS5.1 installer against isolated real production-app fixture. Verify TLS trust, login/me, unchanged original app/env, repeatable CA.
- [x] Review failure guards, parse PS5.1, package/checksum. Review found no Important/Critical issues.
- [x] Customer manually transferred the package after RDM automation failed; user reported successful installer execution.
- [x] User installed HTTPS and client public CA trust. Actual customer Chrome dashboard access and authenticated reload were verified; see the HTTP redirect plan for follow-up evidence.

Validation logs and owned fixture metadata live under output/customer-ip-https/. Keep completion claims aligned with those results.

## Validation status (2026-10-27)
The initial 13 real production-image HTTPS checks passed; the later combined HTTPS/redirect suite passed all 39 checks and its concise evidence is in output/customer-ip-https/check-https.log. The HTTPS-only installer preserved the original fixture app container and environment; the separate redirect migration subsequently changed only APP_PORT and recreated the app as designed. Owned QA Docker containers, networks and volumes were removed; synthetic credential files and verbose inspect log were deleted. Fixture source files and the concise test report remain. Customer HTTPS installation, client trust and real Chrome authenticated refresh were subsequently verified. No application TypeScript files changed; the full application regression suite was not rerun for this deployment-only package.

Delivery: output/customer-ip-https/InfraScope-HTTPS.zip
SHA256: 64bad8a2941d3fcd7d47998ff5047bb2d6b1f2904142dfffcf97f618172efec3
