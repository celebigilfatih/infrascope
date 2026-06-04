/**
 * GET  /api/alarms/notification - Get notification config
 * PUT  /api/alarms/notification - Update notification config
 * POST /api/alarms/notification - Send test email
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendTestEmail } from '@/lib/notifications/email';
import { validateBody } from '@/lib/validators';
import { notificationConfigSchema } from '@/lib/validators/alarms';

export async function GET() {
  try {
    const config = await prisma.notificationConfig.findUnique({
      where: { channel: 'email' },
    });

    if (!config) {
      // Return defaults (without password)
      return NextResponse.json({
        success: true,
        data: {
          channel: 'email',
          enabled: true,
          config: {
            smtpHost: 'mail.webmahsul.com.tr',
            smtpPort: 587,
            smtpUser: 'alert@webmahsul.com.tr',
            smtpPass: '********',
            smtpSecure: false,
            recipients: ['alert@webmahsul.com.tr'],
          },
          isDefault: true,
        },
      });
    }

    // Mask password in response
    const cfgData = config.config as Record<string, unknown>;
    const masked = { ...cfgData, smtpPass: '********' };

    return NextResponse.json({
      success: true,
      data: { ...config, config: masked, isDefault: false },
    });
  } catch (error) {
    console.error('[NotifConfig] GET error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const parsed = validateBody(rawBody, notificationConfigSchema);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const { smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure, recipients } = parsed.data;
    const enabled = (rawBody as Record<string, unknown>).enabled as boolean | undefined;

    // Build config object, preserving existing password if not provided
    const existing = await prisma.notificationConfig.findUnique({ where: { channel: 'email' } });
    const existingConfig = (existing?.config as Record<string, unknown>) || {};

    const newConfig = {
      smtpHost: smtpHost || existingConfig.smtpHost || '',
      smtpPort: smtpPort || existingConfig.smtpPort || 587,
      smtpUser: smtpUser || existingConfig.smtpUser || '',
      smtpPass: (smtpPass && smtpPass !== '********') ? smtpPass : existingConfig.smtpPass || '',
      smtpSecure: smtpSecure !== undefined ? smtpSecure : existingConfig.smtpSecure || false,
      recipients: recipients || existingConfig.recipients || [],
    };

    const result = await prisma.notificationConfig.upsert({
      where: { channel: 'email' },
      create: {
        channel: 'email',
        enabled: enabled !== false,
        config: newConfig,
      },
      update: {
        enabled: enabled !== undefined ? enabled : undefined,
        config: newConfig,
      },
    });

    return NextResponse.json({ success: true, data: { id: result.id, channel: result.channel, enabled: result.enabled } });
  } catch (error) {
    console.error('[NotifConfig] PUT error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = await sendTestEmail();
    return NextResponse.json({ success: result.success, error: result.error });
  } catch (error) {
    console.error('[NotifConfig] POST test error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
