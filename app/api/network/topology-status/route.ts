import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

interface TopologyStatusRow {
  deviceId: string;
  deviceName: string;
  nmsDeviceId: number | null;
  managementIp: string | null;
  portId: string;
  interfaceIndex: number;
  interfaceName: string;
  description: string | null;
  adminStatus: string;
  operStatus: string;
  downSince: Date | null;
  lastPolledAt: Date | null;
  updatedAt: Date | null;
  monitored: boolean;
}

export async function GET() {
  try {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'nms_interfaces'
        AND column_name IN ('down_since', 'monitored')
    `;

    const existingColumns = new Set(columns.map((column) => column.column_name));
    const hasDownSince = existingColumns.has('down_since');
    const hasMonitored = existingColumns.has('monitored');
    const downSinceSelect = hasDownSince
      ? Prisma.sql`i."down_since" AS "downSince"`
      : Prisma.sql`NULL::timestamp AS "downSince"`;
    const monitoredSelect = hasMonitored
      ? Prisma.sql`i."monitored" AS "monitored"`
      : Prisma.sql`TRUE AS "monitored"`;
    const monitoredPredicate = hasMonitored
      ? Prisma.sql`AND i."monitored" = true`
      : Prisma.empty;
    const orderBy = hasDownSince
      ? Prisma.sql`i."down_since" ASC NULLS LAST, i."interface_name" ASC`
      : Prisma.sql`i."interface_name" ASC`;

    const rows = await prisma.$queryRaw<TopologyStatusRow[]>(Prisma.sql`
      SELECT
        d."id" AS "deviceId",
        d."name" AS "deviceName",
        d."nms_device_id" AS "nmsDeviceId",
        d."management_ip" AS "managementIp",
        i."id" AS "portId",
        i."interface_index" AS "interfaceIndex",
        i."interface_name" AS "interfaceName",
        i."description" AS "description",
        i."admin_status" AS "adminStatus",
        i."oper_status" AS "operStatus",
        ${downSinceSelect},
        i."last_polled_at" AS "lastPolledAt",
        i."updated_at" AS "updatedAt",
        ${monitoredSelect}
      FROM "devices" d
      INNER JOIN "nms_interfaces" i ON i."nms_device_id" = d."nms_device_id"
      WHERE d."nms_device_id" IS NOT NULL
        ${monitoredPredicate}
        AND i."admin_status" = 'up'
        AND i."oper_status" = 'down'
      ORDER BY d."name" ASC, ${orderBy}
    `);

    const devices = rows.reduce((acc, row) => {
      if (!acc.has(row.deviceId)) {
        acc.set(row.deviceId, {
          deviceId: row.deviceId,
          deviceName: row.deviceName,
          nmsDeviceId: row.nmsDeviceId,
          managementIp: row.managementIp,
          portDownCount: 0,
          downPorts: [] as Array<{
            id: string;
            interfaceIndex: number;
            interfaceName: string;
            description: string | null;
            adminStatus: string;
            operStatus: string;
            downSince: Date | null;
            lastPolledAt: Date | null;
            updatedAt: Date | null;
            monitored: boolean;
          }>,
        });
      }

      const device = acc.get(row.deviceId)!;
      device.portDownCount += 1;
      device.downPorts.push({
        id: row.portId,
        interfaceIndex: row.interfaceIndex,
        interfaceName: row.interfaceName,
        description: row.description,
        adminStatus: row.adminStatus,
        operStatus: row.operStatus,
        downSince: row.downSince,
        lastPolledAt: row.lastPolledAt,
        updatedAt: row.updatedAt,
        monitored: row.monitored,
      });

      return acc;
    }, new Map<string, {
      deviceId: string;
      deviceName: string;
      nmsDeviceId: number | null;
      managementIp: string | null;
      portDownCount: number;
      downPorts: Array<{
        id: string;
        interfaceIndex: number;
        interfaceName: string;
        description: string | null;
        adminStatus: string;
        operStatus: string;
        downSince: Date | null;
        lastPolledAt: Date | null;
        updatedAt: Date | null;
        monitored: boolean;
      }>;
    }>());

    const affectedDevices = Array.from(devices.values());

    return NextResponse.json({
      success: true,
      data: {
        devices: affectedDevices,
        affectedDeviceCount: affectedDevices.length,
        totalPortDownCount: affectedDevices.reduce((total, device) => total + device.portDownCount, 0),
      },
      timestamp: new Date(),
    });
  } catch (error: any) {
    console.error('[Network Topology Status] GET error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch topology status',
      timestamp: new Date(),
    }, { status: 500 });
  }
}
