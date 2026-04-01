import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params { params: { scanId: string } }

/**
 * GET /api/integrations/nms/discovery/[scanId]
 * Get scan progress and discovered devices.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const scan = await (prisma as any).nmsDiscoveryScan.findUnique({
      where: { id: params.scanId },
      include: {
        discoveredDevices: {
          orderBy: { ipAddress: 'asc' },
          select: {
            id: true,
            ipAddress: true,
            hostname: true,
            vendor: true,
            snmpCommunity: true,
            sysDescr: true,
            snmpStatus: true,
            sshStatus: true,
            imported: true,
            importedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!scan) {
      return NextResponse.json({ error: `Scan ${params.scanId} not found` }, { status: 404 });
    }

    const progress = scan.totalHosts > 0
      ? Math.round((scan.processedHosts / scan.totalHosts) * 100)
      : 0;

    return NextResponse.json({
      ...scan,
      progress,
      pendingImport: scan.discoveredDevices.filter((d: any) => !d.imported).length,
    });
  } catch (error) {
    console.error('[NMS Scan] GET error:', error);
    return NextResponse.json({ error: 'Failed to get scan details' }, { status: 500 });
  }
}
