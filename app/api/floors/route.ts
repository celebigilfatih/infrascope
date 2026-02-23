import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Cache for 60 seconds
let cachedFloors: any = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60000;

export async function GET(_request: NextRequest) {
  try {
    // Return cached data if available
    const now = Date.now();
    if (cachedFloors && (now - cacheTimestamp) < CACHE_TTL) {
      return NextResponse.json({
        success: true,
        data: cachedFloors,
        timestamp: new Date(),
        cached: true
      });
    }

    const floors = await prisma.floor.findMany({
      include: {
        building: {
          select: {
            id: true,
            name: true,
            city: true,
            country: true
          }
        },
        rooms: {
          include: {
            racks: {
              select: {
                id: true,
                name: true,
                _count: {
                  select: { devices: true }
                }
              }
            }
          }
        }
      },
      orderBy: [
        { building: { name: 'asc' } },
        { floorNumber: 'asc' }
      ]
    });

    // Update cache
    cachedFloors = floors;
    cacheTimestamp = now;

    return NextResponse.json({
      success: true,
      data: floors,
      timestamp: new Date(),
      cached: false
    });
  } catch (error: any) {
    console.error('Error fetching floors:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch floors',
      timestamp: new Date()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, floorNumber, buildingId } = body;

    if (!name || floorNumber === undefined || !buildingId) {
      return NextResponse.json({
        success: false,
        error: 'Name, floorNumber and buildingId are required',
        timestamp: new Date()
      }, { status: 400 });
    }

    const floor = await prisma.floor.create({
      data: {
        name,
        floorNumber,
        buildingId
      }
    });

    return NextResponse.json({
      success: true,
      data: floor,
      timestamp: new Date()
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating floor:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create floor',
      timestamp: new Date()
    }, { status: 500 });
  }
}
