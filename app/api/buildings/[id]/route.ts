/**
 * Building Detail Endpoints
 * GET /api/buildings/[id] - Get building by ID
 * PUT /api/buildings/[id] - Update building
 * DELETE /api/buildings/[id] - Delete building
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Building ID is required',
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    const building = await prisma.building.findUnique({
      where: { id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        floors: {
          include: {
            rooms: {
              include: {
                racks: true,
              },
              orderBy: {
                name: 'asc',
              },
            },
          },
          orderBy: {
            floorNumber: 'asc',
          },
        },
      },
    });

    if (!building) {
      return NextResponse.json(
        {
          success: false,
          error: 'Building not found',
          timestamp: new Date(),
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: building,
        timestamp: new Date(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching building:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch building',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { name, address, city, country, postalCode, latitude, longitude } = body;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Building ID is required',
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    if (
      name === undefined &&
      address === undefined &&
      city === undefined &&
      country === undefined &&
      postalCode === undefined &&
      latitude === undefined &&
      longitude === undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'At least one field must be provided for update',
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    if (name !== undefined && (typeof name !== 'string' || name.trim().length < 1 || name.length > 255)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Name must be a non-empty string (max 255 characters)',
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    const existing = await prisma.building.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'Building not found',
          timestamp: new Date(),
        },
        { status: 404 }
      );
    }

    if (name !== undefined && name !== existing.name) {
      const duplicate = await prisma.building.findFirst({
        where: {
          organizationId: existing.organizationId,
          name,
          NOT: { id },
        },
      });

      if (duplicate) {
        return NextResponse.json(
          {
            success: false,
            error: 'A building with this name already exists in this organization',
            timestamp: new Date(),
          },
          { status: 409 }
        );
      }
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (address !== undefined) updateData.address = address || '';
    if (city !== undefined) updateData.city = city || '';
    if (country !== undefined) updateData.country = country || '';
    if (postalCode !== undefined) updateData.postalCode = postalCode || null;
    if (latitude !== undefined) updateData.latitude = latitude !== null && latitude !== '' ? Number(latitude) : null;
    if (longitude !== undefined) updateData.longitude = longitude !== null && longitude !== '' ? Number(longitude) : null;

    const updated = await prisma.building.update({
      where: { id },
      data: updateData,
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        floors: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: updated,
        message: 'Building updated successfully',
        timestamp: new Date(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating building:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update building',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Building ID is required',
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    const existing = await prisma.building.findUnique({
      where: { id },
      include: {
        floors: true,
        sourceConnections: true,
        destConnections: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'Building not found',
          timestamp: new Date(),
        },
        { status: 404 }
      );
    }

    if (existing.floors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete building with ${existing.floors.length} floor(s). Delete floors first.`,
          timestamp: new Date(),
        },
        { status: 409 }
      );
    }

    if (existing.sourceConnections.length > 0 || existing.destConnections.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot delete building with active building connection(s). Delete building connections first.',
          timestamp: new Date(),
        },
        { status: 409 }
      );
    }

    const deleted = await prisma.building.delete({
      where: { id },
    });

    return NextResponse.json(
      {
        success: true,
        data: deleted,
        message: 'Building deleted successfully',
        timestamp: new Date(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting building:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete building',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}
