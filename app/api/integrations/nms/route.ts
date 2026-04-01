import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/integrations/nms/status
 * Returns the health status of the NMS FastAPI service and polling statistics.
 */
export async function GET() {
  try {
    // Query the internal NMS FastAPI service
    const nmsUrl = process.env.NMS_INTERNAL_URL || 'http://nms:8500';
    let nmsHealth: Record<string, unknown> = { status: 'unavailable' };

    try {
      const res = await fetch(`${nmsUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        nmsHealth = await res.json();
      }
    } catch {
      // NMS service not running (expected in development without Docker)
    }

    // Count polling-enabled devices from DB
    const pollingDevices = await (prisma as any).device.count({
      where: { pollingEnabled: true, nmsDeviceId: { not: null } },
    });

    // Count recent health metrics (last 10 minutes) as a sign-of-life indicator
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentMetrics = await (prisma as any).nmsHealthMetric.count({
      where: { collectedAt: { gte: tenMinAgo } },
    });

    // Count active scans
    const activeScans = await (prisma as any).nmsDiscoveryScan.count({
      where: { status: { in: ['pending', 'running'] } },
    });

    return NextResponse.json({
      nms_service: nmsHealth,
      polling_devices: pollingDevices,
      recent_health_metrics: recentMetrics,
      active_discovery_scans: activeScans,
      polling_active: recentMetrics > 0,
    });
  } catch (error) {
    console.error('[NMS Status] Error:', error);
    return NextResponse.json({ error: 'Failed to get NMS status' }, { status: 500 });
  }
}
