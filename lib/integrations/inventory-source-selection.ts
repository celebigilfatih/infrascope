import { prisma } from '@/lib/prisma';
import type { ScopedInventoryType } from './inventory-source-scope';

export class InventorySourceSelectionError extends Error {
  readonly code = 'INVENTORY_SOURCE_SELECTION_REQUIRED';
  constructor() { super('Etkin bağlantıyı configId ile seçin.'); }
}

/** Never guess a write/read target when several saved sources are enabled. */
export async function selectInventorySource(type: ScopedInventoryType, configId?: unknown) {
  if (configId !== undefined && (typeof configId !== 'string' || !configId.trim())) throw new InventorySourceSelectionError();
  const records = await prisma.integrationConfig.findMany({
    where: { type, enabled: true, ...(typeof configId === 'string' ? { id: configId } : {}) },
    orderBy: { id: 'asc' }, take: 2,
  });
  if (records.length > 1) throw new InventorySourceSelectionError();
  return records[0] ?? null;
}
