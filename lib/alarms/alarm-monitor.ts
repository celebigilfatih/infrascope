/**
 * Alarm Background Monitor
 * Automatically checks alarms at regular intervals
 * Ensures continuous monitoring even if errors occur
 */

import { prisma } from '@/lib/prisma';
import FortiAnalyzerService from '@/lib/integrations/fortianalyzer';
import { AlarmDetectionEngine } from './detection-engine';

export class AlarmMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private checkIntervalMinutes: number;
  private lastCheckTime: Date | null = null;
  private consecutiveErrors = 0;
  private readonly MAX_CONSECUTIVE_ERRORS = 5;

  constructor(checkIntervalMinutes = 5) {
    this.checkIntervalMinutes = checkIntervalMinutes;
  }

  /**
   * Start the alarm monitoring service
   */
  start() {
    if (this.isRunning) {
      console.log('[AlarmMonitor] Already running');
      return;
    }

    console.log(`[AlarmMonitor] Starting with ${this.checkIntervalMinutes} minute interval`);
    this.isRunning = true;

    // Run immediately on start
    this.runCheck().catch((error) => {
      console.error('[AlarmMonitor] Initial check failed:', error);
    });

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      if (!this.isRunning) return;
      
      this.runCheck().catch((error) => {
        console.error('[AlarmMonitor] Scheduled check failed:', error);
      });
    }, this.checkIntervalMinutes * 60 * 1000);
  }

  /**
   * Stop the alarm monitoring service
   */
  stop() {
    if (!this.isRunning) {
      console.log('[AlarmMonitor] Not running');
      return;
    }

    console.log('[AlarmMonitor] Stopping...');
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Get monitor status
   */
  getStatus() {
    return {
      running: this.isRunning,
      lastCheckTime: this.lastCheckTime,
      checkIntervalMinutes: this.checkIntervalMinutes,
      consecutiveErrors: this.consecutiveErrors,
    };
  }

  /**
   * Run alarm check with error recovery
   */
  private async runCheck(): Promise<void> {
    try {
      console.log('[AlarmMonitor] Running alarm check...');
      const startTime = Date.now();

      // Get FortiAnalyzer config
      const config = await prisma.integrationConfig.findFirst({
        where: { type: 'FORTIANALYZER', enabled: true },
      });

      if (!config) {
        console.warn('[AlarmMonitor] FortiAnalyzer not configured, skipping check');
        return;
      }

      const faConfig = config.config as { host: string; username?: string; password?: string };
      const service = new FortiAnalyzerService({
        host: faConfig.host,
        username: faConfig.username || 'fcelebigil',
        password: faConfig.password || 'Thor.7485-a',
      });

      // Run detection engine
      const engine = new AlarmDetectionEngine(service);
      const results = await engine.evaluateAllAlarms();

      const triggered = results.filter((r) => r.triggered);
      const errors = results.filter((r) => r.error && r.error !== 'cooldown-active');
      const duration = Date.now() - startTime;

      this.lastCheckTime = new Date();
      this.consecutiveErrors = 0; // Reset error counter on success

      console.log(
        `[AlarmMonitor] Check complete in ${duration}ms: ${triggered.length} triggered, ${errors.length} errors`
      );

      // Log to database for audit trail
      try {
        await prisma.alarmCheckLog.create({
          data: {
            checkTime: this.lastCheckTime,
            totalAlarms: results.length,
            triggeredCount: triggered.length,
            errorCount: errors.length,
            durationMs: duration,
            status: errors.length === 0 ? 'SUCCESS' : 'PARTIAL',
          },
        });
      } catch (logError) {
        console.error('[AlarmMonitor] Failed to log check result:', logError);
        // Don't throw - logging failure shouldn't stop monitoring
      }
    } catch (error) {
      this.consecutiveErrors++;
      console.error(
        `[AlarmMonitor] Check failed (${this.consecutiveErrors}/${this.MAX_CONSECUTIVE_ERRORS}):`,
        error
      );

      // If too many consecutive errors, stop monitoring and alert
      if (this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
        console.error('[AlarmMonitor] Too many consecutive errors, stopping monitor');
        this.stop();

        // Try to create critical alarm event
        try {
          await prisma.alarmEvent.create({
            data: {
              alarmId: 'system-alarm-monitor-failed',
              severity: 'CRITICAL',
              message: `Alarm monitoring service failed after ${this.consecutiveErrors} consecutive errors`,
              eventData: {
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

      // Continue running despite error (unless max errors reached)
    }
  }

  /**
   * Force an immediate check (manual trigger)
   */
  async forceCheck(): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Monitor is not running');
    }

    console.log('[AlarmMonitor] Force check requested');
    await this.runCheck();
  }
}

// Singleton instance
let monitorInstance: AlarmMonitor | null = null;

/**
 * Get or create the global alarm monitor instance
 */
export function getAlarmMonitor(checkIntervalMinutes = 5): AlarmMonitor {
  if (!monitorInstance) {
    monitorInstance = new AlarmMonitor(checkIntervalMinutes);
  }
  return monitorInstance;
}

/**
 * Start the global alarm monitor
 */
export function startAlarmMonitor(checkIntervalMinutes = 5): AlarmMonitor {
  const monitor = getAlarmMonitor(checkIntervalMinutes);
  monitor.start();
  return monitor;
}

/**
 * Stop the global alarm monitor
 */
export function stopAlarmMonitor(): void {
  if (monitorInstance) {
    monitorInstance.stop();
  }
}
