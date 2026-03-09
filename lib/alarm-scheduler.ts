/**
 * Alarm Scheduler
 * Automatically triggers alarm evaluation at regular intervals
 */

import { prisma } from '@/lib/prisma';

let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Start the alarm scheduler
 * Runs alarm check every 20 minutes (1200000ms)
 */
export function startAlarmScheduler() {
  // Prevent multiple scheduler instances
  if (schedulerInterval) {
    console.log('[AlarmScheduler] Already running, skipping initialization');
    return;
  }

  // Schedule: Every 10 minutes (600000 milliseconds) - faster detection for critical alarms
  schedulerInterval = setInterval(async () => {
    const tickStart = Date.now();
    try {
      console.log('[AlarmScheduler] Starting scheduled alarm check...');

      // Use INTERNAL_API_URL env var (set in docker-compose.yml)
      // Falls back to PORT env var, then default 3000 (container internal port)
      // NEVER hardcode host-mapped port (e.g. 8170) here - that's the external port
      const baseUrl = process.env.INTERNAL_API_URL || `http://localhost:${process.env.PORT || '3000'}`;
      const response = await fetch(`${baseUrl}/api/alarms/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(25 * 60 * 1000), // 25-min hard timeout — prevents hung goroutines
      });

      const duration = Date.now() - tickStart;
      const ok = response.ok;

      if (ok) {
        console.log(`[AlarmScheduler] ✅ Check completed successfully (${duration}ms)`);
      } else {
        console.error(`[AlarmScheduler] ❌ Check failed: ${response.status} (${duration}ms)`);
      }

      // Write heartbeat to DB so external monitors / health endpoints can detect scheduler death
      try {
        await (prisma as any).systemConfig?.upsert?.({
          where: { key: 'scheduler_last_tick' },
          update: { value: JSON.stringify({ ts: new Date().toISOString(), ok, durationMs: duration }) },
          create: { key: 'scheduler_last_tick', value: JSON.stringify({ ts: new Date().toISOString(), ok, durationMs: duration }) },
        }).catch(() => {/* silently ignore if table doesn't exist */});
      } catch { /* never crash scheduler over heartbeat write */ }
    } catch (error) {
      const duration = Date.now() - tickStart;
      console.error(`[AlarmScheduler] ❌ Error during scheduled check (${duration}ms):`, error);
    }
  }, 600000); // 10 minutes = 600000ms

  console.log('[AlarmScheduler] ✅ Started - alarm checks will run every 10 minutes');
}

/**
 * Stop the alarm scheduler
 */
export function stopAlarmScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[AlarmScheduler] Stopped');
  }
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus() {
  return {
    running: schedulerInterval !== null,
    intervalMs: 1200000,
    intervalMinutes: 20,
  };
}
