import { prisma } from '@/lib/prisma';
import type { InventorySyncOutcome } from './sync-outcome';

/** Inventory writes remain independent; the two descriptions of one attempt commit together. */
export async function recordInventorySync(configId: string, result: InventorySyncOutcome & { errors: string[] }, startedAt: Date): Promise<void> {
  const completedAt = new Date();
  await prisma.$transaction(async tx => {
    await tx.integrationSyncLog.create({
      data: {
        configId, status: result.status, startedAt, completedAt,
        message: result.errors.length ? result.errors.join('; ') : null,
        itemsProcessed: result.itemsProcessed, itemsCreated: result.itemsCreated, itemsUpdated: result.itemsUpdated,
        errorDetails: { errorCount: result.errorCount },
      },
    });
    await tx.integrationConfig.update({ where: { id: configId }, data: { lastSyncAt: completedAt, lastSyncStatus: result.status } });
  });
}
