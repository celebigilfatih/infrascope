import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest) {
  try {
    const connections = await prisma.buildingConnection.findMany({
      include: {
        sourceBuilding: true,
        destBuilding: true
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        items: connections,
        total: connections.length
      },
      timestamp: new Date()
    });
  } catch (error: any) {
    console.error('Error fetching building connections:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch building connections',
      timestamp: new Date()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      name, connectionType, sourceBuildingId, destBuildingId, 
      status, bandwidth, distance, fiberType, notes 
    } = body;

    if (!connectionType || !sourceBuildingId || !destBuildingId) {
      return NextResponse.json({
        success: false,
        error: 'connectionType, sourceBuildingId and destBuildingId are required',
        timestamp: new Date()
      }, { status: 400 });
    }

    const connection = await prisma.buildingConnection.create({
      data: {
        name,
        connectionType,
        sourceBuildingId,
        destBuildingId,
        status: status || 'ACTIVE',
        bandwidth,
        distance: distance ? parseFloat(distance) : null,
        fiberType,
        notes,
        recordingMethod: 'MANUAL'
      }
    });

    return NextResponse.json({
      success: true,
      data: connection,
      timestamp: new Date()
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating building connection:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create building connection',
      timestamp: new Date()
    }, { status: 500 });
  }
}
