import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest) {
  try {
    // Temporarily exclude racks to avoid coordX column error
    const organizations = await prisma.organization.findMany({
      include: {
        buildings: {
          include: {
            floors: {
              include: {
                rooms: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    floorId: true,
                    capacity: true,
                    createdAt: true,
                    updatedAt: true,
                    width: true,
                    depth: true,
                    height: true
                    // racks excluded for now
                  }
                }
              }
            }
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      data: organizations,
      timestamp: new Date()
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
