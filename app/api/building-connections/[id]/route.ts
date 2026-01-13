import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const connection = await prisma.buildingConnection.findUnique({
      where: { id },
      include: {
        sourceBuilding: true,
        destBuilding: true
      }
    });

    if (!connection) {
      return NextResponse.json({
        success: false,
        error: 'Building connection not found',
        timestamp: new Date()
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: connection,
      timestamp: new Date()
    });
  } catch (error: any) {
    console.error('Error fetching building connection:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch building connection',
      timestamp: new Date()
    }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { 
      name, connectionType, sourceBuildingId, destBuildingId, 
      status, bandwidth, distance, fiberType, cableSpecs, provider, circuitId, notes 
    } = body;

    const connection = await prisma.buildingConnection.update({
      where: { id },
      data: {
        name,
        connectionType,
        sourceBuildingId,
        destBuildingId,
        status,
        bandwidth,
        distance: distance ? parseFloat(distance) : null,
        fiberType,
        cableSpecs,
        provider,
        circuitId,
        notes
      }
    });

    return NextResponse.json({
      success: true,
      data: connection,
      timestamp: new Date()
    });
  } catch (error: any) {
    console.error('Error updating building connection:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update building connection',
      timestamp: new Date()
    }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    await prisma.buildingConnection.delete({
      where: { id }
    });

    return NextResponse.json({
      success: true,
      message: 'Building connection deleted successfully',
      timestamp: new Date()
    });
  } catch (error: any) {
    console.error('Error deleting building connection:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete building connection',
      timestamp: new Date()
    }, { status: 500 });
  }
}
