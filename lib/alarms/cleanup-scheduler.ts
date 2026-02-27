/**
 * Automatic alarm cleanup scheduler
 * Runs daily to remove old alarms and maintain database performance
 */

import { prisma } from '@/lib/prisma';

interface CleanupConfig {
  enabledByDefault: boolean;
  retentionDaysAcknowledged: number; // Delete acknowledged alarms after N days
  retentionDaysUnacknowledged: number; // Keep unacknowledged alarms longer
  runSchedule: string; // Cron expression or 'daily'
  maxAlarmsPerRun: number; // Limit deletes per run to avoid locking
}

const DEFAULT_CONFIG: CleanupConfig = {
  enabledByDefault: true,
  retentionDaysAcknowledged: 30, // 30 days for acknowledged
  retentionDaysUnacknowledged: 90, // 90 days for unacknowledged
  runSchedule: 'daily',
  maxAlarmsPerRun: 10000,
};

class AlarmCleanupScheduler {
  private config: CleanupConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastRunTime: Date | null = null;
  private cleanupStats = {
    acknowledgedDeleted: 0,
    unacknowledgedDeleted: 0,
    lastRun: null as Date | null,
  };

  constructor(config: Partial<CleanupConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the scheduled cleanup
   */
  start() {
    if (this.intervalId) {
      console.log('[AlarmCleanup] Scheduler already running');
      return;
    }

    console.log(
      `[AlarmCleanup] Starting scheduler (enabled=${this.config.enabledByDefault})`
    );

    if (!this.config.enabledByDefault) {
      console.log('[AlarmCleanup] Cleanup is disabled');
      return;
    }

    // Run cleanup daily at 2 AM
    this.scheduleDaily();
  }

  /**
   * Stop the scheduled cleanup
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[AlarmCleanup] Scheduler stopped');
    }
  }

  /**
   * Schedule cleanup to run daily
   */
  private scheduleDaily() {
    const now = new Date();
    const scheduledTime = new Date();
    scheduledTime.setHours(2, 0, 0, 0); // 2 AM

    // If it's past 2 AM, schedule for tomorrow
    if (now > scheduledTime) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    const timeUntilScheduled = scheduledTime.getTime() - now.getTime();

    console.log(
      `[AlarmCleanup] Scheduled for ${scheduledTime.toISOString()} (in ${Math.round(timeUntilScheduled / 1000 / 60)} minutes)`
    );

    // Schedule initial run
    setTimeout(() => {
      this.runCleanup();
      // Then run daily
      this.intervalId = setInterval(
        () => this.runCleanup(),
        24 * 60 * 60 * 1000
      );
    }, timeUntilScheduled);
  }

  /**
   * Execute the cleanup process
   */
  private async runCleanup() {
    if (this.isRunning) {
      console.log('[AlarmCleanup] Cleanup already in progress, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log('[AlarmCleanup] Starting cleanup cycle...');

      // Delete old acknowledged alarms
      const acknowledgedCutoff = new Date();
      acknowledgedCutoff.setDate(
        acknowledgedCutoff.getDate() - this.config.retentionDaysAcknowledged
      );

      // Get IDs first, then delete in batches (Prisma deleteMany doesn't support limit directly)
      const acknowledgedIds = await prisma.alarmEvent
        .findMany({
          where: {
            createdAt: { lt: acknowledgedCutoff },
            acknowledged: true,
          },
          select: { id: true },
          take: this.config.maxAlarmsPerRun,
        })
        .then((items) => items.map((i) => i.id));

      const acknowledgedDeleted = await prisma.alarmEvent.deleteMany({
        where: {
          id: { in: acknowledgedIds },
        },
      });

      // Delete old unacknowledged alarms (less aggressive)
      const unacknowledgedCutoff = new Date();
      unacknowledgedCutoff.setDate(
        unacknowledgedCutoff.getDate() -
          this.config.retentionDaysUnacknowledged
      );

      const unacknowledgedIds = await prisma.alarmEvent
        .findMany({
          where: {
            createdAt: { lt: unacknowledgedCutoff },
            acknowledged: false,
          },
          select: { id: true },
          take: this.config.maxAlarmsPerRun,
        })
        .then((items) => items.map((i) => i.id));

      const unacknowledgedDeleted = await prisma.alarmEvent.deleteMany({
        where: {
          id: { in: unacknowledgedIds },
        },
      });

      const totalDeleted =
        acknowledgedDeleted.count + unacknowledgedDeleted.count;
      const duration = Date.now() - startTime;

      this.lastRunTime = new Date();
      this.cleanupStats = {
        acknowledgedDeleted: acknowledgedDeleted.count,
        unacknowledgedDeleted: unacknowledgedDeleted.count,
        lastRun: this.lastRunTime,
      };

      console.log(
        `[AlarmCleanup] Cleanup completed in ${duration}ms: ${acknowledgedDeleted.count} acknowledged, ${unacknowledgedDeleted.count} unacknowledged deleted`
      );

      // Log to audit trail
      try {
        await prisma.auditLog.create({
          data: {
            entity: 'AlarmEvent',
            entityId: 'cleanup-job',
            action: 'cleanup',
            changes: {
              acknowledgedDeleted: acknowledgedDeleted.count,
              unacknowledgedDeleted: unacknowledgedDeleted.count,
              retentionDaysAcknowledged:
                this.config.retentionDaysAcknowledged,
              retentionDaysUnacknowledged:
                this.config.retentionDaysUnacknowledged,
            },
          },
        });
      } catch (err) {
        console.error('[AlarmCleanup] Failed to log to audit trail:', err);
      }
    } catch (error) {
      console.error('[AlarmCleanup] Error during cleanup:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Manual trigger for cleanup
   */
  async triggerManualCleanup(
    retentionDaysAcknowledged?: number,
    retentionDaysUnacknowledged?: number
  ) {
    const originalConfig = { ...this.config };

    if (retentionDaysAcknowledged)
      this.config.retentionDaysAcknowledged = retentionDaysAcknowledged;
    if (retentionDaysUnacknowledged)
      this.config.retentionDaysUnacknowledged = retentionDaysUnacknowledged;

    await this.runCleanup();

    // Restore original config
    this.config = originalConfig;
  }

  /**
   * Get cleanup statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
      cleanupStats: this.cleanupStats,
      config: this.config,
    };
  }

  /**
   * Get estimated data to be cleaned
   */
  async getCleanupEstimate() {
    const acknowledgedCutoff = new Date();
    acknowledgedCutoff.setDate(
      acknowledgedCutoff.getDate() - this.config.retentionDaysAcknowledged
    );

    const unacknowledgedCutoff = new Date();
    unacknowledgedCutoff.setDate(
      unacknowledgedCutoff.getDate() -
        this.config.retentionDaysUnacknowledged
    );

    const [acknowledgedCount, unacknowledgedCount] = await Promise.all([
      prisma.alarmEvent.count({
        where: {
          createdAt: { lt: acknowledgedCutoff },
          acknowledged: true,
        },
      }),
      prisma.alarmEvent.count({
        where: {
          createdAt: { lt: unacknowledgedCutoff },
          acknowledged: false,
        },
      }),
    ]);

    return {
      acknowledgedCount,
      unacknowledgedCount,
      totalCount: acknowledgedCount + unacknowledgedCount,
    };
  }
}

// Singleton instance
let cleanupScheduler: AlarmCleanupScheduler | null = null;

/**
 * Get or create the global cleanup scheduler
 */
export function getAlarmCleanupScheduler(
  config?: Partial<CleanupConfig>
): AlarmCleanupScheduler {
  if (!cleanupScheduler) {
    cleanupScheduler = new AlarmCleanupScheduler(config);
  }
  return cleanupScheduler;
}

/**
 * Start the global cleanup scheduler
 */
export function startAlarmCleanupScheduler(
  config?: Partial<CleanupConfig>
): AlarmCleanupScheduler {
  const scheduler = getAlarmCleanupScheduler(config);
  scheduler.start();
  return scheduler;
}

/**
 * Stop the global cleanup scheduler
 */
export function stopAlarmCleanupScheduler(): void {
  if (cleanupScheduler) {
    cleanupScheduler.stop();
  }
}

export default AlarmCleanupScheduler;

