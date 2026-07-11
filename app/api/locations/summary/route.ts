import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateRackCapacity } from '@/lib/rack-capacity';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [organizationCount, buildingCount, rooms, deviceCount, problemDeviceCount, unpositionedDeviceCount] = await Promise.all([
      prisma.organization.count(),
      prisma.building.count(),
      prisma.room.findMany({
        include: {
          floor: {
            include: {
              building: {
                include: {
                  organization: { select: { id: true, name: true } },
                },
              },
            },
          },
          racks: {
            include: {
              devices: {
                select: {
                  id: true,
                  status: true,
                  rackUnitPosition: true,
                  metadata: true,
                },
              },
            },
            orderBy: { name: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.device.count({ where: { rackId: { not: null } } }),
      prisma.device.count({ where: { rackId: { not: null }, status: { in: ['INACTIVE', 'MAINTENANCE', 'UNKNOWN'] } } }),
      prisma.device.count({ where: { rackId: { not: null }, rackUnitPosition: null } }),
    ]);

    let rackCount = 0;
    let totalUnits = 0;
    let usedUnits = 0;

    const roomSummaries = rooms.map((room) => {
      let roomDevices = 0;
      let roomProblems = 0;
      let roomUnpositioned = 0;
      let roomConflicts = 0;
      let roomTotalUnits = 0;
      let roomUsedUnits = 0;

      const racks = room.racks.map((rack) => {
        const capacity = calculateRackCapacity(rack.maxUnits, rack.devices);
        const problemDevices = rack.devices.filter((device) => ['INACTIVE', 'MAINTENANCE', 'UNKNOWN'].includes(device.status)).length;
        roomDevices += rack.devices.length;
        roomProblems += problemDevices;
        roomUnpositioned += capacity.unpositionedDevices;
        roomConflicts += capacity.conflictDevices;
        roomTotalUnits += capacity.totalUnits;
        roomUsedUnits += capacity.usedUnits;

        return {
          id: rack.id,
          name: rack.name,
          type: rack.type,
          maxUnits: rack.maxUnits,
          operationalStatus: rack.operationalStatus,
          coordX: rack.coordX,
          coordZ: rack.coordZ,
          rotation: rack.rotation,
          deviceCount: rack.devices.length,
          problemDeviceCount: problemDevices,
          ...capacity,
        };
      });

      rackCount += room.racks.length;
      totalUnits += roomTotalUnits;
      usedUnits += roomUsedUnits;

      const status = roomProblems > 0 || room.racks.some((rack) => rack.operationalStatus !== 'OPERATIONAL')
        ? 'ATTENTION'
        : roomConflicts > 0 || roomUnpositioned > 0
          ? 'PLANNING'
          : 'HEALTHY';

      return {
        id: room.id,
        name: room.name,
        description: room.description,
        width: room.width,
        depth: room.depth,
        height: room.height,
        floor: {
          id: room.floor.id,
          name: room.floor.name,
          floorNumber: room.floor.floorNumber,
          building: {
            id: room.floor.building.id,
            name: room.floor.building.name,
            city: room.floor.building.city,
            organization: room.floor.building.organization,
          },
        },
        rackCount: room.racks.length,
        deviceCount: roomDevices,
        problemDeviceCount: roomProblems,
        unpositionedDeviceCount: roomUnpositioned,
        conflictDeviceCount: roomConflicts,
        totalUnits: roomTotalUnits,
        usedUnits: roomUsedUnits,
        utilization: roomTotalUnits > 0 ? Math.round((roomUsedUnits / roomTotalUnits) * 100) : 0,
        status,
        racks,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        totals: {
          organizations: organizationCount,
          buildings: buildingCount,
          rooms: rooms.length,
          racks: rackCount,
          devices: deviceCount,
          problemDevices: problemDeviceCount,
          unpositionedDevices: unpositionedDeviceCount,
          totalUnits,
          usedUnits,
          utilization: totalUnits > 0 ? Math.round((usedUnits / totalUnits) * 100) : 0,
        },
        rooms: roomSummaries,
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error fetching locations summary:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch locations summary' }, { status: 500 });
  }
}
