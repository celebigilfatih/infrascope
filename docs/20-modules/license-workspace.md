# License management workspace

`/settings/license` displays the application-reported license state, plan, expiry, remaining duration, device capacity and user capacity using the shared icons and semantic badges. The only request is `GET /api/license/status`. It returns a server observation timestamp and private/no-store headers. A page refresh reads local license state; it is not an explicit remote validation command. Existing status initialization behavior is unchanged.

The status route is explicitly dynamic and checks the current ACTIVE database identity with the shared settings/read guard before license initialization or usage queries. Existing ADMIN/EDITOR/VIEWER read access is retained. Invalid, expired or removed sessions and inactive/suspended accounts cannot read status. Failures return safe Turkish errors without raw provider/database details.

## Data semantics

- Missing, invalid, negative or noninteger counts are unknown; real zero remains zero. Zero limits never imply unlimited capacity and do not produce a percentage. Above-limit usage shows the actual percentage and excess count; the bar is capped at 100 with an accessible textual description.
- Devices count all inventory records; users count all user records, matching the server queries. These are not monitored-device or signed-in-user counts.
- Remaining days are calculated from expiry and the response's observation time, advanced while the screen stays open. The possibly cached `daysRemaining` field is not treated as current. Timestamps use Europe/Istanbul explicitly.
- Timestamp inputs require an explicit UTC/offset ISO date-time; ambiguous local dates stay unknown. Unknown plan metadata prevents an active-success label. Missing key metadata is distinct from an explicitly keyless local trial.
- Grace mode is distinct from an invalid/restricted state and from an elapsed expiry date. Expiry duration does not claim to be the remaining offline grace allowance. Last successful validation is separate from page read time. A keyless trial is described as a local trial state, not a remote license-server validation.
- Failed refresh preserves prior successful data with an explicit stale-data warning. No failed response or missing usage becomes a successful zero state. Reads are abortable, sequenced and bounded.
- Keys remain masked, including unexpected unmasked responses. Identity details are collapsed by default. Plan comparison reads `lib/license/features.ts` instead of maintaining an inconsistent second matrix, and distinguishes plan allowance from installed/configured feature availability.

## Operation boundary

The former activation/validation buttons called central issuer endpoints with incompatible payloads (`licenseKey` without machine ID and an empty validation POST), and expected the wrong success response contract. Those calls were removed. No credential entry, activation, cache rewrite or manual remote validation was added. License changes are described as a deployment-administrator operation. Initial setup licensing and issuer endpoints remain unchanged.

The existing status helper can lazily initialize the license client. With a configured key, that initialization can contact the issuer and update its local cache; subsequent reads use the initialized state. This workspace does not change that lifecycle or claim that all server-side initialization is side-effect-free. License renewal, issuer protocol correctness, grace policy and cross-process cache coordination are outside this presentation change.

## Verification

Run `npm run test:license-workspace` with the workspace dependencies. It uses synthetic source state, mocked database reads and blocked external transport to exercise capacity, expiry, grace, zero/unknown, HTTP errors, masking, canonical feature rights, status response caching and authorization before source reads.

The guarded disposable browser/PostgreSQL runner discovers `tests/incident-e2e/license-workspace.spec.ts`. It covers actual keyless-trial reads and all-account/device counts, current identity denial/recovery, retained read roles, unavailable/stale data, server-relative expiry despite browser clock skew and responsive light/dark keyboard disclosures. Non-trial presentation states are browser-local fixture responses; no real license/key/cache, issuer service or customer data is used. See `design-qa.md` for actual results and limits.
