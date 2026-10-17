# Davetler

`/settings/users/invitations` uses the shared account-workspace icons, semantic badges, global counts, email/inviter search, role/status filters and responsive table/cards. Detail shows the assigned role's actual role rules, first creation time, recorded inviter, acceptance time and expiry in Europe/Istanbul. Unknown timestamps and roles do not become zeros, expired dates or valid resend targets.

## Status and delivery

- Pending/accepted/expired describe acceptance, not email delivery. Accepted rows remain accepted after their original expiry date. Pending rows expire from their timestamp while the page remains open.
- The status GET is now read-only; it derives expired state and statistics without updating records. Responses are private/no-store and include a server observation timestamp. Failed refresh retains old rows with a warning, and mutation buttons require a fresh list and current active actor authorization.
- Delivery results distinguish `submitted` (handed to email service, not inbox confirmation), `failed` (record saved/renewed, mail failed) and `development` (no real email). The last attempt shown by the frontend is limited to this page session; no permanent delivery history is invented.

## Creation and resend

- Creation normalizes email and identifies the inviter from the current server-side actor. Existing account/invitation collisions return explicit errors instead of deleting old invitations or failing on an expired record's unique email.
- `POST /api/users/invite/[id]/resend` requires the existing users-write policy through the current active database actor and checks the user-license limit. It rejects accepted/used invitations and existing accounts. Recipient, role, original creation time and **token remain unchanged**. The same link gains a fresh seven-day expiry; old copies share the renewed deadline. The confirmation dialog states this before any request.
- Conditional update compares ID, token, expiry, unused state and status. Simultaneous resends from the same snapshot cannot both send. A one-millisecond adjustment handles an exactly equal expiry without a no-op compare-and-set. Email failure retains the renewed record and is returned distinctly; no automatic retry occurs. No token is exposed in list, operation responses or audit details.
- Unknown mutation outcomes block further sends until the user closes the dialog and refreshes. HTTP success and a valid response contract matching the intended recipient, role and selected resend record are both required. No mail is sent by reads, filtering or opening dialogs.

## First-time recipient acceptance

The previous middleware required an existing session for `/api/users/verify`, although recipients have no account yet. Only **GET and POST on that exact path** now use invitation-token authentication; all other users/invite endpoints still require their normal sessions/roles. Verification uses the authentication rate-limit configuration. The recipient UI distinguishes invalid tokens from unavailable sources, bounds/aborts reads, requires both HTTP and account-scope confirmation for success and prevents blind POST retry after an uncertain result. The route validates a 64-hex invitation token, expiry, unused status, name/password constraints, existing account and user quota. Account creation, invitation claim and initial activity are committed together in a serializable transaction, with a second quota check inside the transaction; the unused/unexpired token is checked again inside the transaction after password hashing. Request-supplied role fields cannot alter the stored invitation role. Concurrent invitation acceptance cannot consume the same token twice or exceed the available invitation-acceptance user quota. Serialization conflicts return an explicit rejection for manual re-evaluation. No session is automatically issued.

Invitation mail content and the recipient's role label are Turkish. Password reset transport/content is outside this change. SMTP invitation timeouts are bounded, and development-mode simulation is explicitly identified in the UI. The development invitation logger omits the bearer URL/token.

## Verification

The isolated regression runner includes strict scoped ESLint, full TypeScript, `npm run test:invitations-workspace`, existing SMTP credential-storage checks and `tests/incident-e2e/invitations-workspace.spec.ts`. Transport/database stubs cover delivery failures and contract/timeout boundaries. Signed-session browser tests use a disposable PostgreSQL database for reads, creation/resend, role/session denials, first-time acceptance, same/different-token concurrency, quota and transaction rollback. Mail attempts use explicitly reported development simulation; no SMTP recipient or license provider is contacted. UI checks cover invalid/unavailable distinctions, retained drafts, wrong-target responses and mobile/dark confirmations.

See the dated entry in design-qa.md for actual results and limitations. Installation environment files, customer accounts/data and notification recipients must never be used by these checks. No schema, dependency or unrelated password-reset change is included.
