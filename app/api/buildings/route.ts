import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Cache for 60 seconds to prevent database overload
let cachedBuildings: any = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60000; // 60 seconds

export async function GET(_request: NextRequest) {
  try {
    // Return cached data if available and not expired
    const now = Date.now();
    if (cachedBuildings && (now - cacheTimestamp) < CACHE_TTL) {
      return NextResponse.json({
        success: true,
        data: cachedBuildings,
        timestamp: new Date(),
        cached: true
      });
    }

    // Optimized query: only fetch necessary data, not all nested devices
    const buildings = await prisma.building.findMany({
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            code: true
          }
        },
        floors: {
          include: {
            rooms: {
              include: {
                racks: {
                  select: {
                    id: true,
                    name: true,
                    type: true,
                    maxUnits: true,
                    operationalStatus: true,
                    _count: {
                      select: { devices: true }
                    }
                  }
                }
              }
            }
          },
          orderBy: {
            floorNumber: 'asc'
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    // Update cache
    cachedBuildings = buildings;
    cacheTimestamp = now;

    return NextResponse.json({
      success: true,
      data: buildings,
      timestamp: new Date(),
      cached: false
    });
  } catch (error: any) {
    console.error('Error fetching buildings:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch buildings',
      timestamp: new Date()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, address, city, country, organizationId } = body;

    if (!name || !organizationId) {
      return NextResponse.json({
        success: false,
        error: 'Name and organizationId are required',
        timestamp: new Date()
      }, { status: 400 });
    }

    const building = await prisma.building.create({
      data: {
        name,
        address: address || '',
        city: city || '',
        country: country || '',
        organizationId
      }
    });

    return NextResponse.json({
      success: true,
      data: building,
      timestamp: new Date()
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating building:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create building',
      timestamp: new Date()
    }, { status: 500 });
  }
}
