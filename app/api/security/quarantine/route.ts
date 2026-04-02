/**
 * GET  /api/security/quarantine       — List quarantined IPs
 * POST /api/security/quarantine       — Add IP to quarantine
 * DELETE /api/security/quarantine     — Release (unban) an IP
 */

import { NextRequest, NextResponse } from 'next/server';
import { FortiGateService } from '@/lib/integrations/fortigate';
import { prisma } from '@/lib/prisma';

async function getFortiGateService() {
  const config = await prisma.integrationConfig.findFirst({
    where: { type: 'FORTIGATE', enabled: true },
  });

  if (!config) return null;

  const c = config.config as {
    host: string;
    username?: string;
    password?: string;
    accessToken: string;
    pollingInterval: number;
    syncMode: 'snmp' | 'rest' | 'both';
    enabledModules: {
      interfaces: boolean;
      vlans: boolean;
      policies: boolean;
      addresses: boolean;
      vips: boolean;
      sdwan: boolean;
    };
  };

  return new FortiGateService({
    host: c.host,
    username: c.username,
    password: c.password,
    accessToken: c.accessToken,
    pollingInterval: c.pollingInterval || 60,
    syncMode: c.syncMode || 'rest',
    enabledModules: c.enabledModules || {
      interfaces: false,
      vlans: false,
      policies: false,
      addresses: false,
      vips: false,
      sdwan: false,
    },
  });
}

export async function GET() {
  try {
    const service = await getFortiGateService();
    if (!service) {
      return NextResponse.json({
        success: false,
        error: 'FortiGate integration not configured',
        data: [],
      });
    }

    const quarantined = await service.fetchQuarantinedIPs();

    return NextResponse.json({
      success: true,
      data: quarantined,
      count: quarantined.length,
    });
  } catch (error) {
    console.error('Quarantine GET error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message, data: [] },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ip, expiry_hours, comment } = body;

    if (!ip) {
      return NextResponse.json(
        { success: false, error: 'IP address is required' },
        { status: 400 }
      );
    }

    const service = await getFortiGateService();
    if (!service) {
      return NextResponse.json({
        success: false,
        error: 'FortiGate integration not configured',
      });
    }

    const expiry_seconds = expiry_hours ? expiry_hours * 3600 : undefined;
    const ok = await service.addToQuarantine(ip, expiry_seconds, comment);

    return NextResponse.json({
      success: ok,
      message: ok ? `${ip} karantinaya alındı` : `${ip} karantinaya alınamadı`,
    });
  } catch (error) {
    console.error('Quarantine POST error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ip = searchParams.get('ip');

    if (!ip) {
      return NextResponse.json(
        { success: false, error: 'IP parameter required' },
        { status: 400 }
      );
    }

    const service = await getFortiGateService();
    if (!service) {
      return NextResponse.json({
        success: false,
        error: 'FortiGate integration not configured',
      });
    }

    const ok = await service.releaseQuarantinedIP(ip);

    return NextResponse.json({
      success: ok,
      message: ok ? `${ip} karantinadan çıkarıldı` : `${ip} karantinadan çıkarılamadı`,
    });
  } catch (error) {
    console.error('Quarantine DELETE error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
