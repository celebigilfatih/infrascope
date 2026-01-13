/**
 * Room Detail Endpoints
 * GET /api/rooms/[id] - Get room by ID
 * PUT /api/rooms/[id] - Update room
 * DELETE /api/rooms/[id] - Delete room
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ============================================================================
// GET - Get room by ID
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
          error: 'Room ID is required',
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    // Fetch room with all related data
    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        floor: {
          include: {
            building: {
              select: {
                id: true,
                name: true,
                city: true,
                organizationId: true,
              },
            },
          },
        },
        racks: {
          include: {
            devices: {
              select: {
                id: true,
                name: true,
                type: true,
                status: true,
              },
            },
          },
          orderBy: {
            name: 'asc',
          },
        },
      },
    });

    if (!room) {
      return NextResponse.json(
        {
          success: false,
          error: 'Room not found',
          timestamp: new Date(),
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: room,
        timestamp: new Date(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching room:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch room',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// PUT - Update room
// ============================================================================
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { name, description, capacity } = body;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Room ID is required',
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    // Validate at least one field is provided
    if (name === undefined && description === undefined && capacity === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: 'At least one field (name, description, or capacity) must be provided for update',
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

    if (description !== undefined && description !== null) {
      if (typeof description !== 'string' || description.length > 1000) {
        return NextResponse.json(
          {
            success: false,
            error: 'Description must be a string (max 1000 characters)',
            timestamp: new Date(),
          },
          { status: 400 }
        );
      }
    }

    if (capacity !== undefined && capacity !== null) {
      if (!Number.isInteger(capacity) || capacity < 0 || capacity > 10000) {
        return NextResponse.json(
          {
            success: false,
            error: 'Capacity must be a positive integer between 0 and 10000',
            timestamp: new Date(),
          },
          { status: 400 }
        );
      }
    }

    // Check room exists and get floor context
    const existing = await prisma.room.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'Room not found',
          timestamp: new Date(),
        },
        { status: 404 }
      );
    }

    // If updating name, check for duplicates on same floor
    if (name !== undefined && name !== existing.name) {
      const duplicate = await prisma.room.findFirst({
        where: {
          floorId: existing.floorId,
          name,
        },
      });

      if (duplicate) {
        return NextResponse.json(
          {
            success: false,
            error: 'A room with this name already exists on this floor',
            timestamp: new Date(),
          },
          { status: 409 }
        );
      }
    }

    // Build update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (capacity !== undefined) updateData.capacity = capacity;

    // Update room
    const updated = await prisma.room.update({
      where: { id },
      data: updateData,
      include: {
        floor: {
          select: {
            id: true,
            name: true,
            floorNumber: true,
            buildingId: true,
          },
        },
        racks: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: updated,
        message: 'Room updated successfully',
        timestamp: new Date(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating room:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update room',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE - Delete room
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
          error: 'Room ID is required',
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    // Check room exists and get racks
    const existing = await prisma.room.findUnique({
      where: { id },
      include: {
        racks: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'Room not found',
          timestamp: new Date(),
        },
        { status: 404 }
      );
    }

    // Prevent deletion if room has racks
    if (existing.racks && existing.racks.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete room with ${existing.racks.length} rack(s). Delete racks first.`,
          timestamp: new Date(),
        },
        { status: 409 }
      );
    }

    // Delete room
    const deleted = await prisma.room.delete({
      where: { id },
    });

    return NextResponse.json(
      {
        success: true,
        data: deleted,
        message: 'Room deleted successfully',
        timestamp: new Date(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting room:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete room',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}
