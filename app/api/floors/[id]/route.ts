/**
 * Floor Detail Endpoints
 * GET /api/floors/[id] - Get floor by ID
 * PUT /api/floors/[id] - Update floor
 * DELETE /api/floors/[id] - Delete floor
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ============================================================================
// GET - Get floor by ID
// ============================================================================
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
          error: 'Floor ID is required',
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    // Fetch floor with all related data
    const floor = await prisma.floor.findUnique({
      where: { id },
      include: {
        building: {
          select: {
            id: true,
            name: true,
            city: true,
            organizationId: true,
          },
        },
        rooms: {
          include: {
            racks: true,
          },
          orderBy: {
            name: 'asc',
          },
        },
      },
    });

    if (!floor) {
      return NextResponse.json(
        {
          success: false,
          error: 'Floor not found',
          timestamp: new Date(),
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: floor,
        timestamp: new Date(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching floor:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch floor',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// PUT - Update floor
// ============================================================================
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { name, floorNumber } = body;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Floor ID is required',
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    // Validate at least one field is provided
    if (name === undefined && floorNumber === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: 'At least one field (name or floorNumber) must be provided for update',
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    // Validate inputs if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || name.length < 1 || name.length > 255) {
        return NextResponse.json(
          {
            success: false,
            error: 'Name must be a non-empty string (max 255 characters)',
            timestamp: new Date(),
          },
          { status: 400 }
        );
      }
    }

    if (floorNumber !== undefined) {
      if (!Number.isInteger(floorNumber)) {
        return NextResponse.json(
          {
            success: false,
            error: 'floorNumber must be an integer',
            timestamp: new Date(),
          },
          { status: 400 }
        );
      }

      if (floorNumber < -100 || floorNumber > 1000) {
        return NextResponse.json(
          {
            success: false,
            error: 'floorNumber must be between -100 (basement) and 1000',
            timestamp: new Date(),
          },
          { status: 400 }
        );
      }
    }

    // Check floor exists and get building context
    const existing = await prisma.floor.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'Floor not found',
          timestamp: new Date(),
        },
        { status: 404 }
      );
    }

    // If updating floor number, check for duplicates in same building
    if (floorNumber !== undefined && floorNumber !== existing.floorNumber) {
      const duplicate = await prisma.floor.findFirst({
        where: {
          buildingId: existing.buildingId,
          floorNumber,
        },
      });

      if (duplicate) {
        return NextResponse.json(
          {
            success: false,
            error: 'A floor with this floor number already exists in this building',
            timestamp: new Date(),
          },
          { status: 409 }
        );
      }
    }

    // Build update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (floorNumber !== undefined) updateData.floorNumber = floorNumber;

    // Update floor
    const updated = await prisma.floor.update({
      where: { id },
      data: updateData,
      include: {
        building: {
          select: {
            id: true,
            name: true,
            city: true,
          },
        },
        rooms: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: updated,
        message: 'Floor updated successfully',
        timestamp: new Date(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating floor:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update floor',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE - Delete floor
// ============================================================================
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
          error: 'Floor ID is required',
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    // Check floor exists and get rooms
    const existing = await prisma.floor.findUnique({
      where: { id },
      include: {
        rooms: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'Floor not found',
          timestamp: new Date(),
        },
        { status: 404 }
      );
    }

    // Prevent deletion if floor has rooms
    if (existing.rooms && existing.rooms.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete floor with ${existing.rooms.length} room(s). Delete rooms first.`,
          timestamp: new Date(),
        },
        { status: 409 }
      );
    }

    // Delete floor
    const deleted = await prisma.floor.delete({
      where: { id },
    });

    return NextResponse.json(
      {
        success: true,
        data: deleted,
        message: 'Floor deleted successfully',
        timestamp: new Date(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting floor:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete floor',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}
