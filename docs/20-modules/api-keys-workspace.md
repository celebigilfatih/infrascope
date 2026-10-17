# API Anahtarları ekranı

`/settings/keys` uses the shared page identity, green icons and neutral capability badges. Status, access scope and last use are separate cards; the keyboard-accessible information disclosure explains their meaning without presenting sample grants as real permissions. Layout supports narrow screens and the app's dark theme.

## Current capability boundary

The application has no application API-key model, management endpoint, API-key authentication middleware or key-use log. The prior two hard-coded sample keys, dates and relative usage times were removed. No counts, active credentials, scopes or last-use timestamps are inferred. “Veri yok” does not mean “never used”.

Creation is visibly disabled with an associated explanation. Refresh, copy and revoke controls are absent because there is no supported operation behind them. The page does not request, generate, store, reveal or modify credentials. Integration-specific credentials remain in their respective settings; they are not application API keys.

This change is a UI/capability correction, not a credential-management backend. Real lifecycle, access scopes and usage information require a separately implemented and verified backend before this screen can offer them.

## Verification

Scoped ESLint (max-warnings=0), the existing Turkish UI checks, full TypeScript and the release quality/TLS/lint gates passed. The actual production build completed all 111 static pages with network disabled, a read-only container and an unreachable fixture database; emitted local Inter assets also passed validation. Four pre-existing lint warnings outside this scope remain.

Manual browser verification used the actual release-generated HTML, CSS and fonts in a localhost-only preview with scripts removed and a CSP blocking scripts/connections. Desktop (1440px), mobile (390px), light/dark themes, disabled creation with its associated description and native Enter/Space disclosure behavior were verified. Mobile content did not overflow horizontally. Screenshots and build evidence are under output/keys-workspace-review-20261017/.

This static preview does not hydrate the authenticated application shell. Live-session navigation, real key creation/revocation, API-key authentication and usage recording were not tested or implemented; those lifecycle capabilities do not exist in this version. No customer database, external integration or notification recipient was contacted.
