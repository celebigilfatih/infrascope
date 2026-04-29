import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/integrations/nms/network-devices
 * Dashboard-friendly list of NMS-monitored devices served directly from the
 * infrascope DB (no proxy hop to the Python NMS backend — avoids cold-start
 * latency and port-mismatch issues).
 *
 * Connection status is derived from the most recent health metric:
 *   - online   : health metric within the last 5 minutes
 *   - offline  : no health metric in the last 5 minutes
 *   - unknown  : never polled
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const vendorFilter = searchParams.get('vendor');
    const statusFilter = searchParams.get('status');

    const devices = await (prisma as any).device.findMany({
      where: {
        nmsDeviceId: { not: null },
        pollingEnabled: true,
        ...(vendorFilter ? { vendor: vendorFilter } : {}),
      },
      select: {
        id: true,
        name: true,
        vendor: true,
        managementIp: true,
        nmsDeviceId: true,
        lastPolledAt: true,
      },
      orderBy: { name: 'asc' },
    });

    const FIVE_MIN = 5 * 60 * 1000;
    const now = Date.now();

    const data = devices.map((d: any) => {
      const last = d.lastPolledAt ? new Date(d.lastPolledAt).getTime() : 0;
      const age = last ? now - last : Infinity;
      let connection_status: 'online' | 'offline' | 'unknown' = 'unknown';
      if (last) connection_status = age < FIVE_MIN ? 'online' : 'offline';
      return {
        id: d.nmsDeviceId,
        name: d.name,
        ip_address: d.managementIp,
        vendor: d.vendor,
        connection_status,
        last_polled_at: d.lastPolledAt,
      };
    });

    const filtered = statusFilter
      ? data.filter((d: any) => d.connection_status === statusFilter)
      : data;

    return NextResponse.json({ data: filtered, total: filtered.length });
  } catch (error: any) {
    console.error('[NMS network-devices] GET error:', error.message);
    return NextResponse.json(
      { error: 'Failed to load NMS devices', details: error.message },
      { status: 500 }
    );
  }
}
