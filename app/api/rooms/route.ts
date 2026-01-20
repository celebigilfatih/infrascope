import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest) {
  try {
    const rooms = await prisma.room.findMany({
      include: {
        floor: {
          include: {
            building: true
          }
        },
        racks: true
      }
    });

    return NextResponse.json({
      success: true,
      data: rooms,
      timestamp: new Date()
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
