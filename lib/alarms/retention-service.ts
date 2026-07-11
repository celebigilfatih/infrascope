import { createHash } from 'crypto';
import { gzipSync } from 'zlib';
import { AlarmArchiveState, AlarmIncidentStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { transitionAlarmIncident } from './incident-service';

const log = createLogger('alarm-retention');

export interface AlarmRetentionConfig {
  rawPayloadDays: number;
  incidentArchiveDays: number;
  notificationAttemptDays: number;
  batchSize: number;
}

export interface AlarmRetentionResult {
  incidentsArchived: number;
  payloadsCompressed: number;
  notificationAttemptsDeleted: number;
  durationMs: number;
  skipped?: boolean;
}

const RETENTION_LEASE_KEY = 'alarm-retention-lease';
const RETENTION_LEASE_MS = 30 * 60 * 1000;

async function claimRetentionLease(): Promise<string | null> {
  const leaseId = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const value = JSON.stringify({ leaseId, expiresAt: Date.now() + RETENTION_LEASE_MS });

  try {
    await prisma.systemConfig.create({ data: { key: RETENTION_LEASE_KEY, value } });
    return value;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
  }

  const current = await prisma.systemConfig.findUnique({ where: { key: RETENTION_LEASE_KEY } });
  if (!current) return null;
  try {
    const parsed = JSON.parse(current.value) as { expiresAt?: number };
    if ((parsed.expiresAt ?? 0) > Date.now()) return null;
  } catch {
    // Invalid/legacy lease values are treated as expired.
  }

  const claimed = await prisma.systemConfig.updateMany({
    where: { key: RETENTION_LEASE_KEY, value: current.value },
    data: { value },
  });
  return claimed.count === 1 ? value : null;
}

async function releaseRetentionLease(value: string): Promise<void> {
  await prisma.systemConfig.updateMany({
    where: { key: RETENTION_LEASE_KEY, value },
    data: { value: JSON.stringify({ releasedAt: Date.now(), expiresAt: 0 }) },
  });
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAlarmRetentionConfig(): AlarmRetentionConfig {
  return {
    rawPayloadDays: positiveInt(process.env.ALARM_RAW_PAYLOAD_RETENTION_DAYS, 90),
    incidentArchiveDays: positiveInt(process.env.ALARM_INCIDENT_ARCHIVE_DAYS, 365),
    notificationAttemptDays: positiveInt(process.env.ALARM_NOTIFICATION_RETENTION_DAYS, 730),
    batchSize: Math.min(positiveInt(process.env.ALARM_RETENTION_BATCH_SIZE, 500), 2000),
  };
}

export async function getAlarmRetentionStats() {
  const config = getAlarmRetentionConfig();
  const rawCutoff = new Date(Date.now() - config.rawPayloadDays * 86_400_000);
  const incidentCutoff = new Date(Date.now() - config.incidentArchiveDays * 86_400_000);
  const [active, resolved, closed, archived, legalHold, payloadsPending, compressedPayloads] = await Promise.all([
    prisma.alarmIncident.count({ where: { status: { in: [AlarmIncidentStatus.OPEN, AlarmIncidentStatus.ACKNOWLEDGED] } } }),
    prisma.alarmIncident.count({ where: { status: AlarmIncidentStatus.RESOLVED } }),
    prisma.alarmIncident.count({ where: { status: AlarmIncidentStatus.CLOSED } }),
    prisma.alarmIncident.count({ where: { archiveState: AlarmArchiveState.ARCHIVED } }),
    prisma.alarmIncident.count({ where: { legalHold: true } }),
    prisma.alarmEvent.count({
      where: {
        createdAt: { lt: rawCutoff },
        archivedAt: null,
        rawData: { not: Prisma.AnyNull },
        incident: { archiveState: AlarmArchiveState.ARCHIVED, legalHold: false },
      },
    }),
    prisma.alarmArchivePayload.count(),
  ]);

  return {
    config,
    counts: { active, resolved, closed, archived, legalHold, payloadsPending, compressedPayloads },
    cutoffs: { rawPayload: rawCutoff, incidentArchive: incidentCutoff },
  };
}

export async function runAlarmRetention(): Promise<AlarmRetentionResult> {
  const startedAt = Date.now();
  const lease = await claimRetentionLease();
  if (!lease) {
    log.info('Alarm retention skipped because another instance holds the lease');
    return {
      incidentsArchived: 0,
      payloadsCompressed: 0,
      notificationAttemptsDeleted: 0,
      durationMs: Date.now() - startedAt,
      skipped: true,
    };
  }

  try {
  const config = getAlarmRetentionConfig();
  const incidentCutoff = new Date(Date.now() - config.incidentArchiveDays * 86_400_000);
  const rawCutoff = new Date(Date.now() - config.rawPayloadDays * 86_400_000);
  const notificationCutoff = new Date(Date.now() - config.notificationAttemptDays * 86_400_000);

  const incidents = await prisma.alarmIncident.findMany({
    where: {
      status: AlarmIncidentStatus.CLOSED,
      archiveState: AlarmArchiveState.HOT,
      legalHold: false,
      lastSeenAt: { lt: incidentCutoff },
    },
    select: { id: true },
    orderBy: { lastSeenAt: 'asc' },
    take: config.batchSize,
  });

  for (const incident of incidents) {
    await transitionAlarmIncident({
      incidentId: incident.id,
      action: 'ARCHIVE',
      actor: { type: 'SYSTEM', name: 'retention-worker' },
      reason: `Closed incident exceeded ${config.incidentArchiveDays}-day hot retention`,
    });
  }

  const occurrences = await prisma.alarmEvent.findMany({
    where: {
      createdAt: { lt: rawCutoff },
      archivedAt: null,
      rawData: { not: Prisma.AnyNull },
      incident: { archiveState: AlarmArchiveState.ARCHIVED, legalHold: false },
    },
    select: { id: true, incidentId: true, rawData: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: config.batchSize,
  });

  let payloadsCompressed = 0;
  for (const occurrence of occurrences) {
    if (!occurrence.incidentId || occurrence.rawData === null) continue;
    const json = JSON.stringify(occurrence.rawData);
    const checksum = createHash('sha256').update(json).digest('hex');
    const payload = gzipSync(json);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.alarmArchivePayload.findUnique({ where: { alarmEventId: occurrence.id } });
      if (existing) return;
      await tx.alarmArchivePayload.create({
        data: {
          incidentId: occurrence.incidentId!,
          alarmEventId: occurrence.id,
          checksum,
          payload,
          occurredAt: occurrence.createdAt,
        },
      });
      await tx.alarmEvent.update({
        where: { id: occurrence.id },
        data: {
          rawData: { archived: true, encoding: 'gzip-json', checksum },
          archivedAt: new Date(),
        },
      });
      payloadsCompressed += 1;
    });
  }

  const deletedAttempts = await prisma.notificationAttempt.deleteMany({
    where: {
      createdAt: { lt: notificationCutoff },
      OR: [
        { incidentId: null },
        { incident: { archiveState: AlarmArchiveState.ARCHIVED, legalHold: false } },
      ],
    },
  });

  const result = {
    incidentsArchived: incidents.length,
    payloadsCompressed,
    notificationAttemptsDeleted: deletedAttempts.count,
    durationMs: Date.now() - startedAt,
  };
  log.info(result, 'Alarm retention completed');
  return result;
  } finally {
    await releaseRetentionLease(lease).catch((error) => {
      log.error({ err: error }, 'Failed to release alarm retention lease');
    });
  }
}

type RetentionGlobal = typeof globalThis & {
  __infrascopeAlarmRetentionTimer?: NodeJS.Timeout;
  __infrascopeAlarmRetentionStartupTimer?: NodeJS.Timeout;
};

export function startAlarmRetentionScheduler(): void {
  const state = globalThis as RetentionGlobal;
  if (state.__infrascopeAlarmRetentionTimer) return;

  const now = new Date();
  const firstRun = new Date(now);
  firstRun.setHours(2, 30, 0, 0);
  if (firstRun <= now) firstRun.setDate(firstRun.getDate() + 1);
  const delay = firstRun.getTime() - now.getTime();

  state.__infrascopeAlarmRetentionStartupTimer = setTimeout(() => {
    void runAlarmRetention().catch((error) => log.error({ err: error }, 'Scheduled retention failed'));
    state.__infrascopeAlarmRetentionTimer = setInterval(() => {
      void runAlarmRetention().catch((error) => log.error({ err: error }, 'Scheduled retention failed'));
    }, 86_400_000);
  }, delay);

  log.info({ firstRun: firstRun.toISOString() }, 'Alarm retention scheduled');
}
