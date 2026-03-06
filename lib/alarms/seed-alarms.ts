/**
 * Seed alarm definitions into the database.
 * Can be called from API route: POST /api/alarms/definitions/seed
 */

import { prisma } from '@/lib/prisma';
import { ALARM_DEFINITIONS } from './alarm-definitions';

export async function seedAlarmDefinitions(): Promise<{ created: number; updated: number; total: number }> {
  let created = 0;
  let updated = 0;

  for (const def of ALARM_DEFINITIONS) {
    const existing = await prisma.alarmDefinition.findUnique({
      where: { code: def.code },
    });

    if (existing) {
      // Update detection logic, metadata, and notification settings
      await prisma.alarmDefinition.update({
        where: { code: def.code },
        data: {
          name: def.name,
          description: def.description,
          category: def.category,
          severity: def.severity,
          detectionLogic: def.detectionLogic as any,
          notifyEmail: def.notifyEmail ?? true,
        },
      });
      updated++;
    } else {
      await prisma.alarmDefinition.create({
        data: {
          code: def.code,
          name: def.name,
          description: def.description,
          category: def.category,
          severity: def.severity,
          cooldownMinutes: def.cooldownMinutes,
          detectionLogic: def.detectionLogic as any,
          enabled: true,
          notifyEmail: def.notifyEmail ?? true,
        },
      });
      created++;
    }
  }

  const total = await prisma.alarmDefinition.count();
  console.log(`[SeedAlarms] Created: ${created}, Updated: ${updated}, Total: ${total}`);
  return { created, updated, total };
}
