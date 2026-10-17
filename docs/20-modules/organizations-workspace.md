# Organization management workspace

The organization workspace manages the existing Organization identity: unique name/code, optional description and timestamps. Organizations group location/inventory records within one installation; this is not a tenant-isolation boundary. No schema, dependency or migration change is required.

## Reads and presentation

GET /api/organizations uses the current ACTIVE database identity and existing organizations/read permission (ADMIN, EDITOR, VIEWER). It is explicitly dynamic, returns private/no-store and cached:false, and preserves the shared building → floor → room → rack contract used by location pages. The previous process-local 60-second cache could hide edits/deletions and is removed. Related VLAN/subnet/VMware cluster/datastore counts come from Prisma _count.

Hierarchy totals use actual returned records; incomplete subtrees stay unknown rather than becoming zero. Unsupported organization state, account counts and contact fields are not fabricated. Search tolerates Turkish case/accents across name, code, description, building and city. Location filters distinguish linked, empty and unavailable hierarchies. Summary totals cover all records independently of filters; location linkage does not imply device health.

Detail disclosure shows actual building address, floors and rooms. Room links use /locations/rooms/[id]; the generic /locations link does not claim an organization filter. Times use Istanbul display conventions. Failed refreshes retain clearly stale rows and disable writes. Initial failure, loading, empty and filtered-empty states are distinct. Identity lookup failure makes the workspace read-only. Requests are bounded, abortable and fenced against superseded reads.

## Mutations and deletion scope

POST, PUT and DELETE use the shared current-identity guard before parsing/querying organization data. Only ADMIN can write/delete; EDITOR/VIEWER read access is retained. Request headers or stale JWT roles cannot grant writes. Only name (1–160), code (1–64), and optional description (up to 2000) are accepted, with whitespace trimmed. Edit submits changed supported fields, preserves the organization ID and shows a before/after summary. P2002 maps to safe 409, P2025 to 404 and P2003 to safe 409; database internals are not returned.

Permanent deletion retains the existing database cascade policy: organization-owned buildings/floors/rooms/racks/rack units, building connections, VLANs/subnets and VMware clusters/datastores are removed. Device rows survive with nullable rack/cluster links cleared; network interface VLAN links are cleared. Connections touching removed buildings are deleted even when their other endpoint belongs to a surviving organization.

Delete confirmation names the selected organization and requires its exact code (name fallback for legacy data). Counts are from the last read; confirmation does not freeze concurrent server-side changes. Direct API deletion retains the existing admin-only contract. Free-form resource references such as historical capacity/snapshot data are not claimed to be removed by this cascade. No new organization-scoped audit contract is introduced.

HTTP status and success envelope must both pass. Mutation responses must match the intended ID and submitted fields. Unverified/5xx/network outcomes retain drafts and block retries until the dialog closes and the list refreshes successfully. There is no automatic mutation retry. Read-only inspection/cancellation does not write data.

## Verification

npm run test:organizations-workspace covers hierarchy parsing, zero/unknown distinctions, supported fields, validation, changed-field payloads, fresh reads, permission boundaries, safe conflicts, HTTP failures and response identity with synthetic adapters only.

The organizations-workspace.spec.ts browser spec uses the guarded disposable PostgreSQL runner. It covers actual CRUD/uniqueness/cascades/detachment, a surviving organization canary, stale ADMIN sessions after permission/status changes, session expiry/removal, unavailable reads, unknown hierarchy, uncertain writes and mobile light/dark cancellation. The default regression runner includes scoped lint and unit checks and discovers the browser spec. Never run these write fixtures against an existing application/database. See design-qa.md for actual run results and coverage limits.
