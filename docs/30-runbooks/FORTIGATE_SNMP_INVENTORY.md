# FortiGate SNMP Inventory

**Scope:** B11, the legacy FortiGate interface sync path. Existing NMS collection, polling schedules and alarm evaluation remain in place.

## Source and Modes

- `rest`: interface inventory comes from the existing FortiGate REST reader.
- `snmp`: interface inventory comes from stored NMS observations; REST-only VLAN/policy/address/VIP/SD-WAN modules must be disabled. They are unsupported in SNMP-only sync.
- `both`: interfaces use NMS while enabled REST modules use REST. An unavailable NMS interface source does not silently switch to REST.

NMS device polling configuration and its existing SNMPv2c/SNMPv3 credential resolution are authoritative. Legacy `IntegrationConfig.config.snmp` values are retained for compatibility but neither configure the NMS device nor establish that entered credentials work. The legacy connection-test action is a REST test. Never interpret it, or a cached NMS read, as an on-demand SNMP login test.

The interface sync requires a linked enabled firewall connector and its inventory device, a positive NMS device ID, polling enabled and a configured NMS SNMP profile. The connector management host and device management address must match after trimming/case normalization. An unlinked or differently addressed legacy profile needs correct inventory mapping; choosing another device by host/name or inventing an ID is forbidden.

NMS rows are device-wide and lack VDOM membership. Only the root/device-wide scope is supported. Non-root VDOM sync returns unsupported rather than presenting every physical port as that VDOM's inventory. Separate configurations may still have their own explicitly linked NMS devices; equal port names do not cross device scope.

## Availability and Data Integrity

The strict snapshot reads all rows for one NMS device in one query. It allows at most 10,000 interfaces; a larger result fails rather than being truncated. Every row must satisfy the existing freshness policy: three polling intervals bounded between two and five minutes. A timestamp more than thirty seconds in the future is invalid. A fresh row cannot hide older rows from the inventory gate. Missing rows, source errors, expired observations, ambiguous names/indices or invalid numeric data produce a failed sync before interface inventory writes.

An empty NMS table does not contain a completed-empty poll marker, so it cannot prove successful collection with zero ports. Disabled modules are intentionally skipped and carry no claimed interface source. Existing UI reads may continue to display labelled stale data; that does not authorize copying it into current inventory.

The adapter preserves source name, state, speed, MTU, counters and timestamp. Exact decimal counters remain available in observation metadata; a speed beyond safe JavaScript integer precision is null in the numeric view with its exact string retained. IP/netmask, media type, duplex, VLAN parent and VDOM membership are absent from this NMS schema and remain null. Network inventory uses explicit `OTHER`/`UNKNOWN` enums where required, preserving existing IP/MAC/type metadata on updates. No unavailable source triggers deletion of existing inventory.

The source is reported as stored `nms` observations with collection time, not a fresh SNMP network reply. NMS can populate the table through its existing SSH fallback and has no per-row transport provenance or atomic completed-poll marker. Historical collector defaults cannot be distinguished retroactively from measured per-field values. This change does not certify them, reconstruct VDOM membership, or change the Python collector's sampling policy.

## Diagnosis

1. Inspect enabled integration ID, selected VDOM, linked device, NMS ID, polling state and management address without printing credentials.
2. Check that the normal NMS poller is collecting interfaces for that device. Configure credentials in the NMS device profile, not in a guessed HTTP/161 URL or copied legacy secret.
3. Check observation count and timestamps. Fix actual polling/source failures and wait for current observations; do not rewrite timestamps, inject mock rows or enable REST as an implicit fallback.
4. In SNMP-only sync, disable unsupported modules or deliberately select `both` with its required REST capabilities. Do not treat REST status as proof that SNMP collection works.
5. Trigger the existing authorized POST sync. Confirm `success`, `interfacesProcessed`, target and `interfaceSource`. Source/item-write failure must leave a failed sync log and failed `lastSyncStatus`. The time field records a sync attempt, not proof of successful collection.

## Safe Verification

```text
npm run test:fortigate-snmp
npm run test:fortigate-alarm-targets
npm run test:integration-permissions
npm run security:fortigate-connector-check
npm run security:fortinet-snmp-check
npm run type-check
```

The new Node suite runs actual factory/service, NMS snapshot/adapter, inventory mapping and API code with synthetic transport and ORM. Tests cover all modes, missing/stale/future data, a mixed-age snapshot, full reads beyond UI pagination, exact counters, nullable properties, credentials/configuration, linked targets, unsupported scope/modules, write failures and source/error provenance. The existing SNMP credential/OID checks do not make live device requests.

`npm run test:fortigate-snmp:db` requires `INFRASCOPE_FG_SNMP_DB_TEST=1` and an explicit `127.0.0.1` disposable `*_occurrence_tests` database. Apply existing migrations only to that fresh test database. It reads actual NMS rows, observes database updates, resolves real target relations and persists actual inventory records with no device/SMTP connection. The script removes its fixture records; CI uses its own PostgreSQL service. Never run against installation data. Local commands, actual results and limits are in [ADR-018](../10-architecture/adr/ADR-018-fortigate-snmp-inventory-source.md).
