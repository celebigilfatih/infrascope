import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/alarms/whitelist
 * Add an alarm to the whitelist to suppress future false positives
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { alarmCode, field, value, reason, createdBy, expiresAt } = body;

    // Validation
    if (!alarmCode || !field || !value || !createdBy) {
      return NextResponse.json(
        { error: 'Missing required fields: alarmCode, field, value, createdBy' },
        { status: 400 }
      );
    }

    // Valid fields
    const validFields = ['sourceIp', 'destIp', 'user', 'hostname'];
    if (!validFields.includes(field)) {
      return NextResponse.json(
        { error: `Invalid field. Must be one of: ${validFields.join(', ')}` },
        { status: 400 }
      );
    }

    // Check if already exists
    const existing = await prisma.alarmWhitelist.findUnique({
      where: {
        alarmCode_field_value: {
          alarmCode,
          field,
          value,
        },
      },
    });

    if (existing) {
      // Update existing
      const updated = await prisma.alarmWhitelist.update({
        where: { id: existing.id },
        data: {
          reason,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          enabled: true,
        },
      });
      return NextResponse.json({ success: true, data: updated, action: 'updated' });
    }

    // Create new
    const whitelist = await prisma.alarmWhitelist.create({
      data: {
        alarmCode,
        field,
        value,
        reason,
        createdBy,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        enabled: true,
      },
    });

    return NextResponse.json({ success: true, data: whitelist, action: 'created' });
  } catch (error) {
    console.error('[Whitelist API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to add to whitelist' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/alarms/whitelist
 * Get all active whitelist entries
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const alarmCode = searchParams.get('alarmCode');
    const includeDisabled = searchParams.get('includeDisabled') === 'true';

    const where: any = {
      enabled: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    };

    if (alarmCode) {
      where.alarmCode = alarmCode;
    }

    if (includeDisabled) {
      delete where.enabled;
    }

    const whitelist = await prisma.alarmWhitelist.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: whitelist });
  } catch (error) {
    console.error('[Whitelist API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch whitelist' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/alarms/whitelist
 * Remove a whitelist entry
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Missing whitelist ID' },
        { status: 400 }
      );
    }

    await prisma.alarmWhitelist.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Whitelist API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete whitelist entry' },
      { status: 500 }
    );
  }
}
