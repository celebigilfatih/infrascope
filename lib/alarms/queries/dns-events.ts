/**
 * Alarm Query Layer — DNS Events
 *
 * Covers: DNS_TUNNEL_SUSPECT
 *
 * DNS tunnel detection uses logtype='dns' which contains DNS query/response logs.
 * The detection is based on:
 *  1. Excluding known-good DNS servers (8.8.8.8, 8.8.4.4, internal resolvers)
 *  2. High query volume from a single source (brute-force-group clientCheck)
 *  3. Query name length anomalies (long subdomains typical of DNS tunneling)
 *
 * The exclusion of known IPs cannot be done efficiently as DB-level WHERE
 * (it would require NOT IN on srcIp/dstIp). Instead we use indexed srcIp/dstIp
 * columns to INCLUDE all events and let the detection engine exclude known-good.
 * This is acceptable because the dns logtype is moderate volume.
 */

import { runAlarmQuery, queryCache, queryFortiAnalyzerDirect, timeWindow } from './base';
import type { AlarmQueryContext, QueryResult } from './types';

// ─── DNS Tunnel Suspect ───────────────────────────────────────────────────────

/**
 * DNS_TUNNEL_SUSPECT — High-volume or anomalous DNS queries suggesting DNS tunneling.
 *
 * DB filter:
 *   logtype = 'dns'               ← logtype partition key
 *   (no further column filters — exclusion of known-good IPs is engine-side)
 *
 * Detection logic applied by engine after this returns events:
 *   filter: "(srcip != 10.5.2.1 and srcip != 10.5.2.2) and (dstip != 8.8.8.8 ...)"
 *   clientCheck: 'brute-force-group' (group by srcip, threshold > N)
 *
 * WHY no DB-level exclusion:
 *   NOT IN conditions on IP columns would prevent using the (logtype, srcIp, eventTime)
 *   composite index. It's better to fetch all dns events and exclude in memory — the
 *   dns logtype is bounded volume and the in-memory exclusion is O(N), acceptable.
 *
 * IMPORTANT: The timeWindowMinutes for this alarm is typically short (30-60 min)
 * which limits the dataset size significantly.
 */
export async function getDnsTunnelSuspectEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=dns (all, engine excludes known-good resolvers)';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        logtype: 'dns',
        eventTime: timeWindow(ctx.timeWindowMinutes),
      }),
    fa => queryFortiAnalyzerDirect(fa, 'dns', '', ctx.timeWindowMinutes)
  );
}

// ─── DNS — External Resolution Anomaly ───────────────────────────────────────

/**
 * DNS_EXTERNAL_ONLY — DNS queries going directly to external resolvers
 * (bypassing internal DNS, potential data exfiltration or C2 indicator).
 *
 * DB filter:
 *   logtype = 'dns'
 *   srcIp NOT IN internal resolvers → engine-side filter
 *   dstIp NOT IN (8.8.8.8, 8.8.4.4, known-good) → engine-side filter
 *
 * We use the same approach as DNS_TUNNEL_SUSPECT: fetch all dns events
 * and let the engine apply IP exclusions.
 */
export async function getDnsExternalResolutionEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=dns (for external resolver detection)';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        logtype: 'dns',
        eventTime: timeWindow(ctx.timeWindowMinutes),
      }),
    fa => queryFortiAnalyzerDirect(fa, 'dns', '', ctx.timeWindowMinutes)
  );
}

// ─── DNS — Specific Domain Queries ───────────────────────────────────────────

/**
 * DNS_BLOCKED — Queries blocked by DNS filter (potential C2, malware, phishing).
 *
 * DB filter:
 *   logtype = 'dns', action = 'blocked'
 *
 * FortiGate DNS filter logs action='blocked' when a query is denied.
 * These are high-value events — use softFallback.
 */
export async function getDnsBlockedEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=dns action=blocked';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        logtype: 'dns',
        action: 'blocked',
        eventTime: timeWindow(ctx.timeWindowMinutes),
      }),
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'dns',
        'action == blocked',
        ctx.timeWindowMinutes
      ),
    { softFallback: true }
  );
}
