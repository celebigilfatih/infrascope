import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest) {
  try {
    const services = await prisma.service.findMany({
      include: {
        device: {
          include: {
            rack: {
              include: {
                room: {
                  include: {
                    floor: {
                      include: {
                        building: true
                      }
                    }
                  }
                }
              }
            }
          }
        },
        application: true,
        dependencies: {
          include: {
            targetDevice: true
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      data: services,
      timestamp: new Date()
    });
  } catch (error: any) {
    console.error('Error fetching services:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch services',
      timestamp: new Date()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      name, type, displayName, description, status, 
      port, protocol, deviceId, applicationId, criticality 
    } = body;

    if (!name || !type || !port || !deviceId) {
      return NextResponse.json({
        success: false,
        error: 'Name, type, port and deviceId are required',
        timestamp: new Date()
      }, { status: 400 });
    }

    const service = await prisma.service.create({
      data: {
        name,
        type,
        displayName,
        description,
        status: status || 'UNKNOWN',
        port: parseInt(port),
        protocol: protocol || 'TCP',
        deviceId,
        applicationId,
        criticality: criticality || 'MEDIUM'
      }
    });

    return NextResponse.json({
      success: true,
      data: service,
      timestamp: new Date()
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating service:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create service',
      timestamp: new Date()
    }, { status: 500 });
  }
}
