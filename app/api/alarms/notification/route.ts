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

const MASKED_PASSWORD = '********';

function maskEmailConfig(config: Record<string, unknown>) {
  return {
    smtpHost: typeof config.smtpHost === 'string' ? config.smtpHost : '',
    smtpPort: typeof config.smtpPort === 'number' ? config.smtpPort : 587,
    smtpUser: typeof config.smtpUser === 'string' ? config.smtpUser : '',
    smtpPass: config.smtpPass ? MASKED_PASSWORD : '',
    smtpSecure: Boolean(config.smtpSecure),
    recipients: Array.isArray(config.recipients) ? config.recipients : [],
  };
}

export async function GET() {
  try {
    const config = await prisma.notificationConfig.findUnique({
      where: { channel: 'email' },
    });

    if (!config) {
      return NextResponse.json({
        success: true,
        data: {
          channel: 'email',
          enabled: false,
          config: {
            smtpHost: '',
            smtpPort: 587,
            smtpUser: '',
            smtpPass: '',
            smtpSecure: false,
            recipients: [],
          },
          isConfigured: false,
        },
      });
    }

    const cfgData = config.config as Record<string, unknown>;

    return NextResponse.json({
      success: true,
      data: {
        id: config.id,
        channel: config.channel,
        enabled: config.enabled,
        config: maskEmailConfig(cfgData),
        isConfigured: Boolean(cfgData.smtpHost && cfgData.smtpUser && cfgData.smtpPass && Array.isArray(cfgData.recipients) && cfgData.recipients.length > 0),
      },
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
    const { enabled, smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure, recipients } = parsed.data;

    const existing = await prisma.notificationConfig.findUnique({ where: { channel: 'email' } });
    const existingConfig = (existing?.config as Record<string, unknown>) || {};
    const resolvedPassword = (smtpPass && smtpPass !== MASKED_PASSWORD) ? smtpPass : String(existingConfig.smtpPass || '');

    if (!resolvedPassword) {
      return NextResponse.json({ success: false, error: 'SMTP password is required' }, { status: 400 });
    }

    const newConfig = {
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass: resolvedPassword,
      smtpSecure: smtpSecure ?? false,
      recipients,
    };

    const result = await prisma.notificationConfig.upsert({
      where: { channel: 'email' },
      create: {
        channel: 'email',
        enabled: enabled !== false,
        config: newConfig,
      },
      update: {
        enabled: enabled !== undefined ? enabled : existing?.enabled ?? true,
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
    const config = await prisma.notificationConfig.findUnique({ where: { channel: 'email' } });
    if (!config) {
      return NextResponse.json({ success: false, error: 'Email notification config is not saved yet' }, { status: 400 });
    }
    if (!config.enabled) {
      return NextResponse.json({ success: false, error: 'Email notifications are disabled' }, { status: 400 });
    }

    const result = await sendTestEmail();
    return NextResponse.json(
      { success: result.success, error: result.error },
      { status: result.success ? 200 : 400 }
    );
  } catch (error) {
    console.error('[NotifConfig] POST test error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
