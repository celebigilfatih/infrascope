# ADR-028: Fail-closed release quality gates

**Status:** Accepted  
**Date:** 2026-10-16

## Decision

Audit B21 identifies explicit Next.js TypeScript/ESLint build bypasses, release publication depending only on backup checks, and a TLS scanner that misses Python helpers. Release builds must fail on current type/lint/static-policy errors. Set both Next.js bypasses explicitly false and run policy/TLS/type/lint checks before compilation through `npm run build`. Direct `next build` retains Next.js's own type/lint checks; the supported release command adds the other policies.

Do not turn off rules, hide existing diagnostics in a baseline or perform a bulk unrelated refactor. Existing lint debt must block publication until fixed. Reports must distinguish policy enforcement from a successful product build. No green build is claimed when lint, external font retrieval or later compile/prerender steps have not passed.

The image publication job depends on reusable static-quality, alarm/integration, dashboard, incident and backup regression workflows for the same revision. Failed, cancelled or skipped required jobs must not publish. The normal Docker build also invokes the same application build command. No workflow, registry publication or deployment is dispatched by this patch.

Expand the existing TLS scan to Python and CommonJS and test negative fixtures. Keep the established centralized Node TLS policy exception. The Python development/test exception is allowed only for the exact reviewed policy block; edits to that block require policy review and runtime TLS regressions. This heuristic scan complements runtime tests, not a claim of complete security analysis.

No new dependencies, schema change, alarm engine or connection path is introduced. Existing source-error/occurrence regressions from B01–B20 provide actual runtime behavior coverage alongside static checks.
