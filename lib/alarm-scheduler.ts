/**
 * Alarm Scheduler
 * Automatically triggers alarm evaluation at regular intervals
 */

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

  // Schedule: Every 20 minutes (1200000 milliseconds) - allows 15-min checks to complete
  schedulerInterval = setInterval(async () => {
    try {
      console.log('[AlarmScheduler] Starting scheduled alarm check...');
      const startTime = Date.now();

      // Use INTERNAL_API_URL env var (set in docker-compose.yml)
      // Falls back to PORT env var, then default 3000 (container internal port)
      // NEVER hardcode host-mapped port (e.g. 8170) here - that's the external port
      const baseUrl = process.env.INTERNAL_API_URL || `http://localhost:${process.env.PORT || '3000'}`;
      const response = await fetch(`${baseUrl}/api/alarms/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const duration = Date.now() - startTime;
      
      if (response.ok) {
        console.log(`[AlarmScheduler] ✅ Check completed successfully (${duration}ms)`);
      } else {
        console.error(`[AlarmScheduler] ❌ Check failed: ${response.status} (${duration}ms)`);
      }
    } catch (error) {
      console.error('[AlarmScheduler] ❌ Error during scheduled check:', error);
    }
  }, 1200000); // 20 minutes = 1200000ms

  console.log('[AlarmScheduler] ✅ Started - alarm checks will run every 20 minutes');
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
