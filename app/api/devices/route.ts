import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest) {
  try {
    const devices = await prisma.device.findMany({
      include: {
        rack: {
          include: {
            room: {
              include: {
                floor: {
                  include: {
                    building: true
                  }
                }
              }
            }
          }
        },
        networkInterfaces: true,
        services: true
      }
    });

    return NextResponse.json({
      success: true,
      data: devices,
      timestamp: new Date()
    });
  } catch (error: any) {
    console.error('Error fetching devices:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch devices',
      timestamp: new Date()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      name, type, vendor, model, serialNumber, assetTag, 
      criticality, status, rackId, rackUnitPosition 
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
        rackUnitPosition: rackUnitPosition ? parseInt(rackUnitPosition) : null
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
