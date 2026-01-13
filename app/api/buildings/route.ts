import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest) {
  try {
    const buildings = await prisma.building.findMany({
      include: {
        organization: true,
        floors: {
          include: {
            rooms: {
              include: {
                racks: true
              }
            }
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      data: buildings,
      timestamp: new Date()
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
