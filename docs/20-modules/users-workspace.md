# Kullanıcılar ve Roller

`/settings/users` uses shared page identity, green icons, semantic status/role badges, global account counts, Turkish filters and a responsive table/card collection. Account status is distinct from online presence. A missing login timestamp differs from an explicit null login record. The additive `lastLoginAt`, `createdAt` and activity `occurredAt` fields provide absolute times in Europe/Istanbul while legacy relative response fields remain available.

## Roles and permissions

The access view reads `DEFAULT_PERMISSIONS`/`canAccessSync`, which the application middleware and route guards actually use. The old matrix wrote `RolePermission` records although runtime callers do not call dynamic `canAccess`; its GET also reseeded default grants. This workspace does not fetch or modify that matrix, and does not claim those database toggles enforce access. Shared role rules are displayed read-only; per-user role assignment remains supported through the existing user API. Resource-specific license and route conditions still apply. The existing role policy is retained. User list/activity reads and account/password writes recheck the current ACTIVE database actor with the shared API guard; stale JWT roles do not authorize a revoked user. These routes are explicitly dynamic.

The current active actor is read through `/api/auth/me`. UI actions follow the actor's existing users write/delete policy (ADMIN/EDITOR write, ADMIN delete). Failed identity/refresh and ambiguous mutations disable new writes until refreshed. Last-admin deletion is disabled in the UI, matching the existing server guard. Account activity is labeled as records attached to that account, not necessarily actions performed by it. New management audit entries identify the acting user separately from the target resource. Self-deletion records the actor ID in immutable details without referencing a deleted user.

## Editing workflow

- Account detail shows state, role scope, absolute timestamps and optional recent records with independent loading, error and empty states.
- Edit submits only changed fields after validation; old/new values are shown before Save. New account and password forms share the server's 8–72 character, uppercase, number and special-character requirements. Password change explicitly requires the selected account's current password.
- Password drafts disappear on close/success; form errors stay inside the dialog. Delete identifies the target and its irreversible effect. No write occurs merely by opening a dialog or selecting a role.
- HTTP success and `success: true` are both required. Create/edit responses must also identify the intended account and confirm the submitted fields. Non-JSON, network and 5xx mutation failures are treated as uncertain results, blocking automatic retries. Successful writes refresh the list; refresh errors preserve the prior list with a warning instead of showing a false empty/success state.
- Existing create, update, password and delete endpoints remain responsible for validation and the existing users role policy (including EDITOR write). No role grants are added. Activity reads accept a bounded integer limit of 1–100. Invitation links only navigate to the existing invitation screen.

## Verification

The isolated regression runner includes strict scoped ESLint, full TypeScript, `npm run test:users-workspace` and `tests/incident-e2e/users-workspace.spec.ts`. Transport/database stubs cover response ambiguity, changed-field payloads, validation, unknown timestamps and licensed-create contract behavior. Signed-session browser tests use a disposable PostgreSQL database for current-identity denial/recovery, edits, password verification and deletion/audit effects. Browser creation uses an intercepted response; it does not activate a license or contact its provider. Runtime role rules, errors/retained drafts, mobile/dark layouts and keyboard disclosures are covered. See the dated entry in design-qa.md for actual run results and limits.

Customer accounts, databases, credentials, integration targets and notification recipients must not be used by these checks. This change does not alter the schema, dependencies, invitation workflow or the application's existing role-assignment policy.
