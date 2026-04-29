import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params { params: { id: string } }

const NMS_BACKEND_URL = process.env.NMS_BACKEND_URL || 'http://nms:8500';

function serializeBigInt(obj: unknown): unknown {
  return JSON.parse(JSON.stringify(obj, (_k, v) => typeof v === 'bigint' ? v.toString() : v));
}

/**
 * GET /api/integrations/nms/devices/[id]/backups
 * List configuration backups for a device from the DB.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const device = await (prisma as any).device.findUnique({
      where: { id: params.id },
      select: { nmsDeviceId: true, name: true },
    });

    if (!device?.nmsDeviceId) {
      return NextResponse.json({ error: 'Device has no NMS configuration' }, { status: 404 });
    }

    const backups = await (prisma as any).nmsBackup.findMany({
      where: { nmsDeviceId: device.nmsDeviceId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        backupType: true,
        backupFile: true,
        description: true,
        sizeBytes: true,
        checksum: true,
        createdAt: true,
        updatedAt: true,
        // Note: configuration (text) excluded from list — fetch per backup on demand
      },
    });

    return NextResponse.json(serializeBigInt({ backups, total: backups.length, deviceName: device.name }));
  } catch (error) {
    console.error('[NMS Device Backups] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch backups' }, { status: 500 });
  }
}

/**
 * POST /api/integrations/nms/devices/[id]/backups
 * Trigger a new config backup via NMS backend (SSH).
 * Body: { backupType?: string, description?: string }
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const device = await (prisma as any).device.findUnique({
      where: { id: params.id },
      select: { nmsDeviceId: true, name: true, managementIp: true },
    });

    if (!device?.nmsDeviceId) {
      return NextResponse.json({ error: 'Device has no NMS configuration' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const backupType = body.backupType || 'Running Config';
    const description = body.description || null;

    // Try NMS backend first (agent handles SSH)
    try {
      const nmsRes = await fetch(
        `${NMS_BACKEND_URL}/devices/${device.nmsDeviceId}/backup`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(120000),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            backup_type: backupType,
            description,
          }),
        }
      );

      if (nmsRes.ok) {
        const nmsData = await nmsRes.json();
        return NextResponse.json(
          { success: true, source: 'nms-agent', backup: nmsData.backup ?? nmsData },
          { status: 201 }
        );
      }

      // Surface backend error details rather than swallowing them
      const errText = await nmsRes.text().catch(() => '');
      return NextResponse.json(
        {
          error: 'NMS backup failed',
          status: nmsRes.status,
          detail: errText || nmsRes.statusText,
          device: device.name,
          managementIp: device.managementIp,
        },
        { status: nmsRes.status === 404 ? 404 : 502 }
      );
    } catch (e: any) {
      console.error('[NMS Device Backups] NMS agent error:', e?.message || e);
      return NextResponse.json(
        {
          error: 'NMS agent unreachable',
          hint: 'Backup requires the NMS agent service to be running for SSH access to the device.',
          detail: e?.message || String(e),
          device: device.name,
          managementIp: device.managementIp,
          nmsBackendUrl: NMS_BACKEND_URL,
        },
        { status: 503 }
      );
    }
  } catch (error) {
    console.error('[NMS Device Backups] POST error:', error);
    return NextResponse.json({ error: 'Failed to trigger backup' }, { status: 500 });
  }
}

/**
 * GET /api/integrations/nms/devices/[id]/backups?backupId=xxx
 * Fetch config text for a specific backup (via DB).
 */
