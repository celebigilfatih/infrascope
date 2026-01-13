/**
 * Device Detail Endpoints
 * GET /api/devices/[id] - Get device by ID
 * PUT /api/devices/[id] - Update device
 * DELETE /api/devices/[id] - Delete device
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Valid device types, statuses, and criticalities
const VALID_DEVICE_TYPES = [
  'PHYSICAL_SERVER', 'VIRTUAL_HOST', 'VIRTUAL_MACHINE', 'FIREWALL',
  'SWITCH', 'ROUTER', 'COMPUTER', 'LAPTOP', 'STORAGE', 'PDU',
  'PATCH_PANEL', 'OTHER'
];

const VALID_DEVICE_STATUSES = [
  'ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED', 'UNKNOWN'
];

const VALID_CRITICALITIES = [
  'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'
];

// ============================================================================
// GET - Get device by ID
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
          error: 'Device ID is required',
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    // Fetch device with all related data
    const device = await prisma.device.findUnique({
      where: { id },
      include: {
        rack: {
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
          },
        },
        parentDevice: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
          },
        },
        childDevices: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
          },
          orderBy: {
            name: 'asc',
          },
        },
        networkInterfaces: {
          orderBy: {
            name: 'asc',
          },
        },
        services: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            port: true,
            protocol: true,
          },
          orderBy: {
            name: 'asc',
          },
        },
      },
    });

    if (!device) {
      return NextResponse.json(
        {
          success: false,
          error: 'Device not found',
          timestamp: new Date(),
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: device,
        timestamp: new Date(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching device:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch device',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// PUT - Update device
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
      vendor,
      model,
      serialNumber,
      assetTag,
      firmwareVersion,
      operatingSystem,
      criticality,
      status,
      rackId,
      rackUnitPosition,
      parentDeviceId,
      metadata,
    } = body;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Device ID is required',
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    // Validate at least one field is provided
    const hasUpdate = name !== undefined || type !== undefined || vendor !== undefined ||
      model !== undefined || serialNumber !== undefined || assetTag !== undefined ||
      firmwareVersion !== undefined || operatingSystem !== undefined ||
      criticality !== undefined || status !== undefined || rackId !== undefined ||
      rackUnitPosition !== undefined || parentDeviceId !== undefined || metadata !== undefined;

    if (!hasUpdate) {
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

    if (type !== undefined && !VALID_DEVICE_TYPES.includes(type)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid device type. Must be one of: ${VALID_DEVICE_TYPES.join(', ')}`,
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    if (status !== undefined && !VALID_DEVICE_STATUSES.includes(status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid status. Must be one of: ${VALID_DEVICE_STATUSES.join(', ')}`,
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    if (criticality !== undefined && !VALID_CRITICALITIES.includes(criticality)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid criticality. Must be one of: ${VALID_CRITICALITIES.join(', ')}`,
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    if (rackUnitPosition !== undefined && rackUnitPosition !== null) {
      if (!Number.isInteger(rackUnitPosition) || rackUnitPosition < 1 || rackUnitPosition > 100) {
        return NextResponse.json(
          {
            success: false,
            error: 'rackUnitPosition must be an integer between 1 and 100',
            timestamp: new Date(),
          },
          { status: 400 }
        );
      }
    }

    // Check device exists
    const existing = await prisma.device.findUnique({
      where: { id },
      include: {
        childDevices: true,
        services: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'Device not found',
          timestamp: new Date(),
        },
        { status: 404 }
      );
    }

    // If updating rackId, verify rack exists and validate position
    if (rackId !== undefined && rackId !== null) {
      const rack = await prisma.rack.findUnique({
        where: { id: rackId },
      });

      if (!rack) {
        return NextResponse.json(
          {
            success: false,
            error: `Rack with ID ${rackId} not found`,
            timestamp: new Date(),
          },
          { status: 404 }
        );
      }

      const position = rackUnitPosition !== undefined ? rackUnitPosition : existing.rackUnitPosition;
      if (position && position > rack.maxUnits) {
        return NextResponse.json(
          {
            success: false,
            error: `rackUnitPosition (${position}) exceeds rack maxUnits (${rack.maxUnits})`,
            timestamp: new Date(),
          },
          { status: 400 }
        );
      }
    }

    // If updating parentDeviceId, verify parent exists and validate relationship
    if (parentDeviceId !== undefined && parentDeviceId !== null) {
      if (parentDeviceId === id) {
        return NextResponse.json(
          {
            success: false,
            error: 'Device cannot be its own parent',
            timestamp: new Date(),
          },
          { status: 400 }
        );
      }

      const parent = await prisma.device.findUnique({
        where: { id: parentDeviceId },
      });

      if (!parent) {
        return NextResponse.json(
          {
            success: false,
            error: `Parent device with ID ${parentDeviceId} not found`,
            timestamp: new Date(),
          },
          { status: 404 }
        );
      }

      const deviceType = type || existing.type;
      if (deviceType === 'VIRTUAL_MACHINE' && parent.type !== 'VIRTUAL_HOST' && parent.type !== 'PHYSICAL_SERVER') {
        return NextResponse.json(
          {
            success: false,
            error: 'Virtual machines must have a VIRTUAL_HOST or PHYSICAL_SERVER as parent',
            timestamp: new Date(),
          },
          { status: 400 }
        );
      }
    }

    // Build update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (vendor !== undefined) updateData.vendor = vendor;
    if (model !== undefined) updateData.model = model;
    if (serialNumber !== undefined) updateData.serialNumber = serialNumber;
    if (assetTag !== undefined) updateData.assetTag = assetTag;
    if (firmwareVersion !== undefined) updateData.firmwareVersion = firmwareVersion;
    if (operatingSystem !== undefined) updateData.operatingSystem = operatingSystem;
    if (criticality !== undefined) updateData.criticality = criticality;
    if (status !== undefined) updateData.status = status;
    if (rackId !== undefined) updateData.rackId = rackId;
    if (rackUnitPosition !== undefined) updateData.rackUnitPosition = rackUnitPosition;
    if (parentDeviceId !== undefined) updateData.parentDeviceId = parentDeviceId;
    if (metadata !== undefined) updateData.metadata = metadata;

    // Update device
    const updated = await prisma.device.update({
      where: { id },
      data: updateData,
      include: {
        rack: {
          select: {
            id: true,
            name: true,
            roomId: true,
          },
        },
        parentDevice: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        childDevices: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        networkInterfaces: true,
        services: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: updated,
        message: 'Device updated successfully',
        timestamp: new Date(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating device:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update device',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE - Delete device
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
          error: 'Device ID is required',
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    // Check device exists and get dependencies
    const existing = await prisma.device.findUnique({
      where: { id },
      include: {
        childDevices: true,
        services: true,
        networkInterfaces: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'Device not found',
          timestamp: new Date(),
        },
        { status: 404 }
      );
    }

    // Prevent deletion if device has child devices (e.g., VMs)
    if (existing.childDevices && existing.childDevices.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete device with ${existing.childDevices.length} child device(s). Remove child devices first.`,
          timestamp: new Date(),
        },
        { status: 409 }
      );
    }

    // Prevent deletion if device has services
    if (existing.services && existing.services.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete device with ${existing.services.length} service(s). Remove services first.`,
          timestamp: new Date(),
        },
        { status: 409 }
      );
    }

    // Delete device (cascade will handle network interfaces)
    const deleted = await prisma.device.delete({
      where: { id },
    });

    return NextResponse.json(
      {
        success: true,
        data: deleted,
        message: 'Device deleted successfully',
        timestamp: new Date(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting device:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete device',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}
