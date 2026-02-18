/**
 * Alarm Scheduler
 * Automatically triggers alarm evaluation at regular intervals
 */

let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Start the alarm scheduler
 * Runs alarm check every 5 minutes (300000ms)
 */
export function startAlarmScheduler() {
  // Prevent multiple scheduler instances
  if (schedulerInterval) {
    console.log('[AlarmScheduler] Already running, skipping initialization');
    return;
  }

  // Schedule: Every 5 minutes (300000 milliseconds)
  schedulerInterval = setInterval(async () => {
    try {
      console.log('[AlarmScheduler] Starting scheduled alarm check...');
      const startTime = Date.now();

      const response = await fetch('http://localhost:3000/api/alarms/check', {
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
  }, 300000); // 5 minutes = 300000ms

  console.log('[AlarmScheduler] ✅ Started - alarm checks will run every 5 minutes');
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
    intervalMs: 300000,
    intervalMinutes: 5,
  };
}
