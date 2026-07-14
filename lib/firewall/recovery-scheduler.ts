import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { probeFirewallConnector } from './probe';

const log = createLogger('firewall-recovery');
const RECOVERY_LOCK_ID = 244_173_006;
const SCHEDULER_INTERVAL_MS = 60_000;
const STARTUP_DELAY_MS = 5_000;
const CLAIM_LEASE_MS = 2 * 60_000;
const CLAIM_BATCH_SIZE = 12;
const PROBE_CONCURRENCY = 3;
const HEARTBEAT_KEY = 'firewall_recovery_last_tick';

export type FirewallRecoveryResult = {
  claimed: number;
  succeeded: number;
  unavailable: number;
  failed: number;
  durationMs: number;
  skipped?: boolean;
};

type RecoveryGlobal = typeof globalThis & {
  __infrascopeFirewallRecoveryTimer?: NodeJS.Timeout;
  __infrascopeFirewallRecoveryStartupTimer?: NodeJS.Timeout;
  __infrascopeFirewallRecoveryRun?: Promise<FirewallRecoveryResult>;
  __infrascopeFirewallRecoveryLastResult?: FirewallRecoveryResult;
};

async function claimDueConnectors(now: Date): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    const lock = await tx.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_try_advisory_xact_lock(${RECOVERY_LOCK_ID}) AS acquired
    `;
    if (!lock[0]?.acquired) return [];

    const due = await tx.firewallConnector.findMany({
      where: {
        integrationConfig: { enabled: true },
        OR: [
          { nextProbeAt: null },
          { nextProbeAt: { lte: now } },
        ],
      },
      select: { id: true },
      orderBy: [
        { nextProbeAt: 'asc' },
        { createdAt: 'asc' },
      ],
      take: CLAIM_BATCH_SIZE,
    });
    const ids = due.map((item) => item.id);
    if (ids.length === 0) return [];

    await tx.firewallConnector.updateMany({
      where: { id: { in: ids } },
      data: { nextProbeAt: new Date(now.getTime() + CLAIM_LEASE_MS) },
    });
    return ids;
  });
}

async function persistHeartbeat(result: FirewallRecoveryResult): Promise<void> {
  await prisma.systemConfig.upsert({
    where: { key: HEARTBEAT_KEY },
    create: { key: HEARTBEAT_KEY, value: JSON.stringify({ at: new Date().toISOString(), ...result }) },
    update: { value: JSON.stringify({ at: new Date().toISOString(), ...result }) },
  });
}

async function runClaimedProbes(ids: string[]): Promise<Pick<FirewallRecoveryResult, 'succeeded' | 'unavailable' | 'failed'>> {
  let succeeded = 0;
  let unavailable = 0;
  let failed = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < ids.length) {
      const index = cursor;
      cursor += 1;
      const connectorId = ids[index];
      try {
        const result = await probeFirewallConnector(connectorId, { trigger: 'scheduled' });
        if (result.status.connected) succeeded += 1;
        else unavailable += 1;
      } catch (error) {
        failed += 1;
        log.error({ err: error, connectorId }, 'Scheduled firewall probe failed');
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(PROBE_CONCURRENCY, ids.length) }, () => worker())
  );
  return { succeeded, unavailable, failed };
}

async function performRecoveryCycle(): Promise<FirewallRecoveryResult> {
  const startedAt = Date.now();
  const ids = await claimDueConnectors(new Date());
  if (ids.length === 0) {
    const result = { claimed: 0, succeeded: 0, unavailable: 0, failed: 0, durationMs: Date.now() - startedAt };
    await persistHeartbeat(result);
    return result;
  }

  const counts = await runClaimedProbes(ids);
  const result = {
    claimed: ids.length,
    ...counts,
    durationMs: Date.now() - startedAt,
  };
  await persistHeartbeat(result);
  log.info(result, 'Firewall recovery cycle completed');
  return result;
}

export async function runFirewallRecoveryCycle(): Promise<FirewallRecoveryResult> {
  const state = globalThis as RecoveryGlobal;
  if (state.__infrascopeFirewallRecoveryRun) return state.__infrascopeFirewallRecoveryRun;

  const pending = performRecoveryCycle();
  state.__infrascopeFirewallRecoveryRun = pending;
  try {
    const result = await pending;
    state.__infrascopeFirewallRecoveryLastResult = result;
    return result;
  } finally {
    if (state.__infrascopeFirewallRecoveryRun === pending) {
      delete state.__infrascopeFirewallRecoveryRun;
    }
  }
}

export function startFirewallRecoveryScheduler(): void {
  const state = globalThis as RecoveryGlobal;
  if (state.__infrascopeFirewallRecoveryTimer || state.__infrascopeFirewallRecoveryStartupTimer) return;

  const run = () => {
    void runFirewallRecoveryCycle().catch((error) => {
      log.error({ err: error }, 'Firewall recovery cycle failed');
    });
  };
  state.__infrascopeFirewallRecoveryStartupTimer = setTimeout(() => {
    delete state.__infrascopeFirewallRecoveryStartupTimer;
    run();
    state.__infrascopeFirewallRecoveryTimer = setInterval(run, SCHEDULER_INTERVAL_MS);
    state.__infrascopeFirewallRecoveryTimer.unref?.();
  }, STARTUP_DELAY_MS);
  state.__infrascopeFirewallRecoveryStartupTimer.unref?.();

  log.info({ startupDelayMs: STARTUP_DELAY_MS, intervalMs: SCHEDULER_INTERVAL_MS }, 'Firewall recovery scheduled');
}

export function getFirewallRecoverySchedulerStatus() {
  const state = globalThis as RecoveryGlobal;
  return {
    running: Boolean(state.__infrascopeFirewallRecoveryTimer || state.__infrascopeFirewallRecoveryStartupTimer),
    cycleInProgress: Boolean(state.__infrascopeFirewallRecoveryRun),
    lastResult: state.__infrascopeFirewallRecoveryLastResult || null,
  };
}
