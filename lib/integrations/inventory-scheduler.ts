import type { IntegrationConfig } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { isLicenseValid } from '@/lib/license/client';
import { createSavedVMwareSource } from './vmware-source';
import { ZabbixService, type ZabbixConfig } from './zabbix';
import { getFortiGateConnector } from '@/lib/firewall/connector-factory';
import { unprotectIntegrationConfig } from '@/lib/security/integration-credentials';
import { recordInventorySync } from './sync-log';
import { inventorySyncOutcome, type InventorySyncOutcome } from './sync-outcome';
import { forgetRemovedInventorySchedules, inventorySyncDueAt, InventorySyncBusyError, withInventorySync } from './sync-coordinator';

const log = createLogger('inventory-scheduler');
const TYPES = ['VMWARE_VCENTER', 'ZABBIX', 'FORTIGATE'] as const;
const SCAN_MS = 15_000;
type Cycle = { attempted: number; failed: number; skipped: number };
type Runtime = { timer: ReturnType<typeof setInterval> | null; run: Promise<Cycle> | null; generation: number; last: Cycle | null };
function runtime(): Runtime {
  const root = globalThis as typeof globalThis & { __inventoryScheduler?: Runtime };
  return root.__inventoryScheduler ??= { timer: null, run: null, generation: 0, last: null };
}

async function syncRecord(record: IntegrationConfig): Promise<void> {
  const startedAt = new Date();
  let result: InventorySyncOutcome & { errors: string[] };
  try {
    const organization = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!organization) throw new Error('Inventory organization is not configured');
    if (record.type === 'VMWARE_VCENTER') {
      const { service } = createSavedVMwareSource(record);
      let cleanupFailed = false;
      let collected;
      try { collected = await service.syncToInventory(organization.id); }
      finally { try { await service.closeSession(); } catch { cleanupFailed = true; } }
      if (cleanupFailed) collected.errors.push('VMware inventory session cleanup failed');
      result = { ...collected, ...inventorySyncOutcome(collected.clustersCreated + collected.hostsCreated + collected.vmsCreated,
        collected.clustersUpdated + collected.hostsUpdated + collected.vmsUpdated, collected.datastoresProcessed, collected.errors) };
    } else if (record.type === 'ZABBIX') {
      const config = unprotectIntegrationConfig<ZabbixConfig>(record.config, 'ZABBIX');
      result = await new ZabbixService({ ...config, integrationId: record.id, pollingInterval: record.syncInterval }).syncToInventory(organization.id);
    } else {
      const { service } = await getFortiGateConnector({ configId: record.id });
      const collected = await service.syncToInventory(organization.id);
      result = { ...collected, ...inventorySyncOutcome(0, 0, collected.interfacesProcessed + collected.vlansProcessed
        + collected.policiesProcessed + collected.addressesProcessed, collected.errors) };
    }
  } catch {
    const errors = ['Scheduled inventory sync could not complete'];
    result = { ...inventorySyncOutcome(0, 0, 0, errors), errors };
  }
  await recordInventorySync(record.id, result, startedAt);
  log.info({ configId: record.id, status: result.status, itemsProcessed: result.itemsProcessed, errorCount: result.errorCount }, 'Scheduled inventory sync recorded');
  if (!result.success) throw new Error('Scheduled inventory sync was incomplete');
}

async function performCycle(isCurrent: () => boolean): Promise<Cycle> {
  const result: Cycle = { attempted: 0, failed: 0, skipped: 0 };
  if (!isCurrent() || !isLicenseValid()) return result;
  const records = await prisma.integrationConfig.findMany({ where: { enabled: true, type: { in: [...TYPES] } }, orderBy: { id: 'asc' } });
  forgetRemovedInventorySchedules(new Set(records.map(r => r.id)));
  const candidates: IntegrationConfig[] = [];
  for (const type of TYPES) {
    const matches = records.filter(r => r.type === type);
    if (type === 'FORTIGATE' && matches.length > 1) {
      result.skipped += matches.length;
      log.warn({ type }, 'Automatic inventory sync requires one enabled configuration per source type');
      continue;
    }
    for (const record of matches) {
      try { if (Date.now() >= inventorySyncDueAt(record)) candidates.push(record); }
      catch { result.skipped++; log.error({ configId: record.id }, 'Invalid inventory sync schedule'); }
    }
  }
  let cursor = 0;
  const worker = async () => {
    while (cursor < candidates.length && isCurrent() && isLicenseValid()) {
      const candidate = candidates[cursor++];
      let started = false;
      try {
        await withInventorySync(candidate.type, candidate.id, async () => {
          const current = await prisma.integrationConfig.findUnique({ where: { id: candidate.id } });
          if (!isCurrent() || !isLicenseValid() || !current?.enabled || current.type !== candidate.type
            || Date.now() < inventorySyncDueAt(current)) { result.skipped++; return; }
          result.attempted++;
          started = true;
          await syncRecord(current);
        }, () => started);
      } catch (error) {
        if (error instanceof InventorySyncBusyError) result.skipped++;
        else { result.failed++; log.error({ configId: candidate.id }, 'Scheduled inventory sync failed'); }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, candidates.length) }, () => worker()));
  return result;
}

export function runInventorySyncCycle(): Promise<Cycle> {
  const state = runtime();
  if (state.run) return state.run;
  const generation = state.generation;
  const pending = performCycle(() => state.generation === generation)
    .then(result => { state.last = result; return result; })
    .finally(() => { if (state.run === pending) state.run = null; });
  state.run = pending;
  return pending;
}

export function startInventorySyncScheduler(): void {
  const state = runtime();
  if (state.timer) return;
  state.timer = setInterval(() => {
    void runInventorySyncCycle().catch(() => log.error('Inventory schedule scan failed'));
  }, SCAN_MS);
  log.info('Inventory scheduler started');
}

export function stopInventorySyncScheduler(): void {
  const state = runtime();
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  state.generation++;
  log.info('Inventory scheduler stopped; running work retains its exclusion');
}

export function getInventorySchedulerStatus() {
  const state = runtime();
  return { running: state.timer !== null, tickInProgress: state.run !== null, intervalMs: SCAN_MS, lastResult: state.last };
}
