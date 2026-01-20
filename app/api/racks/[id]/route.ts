/**
 * Rack Detail Endpoints
 * GET /api/racks/[id] - Get rack by ID
 * PUT /api/racks/[id] - Update rack
 * DELETE /api/racks/[id] - Delete rack
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Valid rack types and statuses
const VALID_RACK_TYPES = ['RACK_42U', 'RACK_45U', 'CUSTOM'];
const VALID_RACK_STATUSES = ['OPERATIONAL', 'MAINTENANCE', 'DECOMMISSIONED'];

// ============================================================================
// GET - Get rack by ID
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
          error: 'Rack ID is required',
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    // Fetch rack with all related data
    const rack = await prisma.rack.findUnique({
      where: { id },
      include: {
        room: {
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
          },
        },
        devices: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            rackUnitPosition: true,
          },
          orderBy: {
            rackUnitPosition: 'asc',
          },
        },
        units: {
          include: {
            device: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
          orderBy: {
            position: 'asc',
          },
        },
      },
    });

    if (!rack) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rack not found',
          timestamp: new Date(),
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: rack,
        timestamp: new Date(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching rack:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch rack',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// PUT - Update rack
// ============================================================================
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { 
      name, 
      type, 
      maxUnits, 
      position, 
      operationalStatus,
      coordX,
      coordY,
      coordZ,
      rotation
    } = body;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rack ID is required',
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    // Validate at least one field is provided
    if (
      name === undefined &&
      type === undefined &&
      maxUnits === undefined &&
      position === undefined &&
      operationalStatus === undefined &&
      coordX === undefined &&
      coordY === undefined &&
      coordZ === undefined &&
      rotation === undefined
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

    if (type !== undefined && !VALID_RACK_TYPES.includes(type)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid rack type. Must be one of: ${VALID_RACK_TYPES.join(', ')}`,
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    if (maxUnits !== undefined) {
      if (!Number.isInteger(maxUnits) || maxUnits < 1 || maxUnits > 100) {
        return NextResponse.json(
          {
            success: false,
            error: 'maxUnits must be an integer between 1 and 100',
            timestamp: new Date(),
          },
          { status: 400 }
        );
      }
    }

    if (position !== undefined && position !== null) {
      if (typeof position !== 'string' || position.length > 100) {
        return NextResponse.json(
          {
            success: false,
            error: 'Position must be a string (max 100 characters)',
            timestamp: new Date(),
          },
          { status: 400 }
        );
      }
    }

    if (operationalStatus !== undefined && !VALID_RACK_STATUSES.includes(operationalStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid status. Must be one of: ${VALID_RACK_STATUSES.join(', ')}`,
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    // Check rack exists and get room context
    const existing = await prisma.rack.findUnique({
      where: { id },
      include: {
        devices: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rack not found',
          timestamp: new Date(),
        },
        { status: 404 }
      );
    }

    // If updating name, check for duplicates in same room
    if (name !== undefined && name !== existing.name) {
      const duplicate = await prisma.rack.findFirst({
        where: {
          roomId: existing.roomId,
          name,
        },
      });

      if (duplicate) {
        return NextResponse.json(
          {
            success: false,
            error: 'A rack with this name already exists in this room',
            timestamp: new Date(),
          },
          { status: 409 }
        );
      }
    }

    // If reducing maxUnits, ensure no devices exceed new limit
    if (maxUnits !== undefined && maxUnits < existing.maxUnits) {
      const hasDevicesBeyondLimit = existing.devices.some(
        (device: any) => device.rackUnitPosition > maxUnits
      );

      if (hasDevicesBeyondLimit) {
        return NextResponse.json(
          {
            success: false,
            error: `Cannot reduce maxUnits to ${maxUnits}. Devices exist beyond this position.`,
            timestamp: new Date(),
          },
          { status: 409 }
        );
      }
    }

    // Build update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (maxUnits !== undefined) updateData.maxUnits = maxUnits;
    if (position !== undefined) updateData.position = position;
    if (operationalStatus !== undefined) updateData.operationalStatus = operationalStatus;
    if (coordX !== undefined) updateData.coordX = coordX !== null ? parseFloat(coordX) : null;
    if (coordY !== undefined) updateData.coordY = coordY !== null ? parseFloat(coordY) : null;
    if (coordZ !== undefined) updateData.coordZ = coordZ !== null ? parseFloat(coordZ) : null;
    if (rotation !== undefined) updateData.rotation = rotation !== null ? parseFloat(rotation) : 0;

    // Update rack
    const updated = await prisma.rack.update({
      where: { id },
      data: updateData,
      include: {
        room: {
          select: {
            id: true,
            name: true,
            floorId: true,
          },
        },
        devices: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: updated,
        message: 'Rack updated successfully',
        timestamp: new Date(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating rack:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update rack',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE - Delete rack
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
          error: 'Rack ID is required',
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    // Check rack exists and get devices
    const existing = await prisma.rack.findUnique({
      where: { id },
      include: {
        devices: true,
        units: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rack not found',
          timestamp: new Date(),
        },
        { status: 404 }
      );
    }

    // Prevent deletion if rack has devices
    if (existing.devices && existing.devices.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete rack with ${existing.devices.length} device(s). Remove devices first.`,
          timestamp: new Date(),
        },
        { status: 409 }
      );
    }

    // Delete rack (cascade will handle units)
    const deleted = await prisma.rack.delete({
      where: { id },
    });

    return NextResponse.json(
      {
        success: true,
        data: deleted,
        message: 'Rack deleted successfully',
        timestamp: new Date(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting rack:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete rack',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}
