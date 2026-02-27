import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 500);
    const offset = (page - 1) * limit;
    // 'minimal' skips heavy nested joins (used by dashboard)
    // 'full' (default) returns all relations for other pages
    const mode = searchParams.get('mode') || 'full';

    const selectMinimal = {
      id: true,
      name: true,
      type: true,
      displayName: true,
      status: true,
      port: true,
      protocol: true,
      criticality: true,
      createdAt: true,
      device: {
        select: { id: true, name: true, type: true }
      },
    };

    const includeFull = {
      device: {
        include: {
          rack: {
            include: {
              room: {
                include: {
                  floor: {
                    include: { building: true }
                  }
                }
              }
            }
          }
        }
      },
      application: true,
      dependencies: {
        include: { targetDevice: true }
      }
    };

    const [services, total] = await Promise.all([
      mode === 'full'
        ? prisma.service.findMany({ skip: offset, take: limit, include: includeFull, orderBy: { name: 'asc' } })
        : prisma.service.findMany({ skip: offset, take: limit, select: selectMinimal, orderBy: { name: 'asc' } }),
      prisma.service.count()
    ]);

    return NextResponse.json({
      success: true,
      data: services,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      timestamp: new Date()
    });
  } catch (error: any) {
    console.error('Error fetching services:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch services',
      timestamp: new Date()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      name, type, displayName, description, status, 
      port, protocol, deviceId, applicationId, criticality 
    } = body;

    if (!name || !type || !port || !deviceId) {
      return NextResponse.json({
        success: false,
        error: 'Name, type, port and deviceId are required',
        timestamp: new Date()
      }, { status: 400 });
    }

    const service = await prisma.service.create({
      data: {
        name,
        type,
        displayName,
        description,
        status: status || 'UNKNOWN',
        port: parseInt(port),
        protocol: protocol || 'TCP',
        deviceId,
        applicationId,
        criticality: criticality || 'MEDIUM'
      }
    });

    return NextResponse.json({
      success: true,
      data: service,
      timestamp: new Date()
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating service:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create service',
      timestamp: new Date()
    }, { status: 500 });
  }
}
