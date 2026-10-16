/**
 * Alarm Scheduler — triggers alarm evaluation every 10 minutes.
 *
 * Calls runAlarmCheck() directly (in-process) instead of HTTP POST.
 *
 * WHY DIRECT (NOT HTTP)
 * ─────────────────────
 * The old implementation sent an HTTP POST to /api/alarms/check. When the
 * HTTP connection was dropped mid-execution (timeout, Node/Next.js pressure),
 * the route handler's finally block could be skipped — leaving the mutex
 * locked and the DB unwritten. This caused multi-hour detection blackouts.
 *
 * Direct calls are executed inside the Node.js event loop as regular async
 * functions. The event loop guarantees the finally block always runs.
 */

import { prisma } from '@/lib/prisma';
import { runAlarmCheck } from '@/lib/alarms/alarm-runner';
import { createLogger } from '@/lib/logger';

const log = createLogger('alarm-scheduler');
const SCHEDULER_INTERVAL_MS = 10 * 60 * 1000;

interface AlarmSchedulerState {
  interval: NodeJS.Timeout | null;
  tickInProgress: boolean;
  startedAt: Date | null;
  generation?: number;
}

const globalScheduler = globalThis as typeof globalThis & {
  __infrascopeAlarmScheduler?: AlarmSchedulerState;
};

function getState(): AlarmSchedulerState {
  if (!globalScheduler.__infrascopeAlarmScheduler) {
    globalScheduler.__infrascopeAlarmScheduler = {
      interval: null,
      tickInProgress: false,
      startedAt: null,
    };
  }
  return globalScheduler.__infrascopeAlarmScheduler;
}

async function writeHeartbeat(ok: boolean, durationMs: number): Promise<void> {
  try {
    await prisma.systemConfig.upsert({
      where: { key: 'scheduler_last_tick' },
      update: {
        value: JSON.stringify({ ts: new Date().toISOString(), ok, durationMs }),
      },
      create: {
        key: 'scheduler_last_tick',
        value: JSON.stringify({ ts: new Date().toISOString(), ok, durationMs }),
      },
    });
  } catch (error) {
    log.warn({ err: error }, 'Scheduler heartbeat write failed');
  }
}

async function runScheduledTick(): Promise<void> {
  const state = getState();
  if (state.tickInProgress) {
    log.warn('Previous tick still running, skipping this interval');
    return;
  }

  state.tickInProgress = true;
  const tickStart = Date.now();
  let ok = false;

  try {
    log.info('Starting scheduled alarm check');
    const result = await runAlarmCheck();
    ok = result.success;

    if (result.success) {
      log.info(
        {
          triggered: result.summary.triggered,
          errors: result.summary.errors,
          duration: Date.now() - tickStart,
        },
        'Check completed'
      );
    } else {
      log.error(
        { error: result.error, duration: Date.now() - tickStart },
        'Check failed'
      );
    }
  } catch (error) {
    log.error({ err: error, duration: Date.now() - tickStart }, 'Unexpected scheduler error');
  } finally {
    await writeHeartbeat(ok, Date.now() - tickStart);
    state.tickInProgress = false;
  }
}

/**
 * Start the alarm scheduler.
 * Runs alarm check every 10 minutes.
 */
export function startAlarmScheduler(options: { runImmediately?: boolean } = {}) {
  const state = getState();
  if (state.interval) {
    log.info('Already running, skipping initialization');
    return;
  }

  state.startedAt = new Date();
  const generation = state.generation = (state.generation ?? 0) + 1;
  state.interval = setInterval(() => {
    if (state.generation !== generation || !state.interval) return;
    void runScheduledTick();
  }, SCHEDULER_INTERVAL_MS);

  log.info('Started — checks will run every 10 minutes');

  if (options.runImmediately !== false) {
    queueMicrotask(() => {
      if (state.generation !== generation || !state.interval) return;
      void runScheduledTick();
    });
  }
}

/**
 * Stop the alarm scheduler.
 */
export function stopAlarmScheduler() {
  const state = getState();
  state.generation = (state.generation ?? 0) + 1;
  if (state.interval) {
    clearInterval(state.interval);
    state.interval = null;
    state.startedAt = null;
    log.info('Stopped');
  }
}

/**
 * Get current scheduler status.
 */
export function getSchedulerStatus() {
  const state = getState();
  return {
    running: state.interval !== null,
    tickInProgress: state.tickInProgress,
    startedAt: state.startedAt,
    intervalMs: SCHEDULER_INTERVAL_MS,
    intervalMinutes: 10,
  };
}
