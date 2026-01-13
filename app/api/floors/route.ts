import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest) {
  try {
    const floors = await prisma.floor.findMany({
      include: {
        building: true,
        rooms: {
          include: {
            racks: true
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      data: floors,
      timestamp: new Date()
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
