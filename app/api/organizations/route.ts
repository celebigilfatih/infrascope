import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Cache for 60 seconds to prevent database overload
let cachedOrganizations: any = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60000; // 60 seconds

export async function GET(_request: NextRequest) {
  try {
    // Return cached data if available and not expired
    const now = Date.now();
    if (cachedOrganizations && (now - cacheTimestamp) < CACHE_TTL) {
      return NextResponse.json({
        success: true,
        data: cachedOrganizations,
        timestamp: new Date(),
        cached: true
      });
    }

    // Optimized query: use select and _count to avoid loading all nested data
    const organizations = await prisma.organization.findMany({
      include: {
        buildings: {
          include: {
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
                        roomId: true,
                        operationalStatus: true,
                        coordX: true,
                        coordY: true,
                        coordZ: true,
                        rotation: true,
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
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    // Update cache
    cachedOrganizations = organizations;
    cacheTimestamp = now;

    return NextResponse.json({
      success: true,
      data: organizations,
      timestamp: new Date(),
      cached: false
    });
  } catch (error: any) {
    console.error('Error fetching organizations details:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch organizations',
      timestamp: new Date()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, code, description } = body;

    if (!name || !code) {
      return NextResponse.json({
        success: false,
        error: 'Name and code are required',
        timestamp: new Date()
      }, { status: 400 });
    }

    const organization = await prisma.organization.create({
      data: {
        name,
        code,
        description
      }
    });

    return NextResponse.json({
      success: true,
      data: organization,
      timestamp: new Date()
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating organization:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create organization',
      timestamp: new Date()
    }, { status: 500 });
  }
}
