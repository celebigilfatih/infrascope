/**
 * GET  /api/security/quarantine       — List quarantined IPs
 * POST /api/security/quarantine       — Add IP to quarantine
 * DELETE /api/security/quarantine     — Release (unban) an IP
 */

import { NextRequest, NextResponse } from 'next/server';
import { authorizeLegacyFirewallWrite } from '@/lib/firewall/write-policy';
import {
  executeFirewallWriteWithAudit,
  FirewallWriteAuditError,
} from '@/lib/firewall/write-audit';
import {
  FortiGateConnectorError,
  fortiGateTargetSelectorFromUrl,
  getFortiGateConnector,
} from '@/lib/firewall/connector-factory';
import { firewallErrorPayload, FirewallIntegrationError } from '@/lib/firewall/errors';

function connectorErrorResponse(error: unknown, data: unknown[] = []) {
  if (error instanceof FirewallWriteAuditError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code, retryable: true, data },
      { status: error.status }
    );
  }
  if (error instanceof FortiGateConnectorError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code, data },
      { status: error.status }
    );
  }
  if (error instanceof FirewallIntegrationError) {
    const payload = firewallErrorPayload(error);
    return NextResponse.json(
      { success: false, error: payload.error, code: payload.code, retryable: payload.retryable, data },
      { status: payload.status }
    );
  }
  return null;
}

async function requireLegacyWriteAccess(request: NextRequest) {
  const decision = await authorizeLegacyFirewallWrite(request);
  if (decision.allowed) return decision;

  return NextResponse.json(
    {
      success: false,
      error: decision.message,
      code: decision.code,
    },
    { status: decision.status }
  );
}

async function getFortiGateContext(request: NextRequest) {
  return getFortiGateConnector(fortiGateTargetSelectorFromUrl(request.url));
}

function requestAuditContext(request: NextRequest) {
  return {
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
    userAgent: request.headers.get('user-agent') || undefined,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { service } = await getFortiGateContext(request);

    const quarantined = await service.fetchQuarantinedIPs();

    return NextResponse.json({
      success: true,
      data: quarantined,
      count: quarantined.length,
    });
  } catch (error) {
    console.error('Quarantine GET error:', error);
    const response = connectorErrorResponse(error);
    if (response) return response;
    return NextResponse.json(
      { success: false, error: (error as Error).message, data: [] },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireLegacyWriteAccess(request);
    if (access instanceof NextResponse) return access;

    const body = await request.json();
    const { ip, expiry_hours, comment } = body;

    if (!ip) {
      return NextResponse.json(
        { success: false, error: 'IP address is required' },
        { status: 400 }
      );
    }

    const { service, target } = await getFortiGateContext(request);

    const expiry_seconds = expiry_hours ? expiry_hours * 3600 : undefined;
    const { result: ok } = await executeFirewallWriteWithAudit(
      {
        action: 'firewall.quarantine.add',
        actorId: access.actor.id!,
        actorName: access.actor.name,
        targetKey: target.key,
        resourceId: ip,
        details: { expiryHours: expiry_hours ?? null, legacyWrite: true },
        ...requestAuditContext(request),
      },
      () => service.addToQuarantine(ip, expiry_seconds, comment)
    );

    return NextResponse.json({
      success: ok,
      message: ok ? `${ip} karantinaya alındı` : `${ip} karantinaya alınamadı`,
    });
  } catch (error) {
    console.error('Quarantine POST error:', error);
    const response = connectorErrorResponse(error);
    if (response) return response;
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const access = await requireLegacyWriteAccess(request);
    if (access instanceof NextResponse) return access;

    const { searchParams } = new URL(request.url);
    const ip = searchParams.get('ip');

    if (!ip) {
      return NextResponse.json(
        { success: false, error: 'IP parameter required' },
        { status: 400 }
      );
    }

    const { service, target } = await getFortiGateContext(request);
    const { result: ok } = await executeFirewallWriteWithAudit(
      {
        action: 'firewall.quarantine.remove',
        actorId: access.actor.id!,
        actorName: access.actor.name,
        targetKey: target.key,
        resourceId: ip,
        details: { legacyWrite: true },
        ...requestAuditContext(request),
      },
      () => service.releaseQuarantinedIP(ip)
    );

    return NextResponse.json({
      success: ok,
      message: ok ? `${ip} karantinadan çıkarıldı` : `${ip} karantinadan çıkarılamadı`,
    });
  } catch (error) {
    console.error('Quarantine DELETE error:', error);
    const response = connectorErrorResponse(error);
    if (response) return response;
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
