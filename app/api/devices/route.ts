import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { deviceUnitHeight, mergeUnitHeight, placementIssue } from '@/lib/racks/device-placement';
import type { Prisma } from '@prisma/client';
import { inventoryQuery, InventoryQueryError } from '@/lib/devices/inventory-query';
import { checkDeviceLimit } from '@/lib/license/middleware';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, where } = inventoryQuery(searchParams);
    const offset = (page - 1) * limit;

    // 'minimal' mode returns only basic fields (no joins) - used by dashboard
    // 'full' mode (default) returns all nested relations - used by device detail pages
    const mode = searchParams.get('mode') || 'full';

    const selectMinimal = {
      id: true, name: true, type: true, vendor: true, model: true,
      serialNumber: true, assetTag: true, status: true, criticality: true,
      supportDate: true, rackUnitPosition: true, createdAt: true, updatedAt: true,
      rackId: true, nmsDeviceId: true, managementIp: true, pollingEnabled: true,
      pollingInterval: true, lastPolledAt: true,
    };

    const includeFull = {
      rack: {
        include: {
          room: {
            include: {
              floor: { include: { building: true } }
            }
          }
        }
      },
      networkInterfaces: true,
      services: true,
    };

    const [devices, total] = await Promise.all([
      mode === 'full'
        ? prisma.device.findMany({ where, skip: offset, take: limit, include: includeFull, orderBy: { name: 'asc' } })
        : prisma.device.findMany({ where, skip: offset, take: limit, select: { ...selectMinimal }, orderBy: { name: 'asc' } }),
      prisma.device.count({ where })
    ]);

    return NextResponse.json({
      success: true,
      data: devices,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      timestamp: new Date()
    });
  } catch (error) {
    if (error instanceof InventoryQueryError) return NextResponse.json({ success: false, error: (error as Error & { code?: string }).message }, { status: 400 });
    console.error('Error fetching devices details:', {
      message: (error as Error & { code?: string }).message,
      stack: (error as Error & { code?: string }).stack,
      code: (error as Error & { code?: string }).code
    });
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch devices',
      timestamp: new Date()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentDeviceCount = await prisma.device.count();
    const licenseError = await checkDeviceLimit(currentDeviceCount);
    if (licenseError) return licenseError;

    const body = await request.json();
    const { 
      name, type, vendor, model, serialNumber, assetTag, 
      criticality, status, rackId, rackUnitPosition, supportDate, unitHeight, metadata
    } = body;

    if (!name || !type) {
      return NextResponse.json({
        success: false,
        error: 'Name and type are required',
        timestamp: new Date()
      }, { status: 400 });
    }

    const parsedRackUnitPosition =
      rackUnitPosition !== undefined && rackUnitPosition !== null && rackUnitPosition !== ''
        ? Number(rackUnitPosition)
        : null;

    if (parsedRackUnitPosition !== null) {
      if (!Number.isInteger(parsedRackUnitPosition) || parsedRackUnitPosition < 1 || parsedRackUnitPosition > 100) {
        return NextResponse.json({
          success: false,
          error: 'rackUnitPosition must be an integer between 1 and 100',
          timestamp: new Date()
        }, { status: 400 });
      }
    }

    const effectiveRackId = rackId || null;
    const height = unitHeight === undefined ? deviceUnitHeight(metadata) : unitHeight;
    const rack = effectiveRackId ? await prisma.rack.findUnique({
      where: { id: effectiveRackId },
      select: { id: true, maxUnits: true, devices: { select: { id: true, name: true, rackUnitPosition: true, metadata: true } } },
    }) : null;
    const issue = placementIssue({ rackId: effectiveRackId, rack, start: parsedRackUnitPosition, height });
    if (issue) return NextResponse.json({ success: false, error: issue }, { status: 400 });
    let nextMetadata;
    try { nextMetadata = mergeUnitHeight(metadata, height); }
    catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Cihaz yüksekliği kaydedilemedi.' }, { status: 400 }); }

    const device = await prisma.device.create({
      data: {
        name,
        type,
        vendor,
        model,
        serialNumber,
        assetTag,
        criticality: criticality || 'MEDIUM',
        status: status || 'UNKNOWN',
        rackId: effectiveRackId,
        rackUnitPosition: parsedRackUnitPosition,
        metadata: nextMetadata as Prisma.InputJsonValue,
        supportDate: supportDate ? new Date(supportDate) : null
      }
    });

    return NextResponse.json({
      success: true,
      data: device,
      timestamp: new Date()
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating device:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create device',
      timestamp: new Date()
    }, { status: 500 });
  }
}
