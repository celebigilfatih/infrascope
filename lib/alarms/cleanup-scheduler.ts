/**
 * Automatic alarm cleanup scheduler
 * Runs daily to remove old alarms and maintain database performance
 */

import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('cleanup-scheduler');

interface CleanupConfig {
  enabledByDefault: boolean;
  retentionDaysAcknowledged: number; // Delete acknowledged alarms after N days
  retentionDaysUnacknowledged: number; // Keep unacknowledged alarms longer
  retentionDaysNmsMetrics: number; // Delete NMS time-series metrics after N days
  retentionDaysNmsBackups: number; // Delete NMS config backups after N days
  runSchedule: string; // Cron expression or 'daily'
  maxAlarmsPerRun: number; // Limit deletes per run to avoid locking
  maxNmsPerRun: number; // Limit NMS metric deletes per run
}

const DEFAULT_CONFIG: CleanupConfig = {
  enabledByDefault: true,
  retentionDaysAcknowledged: 30, // 30 days for acknowledged
  retentionDaysUnacknowledged: 90, // 90 days for unacknowledged
  retentionDaysNmsMetrics: 7, // 7 days for NMS time-series metrics
  retentionDaysNmsBackups: 30, // 30 days for NMS config backups
  runSchedule: 'daily',
  maxAlarmsPerRun: 10000,
  maxNmsPerRun: 50000,
};

class AlarmCleanupScheduler {
  private config: CleanupConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastRunTime: Date | null = null;
  private cleanupStats = {
    acknowledgedDeleted: 0,
    unacknowledgedDeleted: 0,
    nmsMetricsDeleted: 0,
    nmsBackupsDeleted: 0,
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
      log.info('Scheduler already running');
      return;
    }

    log.info({ enabled: this.config.enabledByDefault }, 'Starting scheduler');

    if (!this.config.enabledByDefault) {
      log.info('Cleanup is disabled');
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
      log.info('Scheduler stopped');
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

    log.info(
      { scheduledTime: scheduledTime.toISOString(), minutesUntil: Math.round(timeUntilScheduled / 1000 / 60) },
      'Cleanup scheduled'
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
      log.info('Cleanup already in progress, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      log.info('Starting cleanup cycle');

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

      // ── NMS Metrics Cleanup ──────────────────────────────────────────────
      // Delete old NMS time-series metrics (HealthMetric, DeviceMetric, InterfaceMetric)
      // These grow unboundedly without retention and can bloat PostgreSQL significantly.
      const nmsMetricsCutoff = new Date();
      nmsMetricsCutoff.setDate(
        nmsMetricsCutoff.getDate() - this.config.retentionDaysNmsMetrics
      );

      let nmsMetricsDeleted = 0;
      try {
        // NmsHealthMetric — uses collectedAt
        const healthDeleted = await (prisma as any).nmsHealthMetric.deleteMany({
          where: { collectedAt: { lt: nmsMetricsCutoff } },
        });
        nmsMetricsDeleted += healthDeleted.count;

        // NmsDeviceMetric — uses collectedAt
        const deviceDeleted = await (prisma as any).nmsDeviceMetric.deleteMany({
          where: { collectedAt: { lt: nmsMetricsCutoff } },
        });
        nmsMetricsDeleted += deviceDeleted.count;

        // NmsInterfaceMetric — uses collectedAt
        const ifaceDeleted = await (prisma as any).nmsInterfaceMetric.deleteMany({
          where: { collectedAt: { lt: nmsMetricsCutoff } },
        });
        nmsMetricsDeleted += ifaceDeleted.count;

        if (nmsMetricsDeleted > 0) {
          log.info({ nmsMetricsDeleted, retentionDays: this.config.retentionDaysNmsMetrics }, 'Deleted NMS metrics');
        }
      } catch (err) {
        log.error({ err }, 'NMS metrics cleanup failed');
      }

      // Delete old NMS config backups
      const nmsBackupsCutoff = new Date();
      nmsBackupsCutoff.setDate(
        nmsBackupsCutoff.getDate() - this.config.retentionDaysNmsBackups
      );

      let nmsBackupsDeleted = 0;
      try {
        const backupsDeleted = await (prisma as any).nmsBackup.deleteMany({
          where: { createdAt: { lt: nmsBackupsCutoff } },
        });
        nmsBackupsDeleted = backupsDeleted.count;
        if (nmsBackupsDeleted > 0) {
          log.info({ nmsBackupsDeleted, retentionDays: this.config.retentionDaysNmsBackups }, 'Deleted NMS backups');
        }
      } catch (err) {
        log.error({ err }, 'NMS backups cleanup failed');
      }

      const duration = Date.now() - startTime;

      this.lastRunTime = new Date();
      this.cleanupStats = {
        acknowledgedDeleted: acknowledgedDeleted.count,
        unacknowledgedDeleted: unacknowledgedDeleted.count,
        nmsMetricsDeleted,
        nmsBackupsDeleted,
        lastRun: this.lastRunTime,
      };

      log.info(
        { duration, acknowledgedDeleted: acknowledgedDeleted.count, unacknowledgedDeleted: unacknowledgedDeleted.count, nmsMetricsDeleted, nmsBackupsDeleted },
        'Cleanup completed'
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
              nmsMetricsDeleted,
              nmsBackupsDeleted,
              retentionDaysAcknowledged:
                this.config.retentionDaysAcknowledged,
              retentionDaysUnacknowledged:
                this.config.retentionDaysUnacknowledged,
              retentionDaysNmsMetrics: this.config.retentionDaysNmsMetrics,
              retentionDaysNmsBackups: this.config.retentionDaysNmsBackups,
            },
          },
        });
      } catch (err) {
        log.error({ err }, 'Failed to log to audit trail');
      }
    } catch (error) {
      log.error({ err: error }, 'Error during cleanup');
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
