import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, status, contactEmail, address } = body;

    const organization = await prisma.organization.update({
      where: { id },
      data: {
        name,
        description,
        status,
        contactEmail,
        address,
      },
    });

    return NextResponse.json({
      success: true,
      data: organization,
      timestamp: new Date(),
    });
  } catch (error: any) {
    console.error('Error updating organization:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to update organization',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.organization.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Organization deleted successfully',
      timestamp: new Date(),
    });
  } catch (error: any) {
    console.error('Error deleting organization:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to delete organization',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}
