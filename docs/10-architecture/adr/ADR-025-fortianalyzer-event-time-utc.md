# ADR-025: FortiAnalyzer UTC event-time contract

**Status:** Accepted  
**Date:** 2026-10-16

## Decision

Audit B18 identified conflicting timestamp conversion in cache collection, live queries and alarm evaluation. Use one pure normalizer in `lib/alarms/fortianalyzer-event-time.ts` for these paths.

Prefer valid native `eventtime`, then `itime_t`, numeric/textual `itime`, then `date` + `time`. Unix epochs represent absolute time: separate `tz` never shifts them. Infer contemporary seconds/milliseconds/microseconds/nanoseconds by magnitude, truncating below milliseconds using integer arithmetic. Raw evidence and occurrence identity retain the original timestamp precision. Precision already lost by JSON numeric decoding cannot be recovered; providers should supply large epochs as strings.

Calendar strings use their inline offset first, otherwise the explicit `tz` offset (`+HHMM` or `+HH:MM`, maximum 14:00), otherwise UTC as the deterministic compatibility default. Never infer the application's host timezone or a customer's location. Validate calendar components, offsets and finite supported dates. Invalid preferred fields may fall back to another valid source field; absence of any valid time raises `SOURCE_EVENT_TIME_INVALID` in collection/live queries. Never replace source time with arrival time or treat malformed source data as authoritative empty success.

Cache and live windows use inclusive UTC bounds. The engine uses the same parser for occurrence time and off-hours evaluation; the existing business-hour policy remains separate. VMware `eventTime` handling remains available.

## Cache transition and consequences

The timestamp policy version also participates in the runtime configuration revision. A hot reload retires old in-memory collectors and their freshness. The stable configuration ID used for occurrence identity remains unchanged.

Version the derived cache timestamp in internal JSON metadata and require that version in all cache source filters. Existing rows cannot establish a clean result under the new policy; a successful collection writes corrected UTC timestamps and marks freshness. No schema migration, installation data rewrite or alarm-history replay is performed. Strip metadata before returning native evidence. Existing native cache keys are retained; text-only timestamps now contribute to the fallback key so separate textual instants do not overwrite each other.

This changes event-window membership when receipt and occurrence times disagree. Historical alarm evidence/IDs are immutable. Recollection can expose a previously missed recent occurrence and follows existing deduplication/cooldown/notification policy. Invalid log batches make the affected source/logtype unavailable; operators must resolve the source format rather than suppress the error.

## Verification

Offline regressions cover offsets, epoch units, calendar errors, host timezone independence, window boundaries, invalid-source propagation, cache/live/engine parity and unchanged raw identities. Opt-in PostgreSQL regressions cover actual persistence, range/order queries and the cache-version transition. See `docs/30-runbooks/FORTIANALYZER_EVENT_TIME.md`.
