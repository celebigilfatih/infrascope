/**
 * Alarm Background Monitor - WATCHDOG MODE
 *
 * Architecture:
 * - AlarmScheduler (lib/alarm-scheduler.ts): Primary evaluation, every 15 minutes
 * - AlarmMonitor (this file): Watchdog — only triggers if scheduler is behind schedule
 *
 * The monitor checks every 10 minutes:
 *  - If last successful check was within 20 minutes: do nothing (scheduler is on time)
 *  - If last successful check was > 20 minutes ago: trigger the check endpoint
 *
 * This prevents concurrent evaluation while ensuring alarm checks never fall too far behind.
 * Does NOT run immediately at startup (waits 3 minutes) to avoid startup race with scheduler.
 */

import { prisma } from '@/lib/prisma';

const WATCHDOG_INTERVAL_MINUTES = 10;       // How often to check if scheduler is on time
const WATCHDOG_MAX_GAP_MINUTES = 20;        // If last check was > 20 min ago, trigger manually
const WATCHDOG_STARTUP_DELAY_MINUTES = 3;   // Don't run immediately at startup

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

    console.log(`[AlarmMonitor] Starting watchdog (${this.checkIntervalMinutes} min interval, ${WATCHDOG_STARTUP_DELAY_MINUTES} min startup delay)`);
    this.isRunning = true;
    this.consecutiveErrors = 0;

    // Delayed first check — avoids startup race with AlarmScheduler
    this.startupTimeoutId = setTimeout(() => {
      if (!this.isRunning) return;
      this.runWatchdog().catch((err) => console.error('[AlarmMonitor] Startup watchdog check failed:', err));

      // After the first delayed run, schedule periodic runs
      this.intervalId = setInterval(() => {
        if (!this.isRunning) return;
        this.runWatchdog().catch((err) => console.error('[AlarmMonitor] Scheduled watchdog check failed:', err));
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
   * Watchdog: only triggers an alarm check if the scheduler is behind schedule.
   */
  private async runWatchdog(): Promise<void> {
    try {
      // Check when the last alarm evaluation happened (from DB log)
      const lastLog = await prisma.alarmCheckLog.findFirst({
        where: { status: { in: ['SUCCESS', 'PARTIAL'] } },
        orderBy: { checkTime: 'desc' },
      });

      const maxGapMs = WATCHDOG_MAX_GAP_MINUTES * 60 * 1000;
      const lastCheckMs = lastLog?.checkTime ? Date.now() - lastLog.checkTime.getTime() : Infinity;

      if (lastCheckMs < maxGapMs) {
        const minutesAgo = Math.round(lastCheckMs / 60000);
        console.log(`[AlarmMonitor] Watchdog OK — last check ${minutesAgo}m ago (threshold: ${WATCHDOG_MAX_GAP_MINUTES}m)`);
        return;
      }

      // Scheduler is behind — trigger a check
      const minutesAgo = lastLog ? Math.round(lastCheckMs / 60000) : '∞';
      console.warn(`[AlarmMonitor] Watchdog: last check ${minutesAgo}m ago, triggering recovery check...`);

      const baseUrl = process.env.INTERNAL_API_URL || `http://localhost:${process.env.PORT || '3000'}`;
      const response = await fetch(`${baseUrl}/api/alarms/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Alarm check endpoint returned ${response.status}`);
      }

      const result = await response.json() as {
        success: boolean;
        summary?: { triggered: number; errors: number; total: number };
      };

      const triggeredCount = result.summary?.triggered ?? 0;
      const errorsCount = result.summary?.errors ?? 0;

      this.lastCheckTime = new Date();
      this.consecutiveErrors = 0;

      console.log(`[AlarmMonitor] Watchdog recovery check done: ${triggeredCount} triggered, ${errorsCount} errors`);
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

// Singleton instance
let monitorInstance: AlarmMonitor | null = null;

export function getAlarmMonitor(checkIntervalMinutes = WATCHDOG_INTERVAL_MINUTES): AlarmMonitor {
  if (!monitorInstance) {
    monitorInstance = new AlarmMonitor(checkIntervalMinutes);
  }
  return monitorInstance;
}

export function startAlarmMonitor(checkIntervalMinutes = WATCHDOG_INTERVAL_MINUTES): AlarmMonitor {
  const monitor = getAlarmMonitor(checkIntervalMinutes);
  monitor.start();
  return monitor;
}

export function stopAlarmMonitor(): void {
  if (monitorInstance) {
    monitorInstance.stop();
  }
}
