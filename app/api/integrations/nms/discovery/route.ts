import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { nmsInternalFetch } from '@/lib/nms/internal-client';

/**
 * GET /api/integrations/nms/discovery
 * List discovery scans (most recent first).
 * 
 * POST /api/integrations/nms/discovery
 * Start a new network discovery scan via NMS FastAPI service.
 */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '20');

    const scans = await (prisma as any).nmsDiscoveryScan.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        _count: { select: { discoveredDevices: true } },
        discoveredDevices: {
          where: { imported: false },
          select: { id: true, ipAddress: true, vendor: true, snmpStatus: true },
          take: 5,
        },
      },
    });

    return NextResponse.json({ scans, total: scans.length });
  } catch (error) {
    console.error('[NMS Discovery] GET error:', error);
    return NextResponse.json({ error: 'Failed to list discovery scans' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cidr, communities = [] } = body;

    if (!cidr) {
      return NextResponse.json({ error: 'cidr is required (e.g. 192.168.1.0/24)' }, { status: 400 });
    }
    if (!Array.isArray(communities) || communities.length === 0) {
      return NextResponse.json({ error: 'At least one explicit SNMP community is required' }, { status: 400 });
    }

    // Forward to NMS FastAPI service which runs the actual async scan
    let scan_id: string | undefined;
    try {
      const res = await nmsInternalFetch('/discovery/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cidr, communities }),
        timeoutMs: 5000,
      });

      if (!res.ok) {
        throw new Error(`NMS service returned ${res.status}`);
      }
      const data = await res.json();
      scan_id = data.scan_id;
    } catch (nmsErr) {
      // NMS service not available — create scan record directly for UI tracking
      console.warn('[NMS Discovery] NMS service unavailable, creating record directly:', nmsErr);
      const scan = await (prisma as any).nmsDiscoveryScan.create({
        data: { cidr, status: 'failed', errorMessage: 'NMS service not available' },
      });
      scan_id = scan.id;
    }

    return NextResponse.json({
      scan_id,
      status: 'started',
      cidr,
      message: `Discovery scan started for ${cidr}. Use GET /discovery/${scan_id} to track progress.`,
    });
  } catch (error) {
    console.error('[NMS Discovery] POST error:', error);
    return NextResponse.json({ error: 'Failed to start discovery scan' }, { status: 500 });
  }
}
