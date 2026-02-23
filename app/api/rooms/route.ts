import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Cache for 60 seconds
let cachedRooms: any = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60000;

export async function GET(_request: NextRequest) {
  try {
    // Return cached data if available
    const now = Date.now();
    if (cachedRooms && (now - cacheTimestamp) < CACHE_TTL) {
      return NextResponse.json({
        success: true,
        data: cachedRooms,
        timestamp: new Date(),
        cached: true
      });
    }

    const rooms = await prisma.room.findMany({
      include: {
        floor: {
          select: {
            id: true,
            name: true,
            floorNumber: true,
            building: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        racks: {
          select: {
            id: true,
            name: true,
            type: true,
            operationalStatus: true,
            _count: {
              select: { devices: true }
            }
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    // Update cache
    cachedRooms = rooms;
    cacheTimestamp = now;

    return NextResponse.json({
      success: true,
      data: rooms,
      timestamp: new Date(),
      cached: false
    });
  } catch (error: any) {
    console.error('Error fetching rooms:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch rooms',
      timestamp: new Date()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, floorId, capacity, width, depth, height } = body;

    if (!name || !floorId) {
      return NextResponse.json({
        success: false,
        error: 'Name and floorId are required',
        timestamp: new Date()
      }, { status: 400 });
    }

    const room = await prisma.room.create({
      data: {
        name,
        description,
        floorId,
        capacity,
        width: width !== undefined ? parseFloat(width) : null,
        depth: depth !== undefined ? parseFloat(depth) : null,
        height: height !== undefined ? parseFloat(height) : null,
      }
    });

    return NextResponse.json({
      success: true,
      data: room,
      timestamp: new Date()
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating room:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create room',
      timestamp: new Date()
    }, { status: 500 });
  }
}
