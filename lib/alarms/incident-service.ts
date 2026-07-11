import { createHash } from 'crypto';
import {
  AlarmArchiveState,
  AlarmIncidentStatus,
  AlarmTransitionType,
  Prisma,
  type AlarmCategory,
  type AlarmSeverity2,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('alarm-incident');

export interface IncidentActor {
  type: 'USER' | 'SYSTEM';
  id?: string;
  name: string;
}

export interface AlarmDefinitionRef {
  id: string;
  code: string;
  name: string;
  category: AlarmCategory | string;
  severity: AlarmSeverity2 | string;
  source?: string | null;
}

export interface RecordAlarmOccurrenceInput {
  alarm: AlarmDefinitionRef;
  title: string;
  message: string;
  rawData?: Prisma.InputJsonValue | null;
  sourceIp?: string | null;
  destIp?: string | null;
  deviceName?: string | null;
  entityType?: string;
  entityId?: string;
  conditionKey?: string;
  sourceEventId?: string;
  sourceOccurredAt?: Date | null;
}

export type IncidentAction =
  | 'ACKNOWLEDGE'
  | 'UNACKNOWLEDGE'
  | 'RESOLVE'
  | 'CLOSE'
  | 'ARCHIVE'
  | 'RESTORE'
  | 'ASSIGN'
  | 'SET_LEGAL_HOLD'
  | 'RELEASE_LEGAL_HOLD';

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function rawObject(rawData: Prisma.InputJsonValue | null | undefined): Record<string, unknown> {
  if (Array.isArray(rawData)) {
    const first = rawData[0];
    return first && typeof first === 'object' && !Array.isArray(first)
      ? first as Record<string, unknown>
      : {};
  }
  return rawData && typeof rawData === 'object'
    ? rawData as Record<string, unknown>
    : {};
}

function firstString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return undefined;
}

export function buildOccurrenceIdentity(input: RecordAlarmOccurrenceInput): {
  fingerprint: string;
  sourceEventId: string;
  entityType: string;
  entityId: string;
  conditionKey: string;
} {
  const raw = rawObject(input.rawData);
  const nmsDeviceId = firstString(raw, ['nms_device_id', 'nmsDeviceId']);
  const interfaceIndex = firstString(raw, ['interface_index', 'interfaceIndex']);
  const vmwareId = firstString(raw, ['moRef', 'moref', 'vmMoref', 'vmId', 'hostId', 'datastoreId']);
  const user = firstString(raw, ['user', 'user_name', 'username']);

  const inferredEntityType = nmsDeviceId
    ? (interfaceIndex ? 'nms-port' : 'nms-device')
    : vmwareId
      ? 'vmware-object'
      : user
        ? 'user'
        : input.deviceName
          ? 'device'
          : input.sourceIp
            ? 'ip'
            : 'alarm-source';

  const inferredEntityId = nmsDeviceId
    ? `${nmsDeviceId}${interfaceIndex ? `:${interfaceIndex}` : ''}`
    : vmwareId
      ?? user
      ?? input.deviceName
      ?? input.sourceIp
      ?? input.destIp
      ?? 'global';

  const conditionKey = input.conditionKey
    ?? firstString(raw, ['cfgpath', 'interface_name', 'snapshotName', 'policyid', 'action'])
    ?? 'default';
  const entityType = input.entityType ?? inferredEntityType;
  const entityId = input.entityId ?? inferredEntityId;
  const fingerprint = hash(`${input.alarm.code}|${entityType}|${entityId}|${conditionKey}`);

  const externalId = input.sourceEventId
    ?? firstString(raw, ['logId', 'logid', 'eventId', 'event_id', 'id', 'uuid'])
    ?? hash(stableSerialize({
      alarmCode: input.alarm.code,
      entityType,
      entityId,
      conditionKey,
      rawData: input.rawData ?? null,
    }));

  return {
    fingerprint,
    sourceEventId: `${input.alarm.code}:${externalId}`,
    entityType,
    entityId,
    conditionKey,
  };
}

async function recordInTransaction(input: RecordAlarmOccurrenceInput) {
  const identity = buildOccurrenceIdentity(input);
  const source = input.alarm.source ?? 'unknown';
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const duplicate = await tx.alarmEvent.findUnique({
      where: {
        alarmId_sourceEventId: {
          alarmId: input.alarm.id,
          sourceEventId: identity.sourceEventId,
        },
      },
      include: { incident: true },
    });
    if (duplicate?.incident) {
      return { event: duplicate, incident: duplicate.incident, created: false, reopened: false };
    }

    let incident = await tx.alarmIncident.findUnique({
      where: { activeFingerprint: identity.fingerprint },
    });
    let newIncident = false;
    let reopened = false;

    if (!incident) {
      incident = await tx.alarmIncident.create({
        data: {
          alarmId: input.alarm.id,
          fingerprint: identity.fingerprint,
          activeFingerprint: identity.fingerprint,
          status: AlarmIncidentStatus.OPEN,
          severity: input.alarm.severity as AlarmSeverity2,
          category: input.alarm.category as AlarmCategory,
          source,
          title: input.title,
          message: input.message,
          entityType: identity.entityType,
          entityId: identity.entityId,
          conditionKey: identity.conditionKey,
          firstSeenAt: input.sourceOccurredAt ?? now,
          lastSeenAt: input.sourceOccurredAt ?? now,
          occurrenceCount: 1,
          transitions: {
            create: {
              type: AlarmTransitionType.CREATED,
              toStatus: AlarmIncidentStatus.OPEN,
              actorType: 'SYSTEM',
              actorName: 'detection-engine',
              reason: 'First occurrence detected',
            },
          },
        },
      });
      newIncident = true;
    } else if (incident.status === AlarmIncidentStatus.RESOLVED) {
      const previousStatus = incident.status;
      incident = await tx.alarmIncident.update({
        where: { id: incident.id },
        data: {
          status: AlarmIncidentStatus.OPEN,
          archiveState: AlarmArchiveState.HOT,
          resolvedAt: null,
          resolvedById: null,
          resolvedBy: null,
          resolutionReason: null,
          archivedAt: null,
          archiveReason: null,
          reopenCount: { increment: 1 },
          lastSeenAt: input.sourceOccurredAt ?? now,
          title: input.title,
          message: input.message,
          transitions: {
            create: {
              type: AlarmTransitionType.REOPENED,
              fromStatus: previousStatus,
              toStatus: AlarmIncidentStatus.OPEN,
              actorType: 'SYSTEM',
              actorName: 'detection-engine',
              reason: 'Condition detected again',
            },
          },
        },
      });
      reopened = true;
    }

    const eventAcknowledged = incident.status === AlarmIncidentStatus.ACKNOWLEDGED;
    const event = await tx.alarmEvent.create({
      data: {
        alarmId: input.alarm.id,
        incidentId: incident.id,
        fingerprint: identity.fingerprint,
        sourceEventId: identity.sourceEventId,
        sourceOccurredAt: input.sourceOccurredAt,
        severity: input.alarm.severity as AlarmSeverity2,
        title: input.title,
        message: input.message,
        rawData: input.rawData ?? undefined,
        sourceIp: input.sourceIp,
        destIp: input.destIp,
        deviceName: input.deviceName,
        acknowledged: eventAcknowledged,
        acknowledgedAt: eventAcknowledged ? incident.acknowledgedAt : null,
        acknowledgedBy: eventAcknowledged ? incident.acknowledgedBy : null,
      },
    });

    if (!newIncident) {
      incident = await tx.alarmIncident.update({
        where: { id: incident.id },
        data: {
          occurrenceCount: { increment: 1 },
          lastSeenAt: input.sourceOccurredAt ?? now,
          title: input.title,
          message: input.message,
          severity: input.alarm.severity as AlarmSeverity2,
          category: input.alarm.category as AlarmCategory,
          source,
        },
      });
    }

    return { event, incident, created: true, reopened };
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function recordAlarmOccurrence(input: RecordAlarmOccurrenceInput) {
  try {
    return await recordInTransaction(input);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const identity = buildOccurrenceIdentity(input);
      const event = await prisma.alarmEvent.findUnique({
        where: {
          alarmId_sourceEventId: {
            alarmId: input.alarm.id,
            sourceEventId: identity.sourceEventId,
          },
        },
        include: { incident: true },
      });
      if (event?.incident) return { event, incident: event.incident, created: false, reopened: false };

      log.info({ fingerprint: identity.fingerprint }, 'Concurrent incident claim detected, retrying');
      return recordInTransaction(input);
    }
    throw error;
  }
}

function transitionType(action: IncidentAction): AlarmTransitionType {
  const mapping: Record<IncidentAction, AlarmTransitionType> = {
    ACKNOWLEDGE: AlarmTransitionType.ACKNOWLEDGED,
    UNACKNOWLEDGE: AlarmTransitionType.UNACKNOWLEDGED,
    RESOLVE: AlarmTransitionType.RESOLVED,
    CLOSE: AlarmTransitionType.CLOSED,
    ARCHIVE: AlarmTransitionType.ARCHIVED,
    RESTORE: AlarmTransitionType.RESTORED,
    ASSIGN: AlarmTransitionType.ASSIGNED,
    SET_LEGAL_HOLD: AlarmTransitionType.LEGAL_HOLD_SET,
    RELEASE_LEGAL_HOLD: AlarmTransitionType.LEGAL_HOLD_RELEASED,
  };
  return mapping[action];
}

export async function transitionAlarmIncident(params: {
  incidentId: string;
  action: IncidentAction;
  actor: IncidentActor;
  reason?: string;
  assigneeId?: string | null;
  assigneeName?: string | null;
}) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const incident = await tx.alarmIncident.findUniqueOrThrow({ where: { id: params.incidentId } });
    const data: Prisma.AlarmIncidentUpdateInput = {};
    let toStatus: AlarmIncidentStatus | undefined;

    switch (params.action) {
      case 'ACKNOWLEDGE':
        if (incident.status !== AlarmIncidentStatus.OPEN) return incident;
        toStatus = AlarmIncidentStatus.ACKNOWLEDGED;
        Object.assign(data, {
          status: toStatus,
          acknowledgedAt: now,
          acknowledgedById: params.actor.id,
          acknowledgedBy: params.actor.name,
        });
        break;
      case 'UNACKNOWLEDGE':
        if (incident.status !== AlarmIncidentStatus.ACKNOWLEDGED) return incident;
        toStatus = AlarmIncidentStatus.OPEN;
        Object.assign(data, { status: toStatus, acknowledgedAt: null, acknowledgedById: null, acknowledgedBy: null });
        break;
      case 'RESOLVE':
        if (incident.status !== AlarmIncidentStatus.OPEN && incident.status !== AlarmIncidentStatus.ACKNOWLEDGED) return incident;
        toStatus = AlarmIncidentStatus.RESOLVED;
        Object.assign(data, {
          status: toStatus,
          resolvedAt: now,
          resolvedById: params.actor.id,
          resolvedBy: params.actor.name,
          resolutionReason: params.reason,
        });
        break;
      case 'CLOSE':
        if (incident.status !== AlarmIncidentStatus.RESOLVED) throw new Error('Only resolved incidents can be closed');
        toStatus = AlarmIncidentStatus.CLOSED;
        Object.assign(data, {
          status: toStatus,
          activeFingerprint: null,
          closedAt: now,
          closedById: params.actor.id,
          closedBy: params.actor.name,
          closeReason: params.reason,
        });
        break;
      case 'ARCHIVE':
        if (incident.status !== AlarmIncidentStatus.CLOSED) throw new Error('Only closed incidents can be archived');
        Object.assign(data, { archiveState: AlarmArchiveState.ARCHIVED, archivedAt: now, archiveReason: params.reason });
        break;
      case 'RESTORE':
        Object.assign(data, { archiveState: AlarmArchiveState.HOT, archivedAt: null, archiveReason: null });
        break;
      case 'ASSIGN':
        Object.assign(data, { assignedToId: params.assigneeId, assignedTo: params.assigneeName, assignedAt: now });
        break;
      case 'SET_LEGAL_HOLD':
        Object.assign(data, { legalHold: true });
        break;
      case 'RELEASE_LEGAL_HOLD':
        Object.assign(data, { legalHold: false });
        break;
    }

    const updated = await tx.alarmIncident.update({
      where: { id: incident.id },
      data: {
        ...data,
        transitions: {
          create: {
            type: transitionType(params.action),
            fromStatus: incident.status,
            toStatus: toStatus ?? incident.status,
            actorType: params.actor.type,
            actorId: params.actor.id,
            actorName: params.actor.name,
            reason: params.reason,
            metadata: params.action === 'ASSIGN'
              ? { assigneeId: params.assigneeId, assigneeName: params.assigneeName }
              : undefined,
          },
        },
      },
    });

    if (toStatus) {
      const acknowledged = toStatus !== AlarmIncidentStatus.OPEN;
      await tx.alarmEvent.updateMany({
        where: { incidentId: incident.id },
        data: {
          acknowledged,
          acknowledgedAt: acknowledged ? now : null,
          acknowledgedBy: acknowledged ? params.actor.name : null,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        entity: 'AlarmIncident',
        entityId: incident.id,
        action: params.action.toLowerCase(),
        resource: 'alarm',
        resourceId: incident.id,
        userId: params.actor.type === 'USER' ? params.actor.id : undefined,
        details: {
          fromStatus: incident.status,
          toStatus: toStatus ?? incident.status,
          reason: params.reason,
        },
      },
    });

    return updated;
  });
}

export async function resolveIncidentsForEvents(eventIds: string[], reason: string): Promise<number> {
  const events = await prisma.alarmEvent.findMany({
    where: { id: { in: eventIds } },
    select: { id: true, incidentId: true },
  });
  const incidentIds = [...new Set(events.map((event) => event.incidentId).filter((id): id is string => Boolean(id)))];
  const actor: IncidentActor = { type: 'SYSTEM', name: 'detection-engine' };

  for (const incidentId of incidentIds) {
    await transitionAlarmIncident({ incidentId, action: 'RESOLVE', actor, reason });
  }

  const legacyEventIds = events.filter((event) => !event.incidentId).map((event) => event.id);
  if (legacyEventIds.length > 0) {
    await prisma.alarmEvent.updateMany({
      where: { id: { in: legacyEventIds } },
      data: { acknowledged: true, acknowledgedBy: 'system:auto-resolve', acknowledgedAt: new Date() },
    });
  }

  return incidentIds.length + legacyEventIds.length;
}
