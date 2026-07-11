import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { ALARM_DEFINITIONS, type AlarmDefinitionSeed } from './alarm-definitions';

const log = createLogger('alarm-catalog');
const ALARM_CATALOG_LOCK_ID = 73201498;

type AlarmCatalogClient = Pick<PrismaClient, '$transaction'>;

export interface AlarmCatalogSyncResult {
  expected: number;
  created: number;
  updated: number;
  unchanged: number;
  total: number;
}

export interface AlarmCatalogStatus {
  expected: number;
  installed: number;
  missing: string[];
  synchronized: boolean;
}

function getDefinitionSource(definition: AlarmDefinitionSeed): string {
  return definition.source ?? definition.detectionLogic.source ?? 'fortianalyzer';
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

function catalogFieldsChanged(
  existing: {
    name: string;
    description: string | null;
    category: string;
    severity: string;
    source: string | null;
    detectionLogic: Prisma.JsonValue;
  },
  definition: AlarmDefinitionSeed
): boolean {
  return (
    existing.name !== definition.name ||
    existing.description !== definition.description ||
    existing.category !== definition.category ||
    existing.severity !== definition.severity ||
    existing.source !== getDefinitionSource(definition) ||
    stableSerialize(existing.detectionLogic) !== stableSerialize(definition.detectionLogic)
  );
}

export function getAlarmCatalogStatus(installedCodes: Iterable<string>): AlarmCatalogStatus {
  const installedCodeSet = new Set(installedCodes);
  const missing = ALARM_DEFINITIONS
    .filter((definition) => !installedCodeSet.has(definition.code))
    .map((definition) => definition.code);

  return {
    expected: ALARM_DEFINITIONS.length,
    installed: ALARM_DEFINITIONS.length - missing.length,
    missing,
    synchronized: missing.length === 0,
  };
}

export async function syncAlarmCatalog(
  client: AlarmCatalogClient = prisma
): Promise<AlarmCatalogSyncResult> {
  const result = await client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ALARM_CATALOG_LOCK_ID})`;

    const existingDefinitions = await tx.alarmDefinition.findMany({
      where: {
        code: { in: ALARM_DEFINITIONS.map((definition) => definition.code) },
      },
    });
    const existingByCode = new Map(
      existingDefinitions.map((definition) => [definition.code, definition])
    );

    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (const definition of ALARM_DEFINITIONS) {
      const existing = existingByCode.get(definition.code);
      const detectionLogic = definition.detectionLogic as unknown as Prisma.InputJsonValue;
      const source = getDefinitionSource(definition);

      if (!existing) {
        await tx.alarmDefinition.create({
          data: {
            code: definition.code,
            name: definition.name,
            description: definition.description,
            category: definition.category,
            severity: definition.severity,
            source,
            detectionLogic,
            enabled: true,
            cooldownMinutes: definition.cooldownMinutes,
            notifyEmail: definition.notifyEmail ?? true,
          },
        });
        created += 1;
        continue;
      }

      if (!catalogFieldsChanged(existing, definition)) {
        unchanged += 1;
        continue;
      }

      await tx.alarmDefinition.update({
        where: { code: definition.code },
        data: {
          name: definition.name,
          description: definition.description,
          category: definition.category,
          severity: definition.severity,
          source,
          detectionLogic,
        },
      });
      updated += 1;
    }

    return {
      expected: ALARM_DEFINITIONS.length,
      created,
      updated,
      unchanged,
      total: await tx.alarmDefinition.count(),
    };
  }, {
    maxWait: 30_000,
    timeout: 120_000,
  });

  log.info(result, 'Alarm catalog synchronized');
  return result;
}
