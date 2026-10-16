export type InventorySyncStatus = 'success' | 'partial' | 'failed';

export interface InventorySyncOutcome {
  success: boolean;
  status: InventorySyncStatus;
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  errorCount: number;
}

/** Only acknowledged writes count as progress; empty successful sources remain successful. */
export function inventorySyncOutcome(created: number, updated: number, auxiliary: number, errors: readonly string[]): InventorySyncOutcome {
  const itemsProcessed = created + updated + auxiliary;
  const status: InventorySyncStatus = errors.length === 0 ? 'success' : itemsProcessed > 0 ? 'partial' : 'failed';
  return { success: status === 'success', status, itemsProcessed, itemsCreated: created, itemsUpdated: updated, errorCount: errors.length };
}

export function inventorySyncLabel(status: InventorySyncStatus): string {
  return { success: 'Senkronizasyon tamamlandı', partial: 'Senkronizasyon kısmen tamamlandı', failed: 'Senkronizasyon başarısız' }[status];
}
