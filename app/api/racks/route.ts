import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Cache for 30 seconds to prevent database overload
let cachedRacks: any = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 30000; // 30 seconds

export async function GET(_request: NextRequest) {
  try {
    // Return cached data if available and not expired
    const now = Date.now();
    if (cachedRacks && (now - cacheTimestamp) < CACHE_TTL) {
      return NextResponse.json({
        success: true,
        data: cachedRacks,
        timestamp: new Date(),
        cached: true
      });
    }

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
        devices: {
          select: {
            id: true,
            name: true,
            deviceType: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    // Update cache
    cachedRacks = racks;
    cacheTimestamp = now;

    return NextResponse.json({
      success: true,
      data: racks,
      timestamp: new Date,
      cached: false
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
