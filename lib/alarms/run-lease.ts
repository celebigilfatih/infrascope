import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AlarmExecutionError, type AlarmExecution } from './execution-context';

export const ALARM_RUN_LEASE_KEY = 'alarm-runner-lease-v1';
export const ALARM_RUN_LEASE_MS = 12 * 60_000;
export const ALARM_RUN_TIMEOUT_MS = 10 * 60_000;
const LOCK_KEY = 2147380048;
type Owner = { owner: string; runLogId: string; expiresAt: number };
type Claim = Owner & { startedAt: number };
const transactionOptions = { isolationLevel: 'ReadCommitted' as const, maxWait: 5_000, timeout: 10_000 };

async function lock(tx: Prisma.TransactionClient): Promise<number> {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${LOCK_KEY}::bigint)`;
  const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  return clock.now.getTime();
}
async function owner(tx: Prisma.TransactionClient): Promise<Owner | null> {
  const row = await tx.systemConfig.findUnique({ where: { key: ALARM_RUN_LEASE_KEY } });
  if (!row) return null;
  const value = JSON.parse(row.value) as Owner;
  if (typeof value.owner !== 'string' || typeof value.runLogId !== 'string' || !Number.isFinite(value.expiresAt)) {
    throw new AlarmExecutionError('ALARM_LEASE_INVALID', 'Alarm ownership record is invalid');
  }
  return value;
}
async function reconcile(tx: Prisma.TransactionClient, now: number, previous: Owner | null) {
  if (previous && previous.expiresAt > now) return;
  await tx.alarmCheckLog.updateMany({ where: { status: 'RUNNING', OR: [
    ...(previous ? [{ id: previous.runLogId }] : []), { checkTime: { lte: new Date(now - ALARM_RUN_LEASE_MS) } },
  ] }, data: { status: 'ORPHANED' } });
}
export async function reconcileAlarmRuns(): Promise<void> {
  await prisma.$transaction(async tx => { const now = await lock(tx); await reconcile(tx, now, await owner(tx)); }, transactionOptions);
}
export async function claimAlarmRun(): Promise<Claim | null> {
  return prisma.$transaction(async tx => {
    const now = await lock(tx), previous = await owner(tx);
    if (previous && previous.expiresAt > now) return null;
    await reconcile(tx, now, previous);
    // A recent pre-upgrade runner has no lease; wait for it rather than racing it.
    if (await tx.alarmCheckLog.findFirst({ where: { status: 'RUNNING' } })) return null;
    const row = await tx.alarmCheckLog.create({ data: { checkTime: new Date(now), totalAlarms: 0,
      triggeredCount: 0, errorCount: 0, durationMs: 0, status: 'RUNNING' } });
    const claim = { owner: randomUUID(), runLogId: row.id, expiresAt: now + ALARM_RUN_LEASE_MS, startedAt: now };
    const value = JSON.stringify(claim);
    await tx.systemConfig.upsert({ where: { key: ALARM_RUN_LEASE_KEY }, create: { key: ALARM_RUN_LEASE_KEY, value }, update: { value } });
    return claim;
  }, transactionOptions);
}
async function assertOwner(tx: Prisma.TransactionClient, claim: Claim) {
  const now = await lock(tx), value = await owner(tx);
  if (!value || value.owner !== claim.owner || value.runLogId !== claim.runLogId || value.expiresAt <= now) {
    throw new AlarmExecutionError('ALARM_LEASE_LOST', 'Alarm execution no longer owns the run');
  }
}
export function createAlarmExecution(claim: Claim) {
  const controller = new AbortController(), deadline = Date.now() + ALARM_RUN_TIMEOUT_MS;
  const execution: AlarmExecution = {
    signal: controller.signal,
    assertActive() {
      if (controller.signal.aborted || Date.now() >= deadline) {
        controller.abort();
        throw new AlarmExecutionError('ALARM_RUN_CANCELLED', 'Alarm execution was cancelled or timed out');
      }
    },
    async fence(tx) {
      execution.assertActive();
      try { await assertOwner(tx, claim); execution.assertActive(); }
      catch (error) { controller.abort(); throw error; }
    },
  };
  return { execution, cancel: () => controller.abort() };
}
export async function finishAlarmRun(claim: Claim, data: { totalAlarms: number; triggeredCount: number; errorCount: number; durationMs: number; status: string }, execution?: AlarmExecution): Promise<void> {
  await prisma.$transaction(async tx => {
    execution?.assertActive();
    await assertOwner(tx, claim);
    execution?.assertActive();
    const updated = await tx.alarmCheckLog.updateMany({ where: { id: claim.runLogId, status: 'RUNNING' }, data });
    if (updated.count !== 1) throw new AlarmExecutionError('ALARM_RUN_FINALIZED', 'Alarm run is no longer running');
    await tx.systemConfig.updateMany({ where: { key: ALARM_RUN_LEASE_KEY }, data: { value: JSON.stringify({ ...claim, expiresAt: 0 }) } });
    execution?.assertActive();
  }, transactionOptions);
}
