/**
 * Notification Dead-Letter Queue (DLQ) Retry Worker
 * 
 * Handles failed email notifications with exponential backoff retry.
 * Runs as part of the alarm check cycle to process pending retries.
 * 
 * Backoff schedule:
 * - Attempt 1: immediate
 * - Attempt 2: +1 minute
 * - Attempt 3: +5 minutes
 * - Attempt 4: +30 minutes
 * - Attempt 5: +2 hours
 * - After 5 failures: marked as failed_permanent
 */

import { prisma } from '@/lib/prisma';
import { sendAlarmEmail, AlarmEmailData } from './email';

// Exponential backoff intervals in milliseconds
const BACKOFF_INTERVALS = [
  1 * 60 * 1000,      // 1 minute
  5 * 60 * 1000,      // 5 minutes
  30 * 60 * 1000,     // 30 minutes
  2 * 60 * 60 * 1000, // 2 hours
  12 * 60 * 60 * 1000 // 12 hours (final retry)
];

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 10; // Process at most 10 DLQ entries per cycle

/**
 * Calculate next retry time based on attempt count
 */
function calculateNextRetry(attempts: number): Date {
  const intervalIndex = Math.min(attempts, BACKOFF_INTERVALS.length - 1);
  const interval = BACKOFF_INTERVALS[intervalIndex];
  return new Date(Date.now() + interval);
}

/**
 * Add a failed notification to the DLQ for retry
 */
export async function addToDLQ(
  alarmEventId: string,
  payload: AlarmEmailData,
  error: string
): Promise<void> {
  try {
    const nextRetry = calculateNextRetry(0);
    
    await prisma.notificationDLQ.create({
      data: {
        alarmEventId,
        channel: 'email',
        payload: payload as any,
        attempts: 1, // First attempt already failed
        maxAttempts: MAX_ATTEMPTS,
        lastAttempt: new Date(),
        nextRetry,
        lastError: error.substring(0, 1000), // Truncate long errors
        status: 'pending',
      },
    });
    
    console.log(`[DLQ] Added failed notification for alarm event ${alarmEventId}, next retry at ${nextRetry.toISOString()}`);
  } catch (dlqError) {
    // Log but don't throw — DLQ failure shouldn't break main flow
    console.error(`[DLQ] Failed to add entry for ${alarmEventId}:`, dlqError);
  }
}

/**
 * Process pending DLQ entries
 * Called at the end of each alarm check cycle
 */
export async function processDLQ(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  permanentlyFailed: number;
}> {
  const stats = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    permanentlyFailed: 0,
  };

  try {
    // Find pending entries that are due for retry
    const pendingEntries = await prisma.notificationDLQ.findMany({
      where: {
        status: 'pending',
        nextRetry: { lte: new Date() },
      },
      orderBy: { nextRetry: 'asc' },
      take: BATCH_SIZE,
      include: {
        alarmEvent: {
          include: { alarm: true },
        },
      },
    });

    if (pendingEntries.length === 0) {
      return stats;
    }

    console.log(`[DLQ] Processing ${pendingEntries.length} pending notifications...`);

    for (const entry of pendingEntries) {
      stats.processed++;
      
      try {
        const payload = entry.payload as unknown as AlarmEmailData;
        
        // Attempt to send email (bypass cooldown since this is a legitimate retry)
        const sent = await sendAlarmEmail({
          ...payload,
          timestamp: new Date(payload.timestamp), // Ensure Date object
        }, { bypassCooldown: true });

        if (sent) {
          // Success! Mark as delivered
          await prisma.notificationDLQ.update({
            where: { id: entry.id },
            data: {
              status: 'delivered',
              lastAttempt: new Date(),
            },
          });

          // Also update the original alarm event's notifiedAt
          await prisma.alarmEvent.update({
            where: { id: entry.alarmEventId },
            data: { 
              notifiedAt: new Date(),
              notifyChannel: 'email',
            },
          });

          console.log(`[DLQ] ✅ Retry successful for ${entry.alarmEvent.alarm.code} (${entry.id})`);
          stats.succeeded++;
        } else {
          // Send returned false (rate limited, etc.) — retry later
          throw new Error('sendAlarmEmail returned false (rate limited or cooldown)');
        }
      } catch (sendError) {
        const errorMsg = (sendError as Error).message || 'Unknown error';
        const newAttempts = entry.attempts + 1;
        
        if (newAttempts >= entry.maxAttempts) {
          // Max attempts reached — mark as permanently failed
          await prisma.notificationDLQ.update({
            where: { id: entry.id },
            data: {
              status: 'failed_permanent',
              lastAttempt: new Date(),
              lastError: errorMsg.substring(0, 1000),
              attempts: newAttempts,
            },
          });
          
          console.error(`[DLQ] ❌ Permanently failed after ${newAttempts} attempts: ${entry.alarmEvent.alarm.code} (${entry.id})`);
          stats.permanentlyFailed++;
        } else {
          // Schedule next retry with exponential backoff
          const nextRetry = calculateNextRetry(newAttempts);
          
          await prisma.notificationDLQ.update({
            where: { id: entry.id },
            data: {
              lastAttempt: new Date(),
              lastError: errorMsg.substring(0, 1000),
              attempts: newAttempts,
              nextRetry,
            },
          });
          
          console.log(`[DLQ] ⏳ Retry ${newAttempts}/${entry.maxAttempts} failed for ${entry.alarmEvent.alarm.code}, next at ${nextRetry.toISOString()}`);
          stats.failed++;
        }
      }
    }

    console.log(`[DLQ] Batch complete: ${stats.succeeded} succeeded, ${stats.failed} retrying, ${stats.permanentlyFailed} permanently failed`);
    return stats;
  } catch (error) {
    console.error('[DLQ] Error processing queue:', error);
    return stats;
  }
}

/**
 * Get DLQ statistics for monitoring
 */
export async function getDLQStats(): Promise<{
  pending: number;
  delivered: number;
  failedPermanent: number;
  oldestPendingAge: number | null;
}> {
  try {
    const [pending, delivered, failedPermanent, oldestPending] = await Promise.all([
      prisma.notificationDLQ.count({ where: { status: 'pending' } }),
      prisma.notificationDLQ.count({ where: { status: 'delivered' } }),
      prisma.notificationDLQ.count({ where: { status: 'failed_permanent' } }),
      prisma.notificationDLQ.findFirst({
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      pending,
      delivered,
      failedPermanent,
      oldestPendingAge: oldestPending
        ? Math.round((Date.now() - oldestPending.createdAt.getTime()) / 60000)
        : null,
    };
  } catch (error) {
    console.error('[DLQ] Error getting stats:', error);
    return { pending: 0, delivered: 0, failedPermanent: 0, oldestPendingAge: null };
  }
}

/**
 * Clean up old delivered/failed entries (retention: 7 days)
 */
export async function cleanupDLQ(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
    
    const deleted = await prisma.notificationDLQ.deleteMany({
      where: {
        status: { in: ['delivered', 'failed_permanent'] },
        updatedAt: { lt: cutoff },
      },
    });
    
    if (deleted.count > 0) {
      console.log(`[DLQ] Cleaned up ${deleted.count} old entries`);
    }
    
    return deleted.count;
  } catch (error) {
    console.error('[DLQ] Cleanup failed:', error);
    return 0;
  }
}
