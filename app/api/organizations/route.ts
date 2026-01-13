import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest) {
  try {
    const organizations = await prisma.organization.findMany({
      include: {
        buildings: {
          include: {
            floors: {
              include: {
                rooms: {
                  include: {
                    racks: true
                  }
                }
              }
            }
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      data: organizations,
      timestamp: new Date()
    });
  } catch (error: any) {
    console.error('Error fetching organizations:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch organizations',
      timestamp: new Date()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, code, description } = body;

    if (!name || !code) {
      return NextResponse.json({
        success: false,
        error: 'Name and code are required',
        timestamp: new Date()
      }, { status: 400 });
    }

    const organization = await prisma.organization.create({
      data: {
        name,
        code,
        description
      }
    });

    return NextResponse.json({
      success: true,
      data: organization,
      timestamp: new Date()
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating organization:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create organization',
      timestamp: new Date()
    }, { status: 500 });
  }
}
