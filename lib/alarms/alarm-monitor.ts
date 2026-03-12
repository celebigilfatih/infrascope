/**
 * Alarm Background Monitor — WATCHDOG MODE
 *
 * Checks every 15 minutes whether the last alarm evaluation was recent.
 * If the detection engine has been silent for > 30 minutes, it triggers
 * a recovery run by calling runAlarmCheck() DIRECTLY (in-process).
 *
 * WHY DIRECT (NOT HTTP)
 * ─────────────────────
 * Previously this watchdog sent HTTP POST to /api/alarms/check. HTTP-based
 * triggering is fragile: if the connection is dropped mid-execution the
 * finally block may not run, leaving the mutex locked and the DB unwritten.
 * With direct in-process calls the Node.js event loop guarantees completion.
 *
 * The scheduler (alarm-scheduler.ts) is the PRIMARY trigger (every 10 min).
 * This watchdog is the BACKUP — it only fires when the scheduler misses a run.
 */

import { prisma } from '@/lib/prisma';
import { runAlarmCheck } from '@/lib/alarms/alarm-runner';

const WATCHDOG_INTERVAL_MINUTES = 15;    // How often the watchdog polls
const WATCHDOG_MAX_GAP_MINUTES = 30;     // Max acceptable gap between checks
const WATCHDOG_STARTUP_DELAY_MINUTES = 5; // Avoid race with scheduler at startup

export class AlarmMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private startupTimeoutId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private checkIntervalMinutes: number;
  private lastCheckTime: Date | null = null;
  private consecutiveErrors = 0;
  private readonly MAX_CONSECUTIVE_ERRORS = 10;
  private recoveryTimeoutId: NodeJS.Timeout | null = null;

  constructor(checkIntervalMinutes = WATCHDOG_INTERVAL_MINUTES) {
    this.checkIntervalMinutes = checkIntervalMinutes;
  }

  start() {
    if (this.isRunning) {
      console.log('[AlarmMonitor] Already running');
      return;
    }

    console.log(
      `[AlarmMonitor] Starting watchdog (${this.checkIntervalMinutes} min interval, ` +
        `${WATCHDOG_STARTUP_DELAY_MINUTES} min startup delay)`
    );
    this.isRunning = true;
    this.consecutiveErrors = 0;

    // Delayed first check — avoids startup race with AlarmScheduler
    this.startupTimeoutId = setTimeout(() => {
      if (!this.isRunning) return;
      this.runWatchdog().catch((err) =>
        console.error('[AlarmMonitor] Startup watchdog check failed:', err)
      );

      this.intervalId = setInterval(() => {
        if (!this.isRunning) return;
        this.runWatchdog().catch((err) =>
          console.error('[AlarmMonitor] Scheduled watchdog check failed:', err)
        );
      }, this.checkIntervalMinutes * 60 * 1000);
    }, WATCHDOG_STARTUP_DELAY_MINUTES * 60 * 1000);
  }

  stop() {
    if (!this.isRunning) {
      console.log('[AlarmMonitor] Not running');
      return;
    }

    console.log('[AlarmMonitor] Stopping...');
    this.isRunning = false;

    if (this.startupTimeoutId) {
      clearTimeout(this.startupTimeoutId);
      this.startupTimeoutId = null;
    }
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.recoveryTimeoutId) {
      clearTimeout(this.recoveryTimeoutId);
      this.recoveryTimeoutId = null;
    }
  }

  private scheduleRecovery() {
    const RECOVERY_DELAY_MS = 10 * 60 * 1000;
    console.log('[AlarmMonitor] Scheduling auto-recovery in 10 minutes...');
    this.recoveryTimeoutId = setTimeout(() => {
      console.log('[AlarmMonitor] Auto-recovery: attempting restart...');
      this.start();
    }, RECOVERY_DELAY_MS);
  }

  getStatus() {
    return {
      running: this.isRunning,
      lastCheckTime: this.lastCheckTime,
      checkIntervalMinutes: this.checkIntervalMinutes,
      consecutiveErrors: this.consecutiveErrors,
    };
  }

  /**
   * Watchdog: check if detection is on schedule; trigger if not.
   *
   * Unlike the old HTTP-based approach, this calls runAlarmCheck() directly.
   * The DB log is ALWAYS written (even on error) because there is no HTTP
   * connection that can be dropped mid-execution.
   */
  private async runWatchdog(): Promise<void> {
    try {
      // Look at the most recent alarm_check_log entry (any status)
      const lastLog = await prisma.alarmCheckLog.findFirst({
        orderBy: { checkTime: 'desc' },
      });

      const maxGapMs = WATCHDOG_MAX_GAP_MINUTES * 60 * 1000;
      const lastCheckMs = lastLog?.checkTime
        ? Date.now() - lastLog.checkTime.getTime()
        : Infinity;

      if (lastCheckMs < maxGapMs) {
        const minutesAgo = Math.round(lastCheckMs / 60000);
        console.log(
          `[AlarmMonitor] Watchdog OK — last check ${minutesAgo}m ago ` +
            `(threshold: ${WATCHDOG_MAX_GAP_MINUTES}m)`
        );
        return;
      }

      const minutesAgo = lastLog ? Math.round(lastCheckMs / 60000) : '∞';
      console.warn(
        `[AlarmMonitor] Watchdog: last check ${minutesAgo}m ago — triggering recovery...`
      );

      // Direct in-process call — no HTTP, no connection drop risk
      const result = await runAlarmCheck();

      this.lastCheckTime = new Date();
      this.consecutiveErrors = 0;

      console.log(
        `[AlarmMonitor] Recovery done: ${result.summary.triggered} triggered, ` +
          `${result.summary.errors} errors`
      );
    } catch (error) {
      this.consecutiveErrors++;
      console.error(
        `[AlarmMonitor] Watchdog check failed (${this.consecutiveErrors}/${this.MAX_CONSECUTIVE_ERRORS}):`,
        error
      );

      if (this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
        console.error('[AlarmMonitor] Too many consecutive errors, stopping monitor');
        this.stop();
        this.scheduleRecovery();

        try {
          await prisma.alarmEvent.create({
            data: {
              alarmId: 'system-alarm-monitor-failed',
              severity: 'ALARM_CRITICAL',
              title: 'Alarm Monitor Service Failed',
              message: `Alarm monitoring service failed after ${this.consecutiveErrors} consecutive errors`,
              rawData: {
                error: (error as Error).message,
                timestamp: new Date().toISOString(),
              },
              acknowledged: false,
            },
          });
        } catch (alarmError) {
          console.error('[AlarmMonitor] Failed to create failure alarm:', alarmError);
        }
      }
    }
  }

  async forceCheck(): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Monitor is not running');
    }
    console.log('[AlarmMonitor] Force watchdog check requested');
    await this.runWatchdog();
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────
let monitorInstance: AlarmMonitor | null = null;

export function getAlarmMonitor(
  checkIntervalMinutes = WATCHDOG_INTERVAL_MINUTES
): AlarmMonitor {
  if (!monitorInstance) {
    monitorInstance = new AlarmMonitor(checkIntervalMinutes);
  }
  return monitorInstance;
}

export function startAlarmMonitor(
  checkIntervalMinutes = WATCHDOG_INTERVAL_MINUTES
): AlarmMonitor {
  const monitor = getAlarmMonitor(checkIntervalMinutes);
  monitor.start();
  return monitor;
}

export function stopAlarmMonitor(): void {
  if (monitorInstance) {
    monitorInstance.stop();
  }
}
