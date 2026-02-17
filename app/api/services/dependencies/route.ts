import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const serviceId = searchParams.get('serviceId');

    if (serviceId) {
      // Get dependencies for a specific service
      const dependencies = await prisma.dependency.findMany({
        where: {
          OR: [
            { sourceServiceId: serviceId },
            { targetDeviceId: serviceId },
          ],
        },
        include: {
          sourceService: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
          targetDevice: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return NextResponse.json({
        success: true,
        dependencies,
        count: dependencies.length,
      });
    }

    // Get all dependencies
    const dependencies = await prisma.dependency.findMany({
      include: {
        sourceService: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        targetDevice: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({
      success: true,
      dependencies,
      count: dependencies.length,
    });
  } catch (error) {
    console.error('Error fetching dependencies:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dependencies' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sourceServiceId, targetDeviceId, type, criticality, description } = body;

    if (!sourceServiceId || !targetDeviceId) {
      return NextResponse.json(
        { success: false, error: 'sourceServiceId and targetDeviceId are required' },
        { status: 400 }
      );
    }

    // Check if dependency already exists
    const existing = await prisma.dependency.findFirst({
      where: {
        sourceServiceId,
        targetDeviceId,
        type: type || 'DEPENDS_ON',
      },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Dependency already exists' },
        { status: 409 }
      );
    }

    const dependency = await prisma.dependency.create({
      data: {
        sourceServiceId,
        targetDeviceId,
        type: type || 'DEPENDS_ON',
        criticality: criticality || 'MEDIUM',
        description,
      },
      include: {
        sourceService: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        targetDevice: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      dependency,
    });
  } catch (error) {
    console.error('Error creating dependency:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create dependency' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, type, criticality, description } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Dependency ID is required' },
        { status: 400 }
      );
    }

    const dependency = await prisma.dependency.update({
      where: { id },
      data: {
        ...(type && { type }),
        ...(criticality && { criticality }),
        ...(description !== undefined && { description }),
      },
      include: {
        sourceService: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        targetDevice: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      dependency,
    });
  } catch (error) {
    console.error('Error updating dependency:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update dependency' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Dependency ID is required' },
        { status: 400 }
      );
    }

    await prisma.dependency.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Dependency deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting dependency:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete dependency' },
      { status: 500 }
    );
  }
}
