import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest) {
  try {
    const racks = await prisma.rack.findMany({
      include: {
        room: {
          include: {
            floor: {
              include: {
                building: true
              }
            }
          }
        },
        devices: true
      }
    });

    return NextResponse.json({
      success: true,
      data: racks,
      timestamp: new Date()
    });
  } catch (error: any) {
    console.error('Error fetching racks:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch racks',
      timestamp: new Date()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      name, 
      type, 
      maxUnits, 
      roomId, 
      position, 
      operationalStatus,
      coordX,
      coordY,
      coordZ,
      rotation
    } = body;

    if (!name || !roomId) {
      return NextResponse.json({
        success: false,
        error: 'Name and roomId are required',
        timestamp: new Date()
      }, { status: 400 });
    }

    const rack = await prisma.rack.create({
      data: {
        name,
        type: type || 'RACK_42U',
        maxUnits: maxUnits || 42,
        roomId,
        position,
        coordX: coordX !== undefined ? parseFloat(coordX) : null,
        coordY: coordY !== undefined ? parseFloat(coordY) : null,
        coordZ: coordZ !== undefined ? parseFloat(coordZ) : null,
        rotation: rotation !== undefined ? parseFloat(rotation) : 0,
        operationalStatus: operationalStatus || 'OPERATIONAL'
      }
    });

    return NextResponse.json({
      success: true,
      data: rack,
      timestamp: new Date()
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating rack:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create rack',
      timestamp: new Date()
    }, { status: 500 });
  }
}
