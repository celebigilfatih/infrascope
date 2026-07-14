import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  availableFirewallData,
  staleFirewallData,
  unavailableFirewallData,
  type FirewallDataEnvelope,
} from './capabilities';
import { persistFirewallCapability } from './capability-store';
import { firewallListQueryFromUrl, paginateFirewallItems } from './read-query';
import {
  FirewallAnalyzerCorrelationError,
  resolveFirewallAnalyzerService,
} from './fortianalyzer-correlation';

export type FirewallEventCategory = 'auth' | 'security' | 'config';

type FirewallEventItem = {
  id: string;
  occurredAt: string;
  category: FirewallEventCategory;
  logtype: string;
  level: string | null;
  action: string | null;
  subtype: string | null;
  user: string | null;
  sourceIp: string | null;
  destinationIp: string | null;
  message: string | null;
  deviceId: string;
  vdom: string;
  configPath: string | null;
  configObject: string | null;
};

type EventPage = ReturnType<typeof paginateFirewallItems<FirewallEventItem>>;
const CACHE_FRESH_MS = 8 * 60 * 1000;

function normalizeVdom(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : 'root';
}

function text(value: unknown, max = 500): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function eventTime(record: Record<string, unknown>, fallback = new Date()): Date {
  const epoch = Number(record.eventtime || record.itime_t || 0);
  if (epoch > 1e17) return new Date(Math.floor(epoch / 1_000_000));
  if (epoch > 1e12) return new Date(epoch);
  if (epoch > 1e9) return new Date(epoch * 1000);
  const date = text(record.date, 20);
  const time = text(record.time, 20);
  const parsed = date ? new Date(`${date}T${time || '00:00:00'}`) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function projectRawEvent(
  raw: Record<string, unknown>,
  category: FirewallEventCategory,
  fallbackId: string,
  fallbackTime = new Date()
): FirewallEventItem {
  return {
    id: text(raw.eventid, 160) || text(raw.logid, 160) || fallbackId,
    occurredAt: eventTime(raw, fallbackTime).toISOString(),
    category,
    logtype: text(raw.type, 40) || text(raw.logtype, 40) || 'event',
    level: text(raw.level, 40),
    action: text(raw.action, 80),
    subtype: text(raw.subtype, 80),
    user: text(raw.user, 160),
    sourceIp: text(raw.srcip, 80),
    destinationIp: text(raw.dstip, 80),
    message: text(raw.msg, 500),
    deviceId: text(raw.devid, 128) || '',
    vdom: normalizeVdom(raw.vdom || raw.vd),
    configPath: text(raw.cfgpath, 200),
    configObject: text(raw.cfgobj, 200),
  };
}

function cacheCategoryWhere(category: FirewallEventCategory): Prisma.CachedEventWhereInput {
  if (category === 'auth') {
    return {
      logtype: 'event',
      OR: [
        { action: { in: ['login', 'auth-logon', 'ssl-login-fail', 'tunnel-up', 'tunnel-down'] } },
        { subtype: 'vpn' },
      ],
    };
  }
  if (category === 'config') {
    return {
      logtype: 'event',
      subtype: 'system',
      OR: [
        { action: { in: ['add', 'edit', 'delete', 'move', 'rename'] } },
        { rawLog: { path: ['logdesc'], string_contains: 'configuration' } },
        { rawLog: { path: ['logdesc'], string_contains: 'changed' } },
      ],
    };
  }
  return { logtype: { in: ['attack', 'virus', 'webfilter', 'app-ctrl', 'dns'] } };
}

function matchesRawCategory(
  raw: Record<string, unknown>,
  category: FirewallEventCategory
): boolean {
  const logtype = (text(raw.type, 40) || text(raw.logtype, 40) || '').toLowerCase();
  const subtype = (text(raw.subtype, 80) || '').toLowerCase();
  const action = (text(raw.action, 80) || '').toLowerCase();
  if (category === 'security') {
    return ['attack', 'virus', 'webfilter', 'app-ctrl', 'dns'].includes(logtype);
  }
  if (category === 'auth') {
    return logtype === 'event' && (
      subtype === 'vpn' ||
      ['login', 'auth-logon', 'ssl-login-fail', 'tunnel-up', 'tunnel-down'].includes(action)
    );
  }
  const logDescription = (text(raw.logdesc, 240) || '').toLowerCase();
  return logtype === 'event' && subtype === 'system' && (
    ['add', 'edit', 'delete', 'move', 'rename'].includes(action) ||
    Boolean(text(raw.cfgpath, 200)) ||
    logDescription.includes('configuration') ||
    logDescription.includes('changed')
  );
}

function searchWhere(search: string): Prisma.CachedEventWhereInput | undefined {
  if (!search) return undefined;
  return {
    OR: [
      { user: { contains: search, mode: 'insensitive' } },
      { action: { contains: search, mode: 'insensitive' } },
      { msg: { contains: search, mode: 'insensitive' } },
      { srcIp: { contains: search, mode: 'insensitive' } },
      { dstIp: { contains: search, mode: 'insensitive' } },
    ],
  };
}

async function pollLiveEvents(params: {
  analyzerDeviceId: string;
  vdom: string;
  category: FirewallEventCategory;
  analyzerConfigId?: string;
  fetchLimit: number;
}): Promise<FirewallEventItem[]> {
  const analyzer = await resolveFirewallAnalyzerService(params.analyzerConfigId);
  if (!await analyzer.service.login()) throw new Error('FortiAnalyzer authentication failed');
  const searches = params.category === 'auth'
    ? [
        { logtype: 'event', filter: 'subtype == system and action == login' },
        { logtype: 'event', filter: 'subtype == vpn' },
      ]
    : params.category === 'config'
      ? [{ logtype: 'event', filter: 'subtype == system' }]
      : ['attack', 'virus', 'webfilter', 'app-ctrl', 'dns'].map((logtype) => ({ logtype, filter: '' }));
  const batches: FirewallEventItem[][] = [];
  for (const search of searches) {
    const tid = await analyzer.service.startLogSearch(
      search.logtype,
      params.fetchLimit,
      search.filter || undefined,
      { deviceId: params.analyzerDeviceId }
    );
    if (!tid) throw new Error('FortiAnalyzer log search could not be started');
    let rows: Array<Record<string, unknown>> | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      rows = await analyzer.service.fetchLogResults(tid, 0, params.fetchLimit);
      if (rows?.length) break;
    }
    if (rows === null) throw new Error('FortiAnalyzer log search did not return a result');
    batches.push((rows || [])
      .filter((raw) => (
        normalizeVdom(raw.vdom || raw.vd) === params.vdom &&
        matchesRawCategory(raw, params.category)
      ))
      .map((raw, index) => projectRawEvent(
        raw,
        params.category,
        `live-${search.logtype}-${eventTime(raw).getTime()}-${index}`
      )));
  }
  return batches.flat().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export async function readFirewallAnalyzerEvents(params: {
  connectorId: string;
  category: FirewallEventCategory;
  requestUrl: string;
  analyzerConfigId?: string;
}): Promise<{
  target: { connectorId: string; deviceId: string; analyzerDeviceId: string; vdom: string };
  envelope: FirewallDataEnvelope<EventPage>;
}> {
  const connector = await prisma.firewallConnector.findUnique({
    where: { id: params.connectorId },
    select: { id: true, deviceId: true, analyzerDeviceId: true, vdom: true },
  });
  if (!connector) {
    throw new FirewallAnalyzerCorrelationError('Firewall connector not found', 'FIREWALL_NOT_FOUND', 404);
  }
  if (!connector.analyzerDeviceId) {
    throw new FirewallAnalyzerCorrelationError(
      'FortiAnalyzer identity is not verified for this firewall',
      'FORTIANALYZER_IDENTITY_NOT_VERIFIED',
      409
    );
  }
  const query = firewallListQueryFromUrl(params.requestUrl);
  const dbSearchWhere = searchWhere(query.search);
  const eventWindowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const baseWhere: Prisma.CachedEventWhereInput = {
    devid: connector.analyzerDeviceId,
    vdom: connector.vdom.toLowerCase(),
    eventTime: { gte: eventWindowStart },
    AND: [cacheCategoryWhere(params.category), ...(dbSearchWhere ? [dbSearchWhere] : [])],
  };
  const health = await prisma.cachedEvent.aggregate({
    where: { devid: connector.analyzerDeviceId, vdom: connector.vdom.toLowerCase() },
    _max: { createdAt: true },
  });
  const cacheCollectedAt = health._max.createdAt;
  const cacheFresh = Boolean(
    cacheCollectedAt && Date.now() - cacheCollectedAt.getTime() <= CACHE_FRESH_MS
  );
  const [total, rows] = await Promise.all([
    prisma.cachedEvent.count({ where: baseWhere }),
    prisma.cachedEvent.findMany({
      where: baseWhere,
      orderBy: { eventTime: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);
  const cachedPage: EventPage = {
    items: rows.map((row) => projectRawEvent(
      row.rawLog as Record<string, unknown>,
      params.category,
      row.id,
      row.eventTime
    )),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      hasMore: query.page * query.limit < total,
    },
  };
  const target = {
    connectorId: connector.id,
    deviceId: connector.deviceId,
    analyzerDeviceId: connector.analyzerDeviceId,
    vdom: connector.vdom,
  };
  if (cacheFresh && cacheCollectedAt) {
    const checkedAt = new Date().toISOString();
    await persistFirewallCapability({
      connectorId: connector.id,
      source: 'event-cache',
      status: 'available',
      checkedAt,
      lastSuccessAt: cacheCollectedAt.toISOString(),
      capabilities: ['auth-events', 'security-events', 'config-change-events'],
    });
    return { target, envelope: availableFirewallData(cachedPage, 'event-cache', cacheCollectedAt.toISOString()) };
  }

  try {
    const live = await pollLiveEvents({
      analyzerDeviceId: connector.analyzerDeviceId,
      vdom: connector.vdom.toLowerCase(),
      category: params.category,
      analyzerConfigId: params.analyzerConfigId,
      fetchLimit: Math.min(Math.max(query.page * query.limit, 100), 500),
    });
    const page = paginateFirewallItems({
      items: live,
      query,
      searchText: (item) => [
        item.user,
        item.action,
        item.message,
        item.sourceIp,
        item.destinationIp,
        item.configPath,
        item.configObject,
      ].filter(Boolean).join(' '),
    });
    const checkedAt = new Date().toISOString();
    await persistFirewallCapability({
      connectorId: connector.id,
      source: 'fortianalyzer',
      status: 'available',
      checkedAt,
      capabilities: ['auth-events', 'security-events', 'config-change-events'],
    });
    return { target, envelope: availableFirewallData(page, 'fortianalyzer', checkedAt) };
  } catch (error) {
    console.error('Firewall FortiAnalyzer live event read failed:', error);
    const checkedAt = new Date().toISOString();
    await persistFirewallCapability({
      connectorId: connector.id,
      source: 'fortianalyzer',
      status: 'unavailable',
      checkedAt,
      capabilities: ['auth-events', 'security-events', 'config-change-events'],
      reason: 'FortiAnalyzer event source unavailable',
    });
    if (cacheCollectedAt) {
      return {
        target,
        envelope: staleFirewallData(
          cachedPage,
          'event-cache',
          cacheCollectedAt.toISOString(),
          'FortiAnalyzer live event source unavailable'
        ),
      };
    }
    return {
      target,
      envelope: unavailableFirewallData(
        'fortianalyzer',
        'FortiAnalyzer event source unavailable',
        { retryable: true }
      ),
    };
  }
}
