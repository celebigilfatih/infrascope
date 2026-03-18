/**
 * POST /api/alarms/cleanup - Automatic or manual cleanup of old alarms
 * Query params:
 *   - daysOld: number of days before which alarms should be deleted (default: 7)
 *   - acknowledged: boolean - only delete acknowledged alarms (default: true)
 *   - dryRun: boolean - show what would be deleted without actually deleting (default: false)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const daysOld = parseInt(searchParams.get('daysOld') || '7', 10);
    const acknowledgedOnly = searchParams.get('acknowledged') !== 'false';
    const dryRun = searchParams.get('dryRun') === 'true';

    if (daysOld < 1) {
      return NextResponse.json(
        { success: false, error: 'daysOld must be at least 1' },
        { status: 400 }
      );
    }

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    // Build where clause
    const where: Record<string, unknown> = {
      createdAt: { lt: cutoffDate },
    };

    if (acknowledgedOnly) {
      where.acknowledged = true;
    }

    // Get count of alarms to be deleted
    const deleteCount = await prisma.alarmEvent.count({ where });

    if (dryRun) {
      // Just return what would be deleted
      const sampleAlarms = await prisma.alarmEvent.findMany({
        where,
        take: 10,
        select: {
          id: true,
          title: true,
          severity: true,
          createdAt: true,
          acknowledged: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      return NextResponse.json({
        success: true,
        dryRun: true,
        wouldDelete: deleteCount,
        sampleAlarms,
        criteria: {
          daysOld,
          acknowledgedOnly,
          cutoffDate: cutoffDate.toISOString(),
        },
      });
    }

    // Actually delete the alarms
    // First, get IDs of alarms to be deleted
    const alarmsToDelete = await prisma.alarmEvent.findMany({
      where,
      select: { id: true },
    });
    const alarmIds = alarmsToDelete.map(a => a.id);

    if (alarmIds.length > 0) {
      // Delete related notification_dlq records first (to satisfy foreign key constraint)
      await prisma.notificationDLQ.deleteMany({
        where: { alarmEventId: { in: alarmIds } },
      });
    }

    // Now delete the alarms
    const deleted = await prisma.alarmEvent.deleteMany({ where });

    console.log(
      `[AlarmCleanup] Deleted ${deleted.count} alarms older than ${daysOld} days`
    );

    return NextResponse.json({
      success: true,
      deleted: deleted.count,
      criteria: {
        daysOld,
        acknowledgedOnly,
        cutoffDate: cutoffDate.toISOString(),
      },
    });
  } catch (error) {
    console.error('[AlarmCleanup] Error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/alarms/cleanup/stats - Get alarm cleanup statistics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const daysOld = parseInt(searchParams.get('daysOld') || '7', 10);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const stats = await Promise.all([
      // Total alarms
      prisma.alarmEvent.count(),
      // Alarms older than cutoff
      prisma.alarmEvent.count({
        where: { createdAt: { lt: cutoffDate } },
      }),
      // Old acknowledged alarms
      prisma.alarmEvent.count({
        where: { createdAt: { lt: cutoffDate }, acknowledged: true },
      }),
      // Old unacknowledged alarms
      prisma.alarmEvent.count({
        where: { createdAt: { lt: cutoffDate }, acknowledged: false },
      }),
      // Breakdown by severity
      prisma.alarmEvent.groupBy({
        by: ['severity'],
        where: { createdAt: { lt: cutoffDate } },
        _count: { id: true },
      }),
      // Storage estimate (rough calculation)
      prisma.alarmEvent.findMany({
        where: { createdAt: { lt: cutoffDate } },
        take: 100,
        select: { id: true, rawData: true },
      }),
    ]);

    const [total, oldCount, oldAcknowledged, oldUnacknowledged, severityBreakdown, sampleAlarms] =
      stats;

    // Rough storage calculation (based on sample)
    const avgBytesPerAlarm = sampleAlarms.reduce((sum, a) => {
      const dataSize = JSON.stringify(a.rawData || {}).length;
      return sum + dataSize;
    }, 0) / (sampleAlarms.length || 1);
    const estimatedStorageMB = (oldCount * avgBytesPerAlarm) / (1024 * 1024);

    return NextResponse.json({
      success: true,
      stats: {
        total,
        old: oldCount,
        oldAcknowledged,
        oldUnacknowledged,
        percentOld: total > 0 ? ((oldCount / total) * 100).toFixed(1) : '0',
        estimatedStorageMB: estimatedStorageMB.toFixed(2),
        severityBreakdown: Object.fromEntries(
          severityBreakdown.map((s) => [s.severity, s._count.id])
        ),
        cutoffDate: cutoffDate.toISOString(),
        daysOld,
      },
    });
  } catch (error) {
    console.error('[AlarmCleanup Stats] Error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
