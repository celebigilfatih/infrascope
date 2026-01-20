import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const rackId = params.id;

    // Fetch all devices in this rack with network interfaces
    const devices = await prisma.device.findMany({
      where: {
        rackId: rackId,
      },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        rackUnitPosition: true,
        model: true,
        serialNumber: true,
        networkInterfaces: {
          select: {
            ipv4: true,
          },
          take: 1,
        },
      },
      orderBy: [
        { rackUnitPosition: 'asc' },
        { name: 'asc' },
      ],
    });

    // Transform data to include ipAddress from first network interface
    const transformedDevices = devices.map(device => ({
      id: device.id,
      name: device.name,
      type: device.type,
      status: device.status,
      rackUnit: device.rackUnitPosition,
      ipAddress: device.networkInterfaces[0]?.ipv4 || null,
      model: device.model,
      serialNumber: device.serialNumber,
    }));

    return NextResponse.json(transformedDevices);
  } catch (error) {
    console.error('Error fetching rack devices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rack devices' },
      { status: 500 }
    );
  }
}
