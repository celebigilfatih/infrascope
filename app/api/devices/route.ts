import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkDeviceLimit } from '@/lib/license/middleware';

// Manually-managed device types (not auto-discovered from integrations)
const MANUAL_DEVICE_TYPES = [
  'PHYSICAL_SERVER', 'FIREWALL', 'SWITCH', 'ROUTER', 'STORAGE',
  'PDU', 'PATCH_PANEL', 'PRINTER', 'CAMERA', 'OTHER',
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 200);
    const offset = (page - 1) * limit;
    const filterType = searchParams.get('filterType') || 'manual';
    const search = searchParams.get('search') || '';

    // Build where clause based on filter
    const typeFilter: any =
      filterType === 'manual' ? { type: { in: MANUAL_DEVICE_TYPES } }
      : filterType !== 'all' ? { type: filterType }
      : {};

    const searchFilter: any = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { serialNumber: { contains: search, mode: 'insensitive' } },
            { vendor: { contains: search, mode: 'insensitive' } },
            { model: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const where: any =
      search
        ? { AND: [typeFilter, searchFilter] }
        : typeFilter;

    // 'minimal' mode returns only basic fields (no joins) - used by dashboard
    // 'full' mode (default) returns all nested relations - used by device detail pages
    const mode = searchParams.get('mode') || 'full';

    const selectMinimal = {
      id: true, name: true, type: true, vendor: true, model: true,
      serialNumber: true, assetTag: true, status: true, criticality: true,
      supportDate: true, rackUnitPosition: true, createdAt: true, updatedAt: true,
      rackId: true,
    };

    const includeFull = {
      rack: {
        include: {
          room: {
            include: {
              floor: { include: { building: true } }
            }
          }
        }
      },
      networkInterfaces: true,
      services: true,
    };

    const [devices, total] = await Promise.all([
      mode === 'full'
        ? prisma.device.findMany({ where, skip: offset, take: limit, include: includeFull, orderBy: { name: 'asc' } })
        : prisma.device.findMany({ where, skip: offset, take: limit, select: { ...selectMinimal }, orderBy: { name: 'asc' } }),
      prisma.device.count({ where })
    ]);

    return NextResponse.json({
      success: true,
      data: devices,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      timestamp: new Date()
    });
  } catch (error: any) {
    console.error('Error fetching devices details:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch devices',
      timestamp: new Date()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentDeviceCount = await prisma.device.count();
    const licenseError = await checkDeviceLimit(currentDeviceCount);
    if (licenseError) return licenseError;

    const body = await request.json();
    const { 
      name, type, vendor, model, serialNumber, assetTag, 
      criticality, status, rackId, rackUnitPosition, supportDate 
    } = body;

    if (!name || !type) {
      return NextResponse.json({
        success: false,
        error: 'Name and type are required',
        timestamp: new Date()
      }, { status: 400 });
    }

    const device = await prisma.device.create({
      data: {
        name,
        type,
        vendor,
        model,
        serialNumber,
        assetTag,
        criticality: criticality || 'MEDIUM',
        status: status || 'UNKNOWN',
        rackId,
        rackUnitPosition: rackUnitPosition ? parseInt(rackUnitPosition) : null,
        supportDate: supportDate ? new Date(supportDate) : null
      }
    });

    return NextResponse.json({
      success: true,
      data: device,
      timestamp: new Date()
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating device:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create device',
      timestamp: new Date()
    }, { status: 500 });
  }
}
