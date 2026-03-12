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

let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Start the alarm scheduler.
 * Runs alarm check every 10 minutes.
 */
export function startAlarmScheduler() {
  if (schedulerInterval) {
    console.log('[AlarmScheduler] Already running, skipping initialization');
    return;
  }

  schedulerInterval = setInterval(async () => {
    const tickStart = Date.now();
    try {
      console.log('[AlarmScheduler] Starting scheduled alarm check...');

      const result = await runAlarmCheck();
      const duration = Date.now() - tickStart;

      if (result.success) {
        console.log(
          `[AlarmScheduler] ✅ Check completed: ${result.summary.triggered} triggered, ` +
            `${result.summary.errors} errors (${duration}ms)`
        );
      } else {
        console.error(
          `[AlarmScheduler] ❌ Check failed: ${result.error} (${duration}ms)`
        );
      }

      // Write heartbeat so the health endpoint can detect scheduler death
      const ok = result.success;
      try {
        await (prisma as any).systemConfig?.upsert?.({
          where: { key: 'scheduler_last_tick' },
          update: {
            value: JSON.stringify({
              ts: new Date().toISOString(),
              ok,
              durationMs: duration,
            }),
          },
          create: {
            key: 'scheduler_last_tick',
            value: JSON.stringify({
              ts: new Date().toISOString(),
              ok,
              durationMs: duration,
            }),
          },
        }).catch(() => {/* silently ignore if table doesn't exist */});
      } catch { /* never crash the scheduler over a heartbeat write */ }
    } catch (error) {
      const duration = Date.now() - tickStart;
      console.error(
        `[AlarmScheduler] ❌ Unexpected error (${duration}ms):`,
        error
      );
    }
  }, 600_000); // 10 minutes

  console.log('[AlarmScheduler] ✅ Started — checks will run every 10 minutes');
}

/**
 * Stop the alarm scheduler.
 */
export function stopAlarmScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[AlarmScheduler] Stopped');
  }
}

/**
 * Get current scheduler status.
 */
export function getSchedulerStatus() {
  return {
    running: schedulerInterval !== null,
    intervalMs: 600_000,
    intervalMinutes: 10,
  };
}
