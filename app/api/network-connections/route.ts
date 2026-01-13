import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest) {
  try {
    const connections = await prisma.connection.findMany({
      include: {
        sourcePort: {
          include: {
            switchDevice: true
          }
        },
        sourceInterface: {
          include: {
            device: true
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      data: connections,
      timestamp: new Date()
    });
  } catch (error: any) {
    console.error('Error fetching network connections:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch network connections',
      timestamp: new Date()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      name, type, sourcePortId, sourceInterfaceId, 
      destPortId, destInterfaceId, status 
    } = body;

    if (!sourcePortId && !sourceInterfaceId) {
      return NextResponse.json({
        success: false,
        error: 'sourcePortId or sourceInterfaceId is required',
        timestamp: new Date()
      }, { status: 400 });
    }

    const connection = await prisma.connection.create({
      data: {
        name,
        type: type || 'ETHERNET',
        sourcePortId,
        sourceInterfaceId,
        destPortId,
        destInterfaceId,
        status: status || 'DOWN'
      }
    });

    return NextResponse.json({
      success: true,
      data: connection,
      timestamp: new Date()
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating network connection:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create network connection',
      timestamp: new Date()
    }, { status: 500 });
  }
}
