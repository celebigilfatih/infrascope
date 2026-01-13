/**
 * Service Detail Endpoints
 * GET /api/services/[id] - Get service by ID
 * PUT /api/services/[id] - Update service
 * DELETE /api/services/[id] - Delete service
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Valid service types, statuses, protocols, and criticalities
const VALID_SERVICE_TYPES = [
  'WEB_SERVER', 'DATABASE', 'DNS', 'DHCP', 'LDAP', 'MONITORING',
  'BACKUP', 'FILE_SERVER', 'MAIL_SERVER', 'PROXY', 'VPN',
  'LOAD_BALANCER', 'STORAGE', 'CONTAINER_ORCHESTRATION', 'OTHER'
];

const VALID_SERVICE_STATUSES = [
  'RUNNING', 'STOPPED', 'DEGRADED', 'FAILED', 'UNKNOWN'
];

const VALID_PROTOCOLS = ['TCP', 'UDP', 'BOTH'];

const VALID_CRITICALITIES = [
  'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'
];

// ============================================================================
// GET - Get service by ID
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
          error: 'Service ID is required',
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    // Fetch service with all related data
    const service = await prisma.service.findUnique({
      where: { id },
      include: {
        device: {
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
          },
        },
        application: {
          select: {
            id: true,
            name: true,
            vendor: true,
            version: true,
            installPath: true,
          },
        },
        dependencies: {
          include: {
            targetDevice: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
            sourceService: {
              select: {
                id: true,
                name: true,
                type: true,
                port: true,
                protocol: true,
              },
            },
          },
        },
      },
    });

    if (!service) {
      return NextResponse.json(
        {
          success: false,
          error: 'Service not found',
          timestamp: new Date(),
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: service,
        timestamp: new Date(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching service:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch service',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// PUT - Update service
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
      displayName,
      description,
      status,
      port,
      protocol,
      applicationId,
      criticality,
      metadata,
    } = body;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Service ID is required',
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    // Validate at least one field is provided
    const hasUpdate = name !== undefined || type !== undefined || displayName !== undefined ||
      description !== undefined || status !== undefined || port !== undefined ||
      protocol !== undefined || applicationId !== undefined ||
      criticality !== undefined || metadata !== undefined;

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

    if (type !== undefined && !VALID_SERVICE_TYPES.includes(type)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid service type. Must be one of: ${VALID_SERVICE_TYPES.join(', ')}`,
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    if (status !== undefined && !VALID_SERVICE_STATUSES.includes(status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid status. Must be one of: ${VALID_SERVICE_STATUSES.join(', ')}`,
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

    if (port !== undefined) {
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return NextResponse.json(
          {
            success: false,
            error: 'Port must be an integer between 1 and 65535',
            timestamp: new Date(),
          },
          { status: 400 }
        );
      }
    }

    if (protocol !== undefined && !VALID_PROTOCOLS.includes(protocol)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid protocol. Must be one of: ${VALID_PROTOCOLS.join(', ')}`,
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    // Check service exists
    const existing = await prisma.service.findUnique({
      where: { id },
      include: {
        dependencies: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'Service not found',
          timestamp: new Date(),
        },
        { status: 404 }
      );
    }

    // If updating port or protocol, check for duplicates
    const newPort = port !== undefined ? port : existing.port;
    const newProtocol = protocol !== undefined ? protocol : existing.protocol;

    if ((port !== undefined || protocol !== undefined) &&
        (newPort !== existing.port || newProtocol !== existing.protocol)) {
      const duplicate = await prisma.service.findFirst({
        where: {
          deviceId: existing.deviceId,
          port: newPort,
          protocol: newProtocol,
          id: { not: id },
        },
      });

      if (duplicate) {
        return NextResponse.json(
          {
            success: false,
            error: `A service already exists on this device with port ${newPort}/${newProtocol}`,
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
    if (displayName !== undefined) updateData.displayName = displayName;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (port !== undefined) updateData.port = port;
    if (protocol !== undefined) updateData.protocol = protocol;
    if (applicationId !== undefined) updateData.applicationId = applicationId;
    if (criticality !== undefined) updateData.criticality = criticality;
    if (metadata !== undefined) updateData.metadata = metadata;

    // Update service
    const updated = await prisma.service.update({
      where: { id },
      data: updateData,
      include: {
        device: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
          },
        },
        application: {
          select: {
            id: true,
            name: true,
            vendor: true,
            version: true,
          },
        },
        dependencies: {
          select: {
            id: true,
            type: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: updated,
        message: 'Service updated successfully',
        timestamp: new Date(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating service:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update service',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE - Delete service
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
          error: 'Service ID is required',
          timestamp: new Date(),
        },
        { status: 400 }
      );
    }

    // Check service exists and get dependencies
    const existing = await prisma.service.findUnique({
      where: { id },
      include: {
        dependencies: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'Service not found',
          timestamp: new Date(),
        },
        { status: 404 }
      );
    }

    // Warn if service has dependencies
    if (existing.dependencies && existing.dependencies.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete service with ${existing.dependencies.length} dependency/dependencies. Remove dependencies first.`,
          timestamp: new Date(),
        },
        { status: 409 }
      );
    }

    // Delete service
    const deleted = await prisma.service.delete({
      where: { id },
    });

    return NextResponse.json(
      {
        success: true,
        data: deleted,
        message: 'Service deleted successfully',
        timestamp: new Date(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting service:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete service',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}
