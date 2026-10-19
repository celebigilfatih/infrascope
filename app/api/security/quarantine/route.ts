/**
 * GET  /api/security/quarantine       — List quarantined IPs
 * POST /api/security/quarantine       — Add IP to quarantine
 * DELETE /api/security/quarantine     — Release (unban) an IP
 */

import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRequest } from '@/lib/auth/api-permission';
import { quarantineIpValid, quarantineWriteReason } from '@/lib/security/quarantine';
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
      { success: false, error: 'İşlem sonucu denetim kaydında doğrulanamadı. Listeyi yenileyip IP kaydını kontrol edin.', code: error.code, retryable: false, data },
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
      error: quarantineWriteReason(decision.code),
      code: decision.code,
    },
    { status: decision.status }
  );
}

async function getFortiGateContext(request: NextRequest) {
  const context = await getFortiGateConnector(fortiGateTargetSelectorFromUrl(request.url));
  const expectedHost = new URL(request.url).searchParams.get('expectedHost');
  if (expectedHost && expectedHost !== context.target.host) throw new FortiGateConnectorError('INVALID_CONFIG', 'Bağlantı adresi değişmiş. Cihaz listesini yenileyin.', 409);
  return context;
}

function requestAuditContext(request: NextRequest) {
  return {
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
    userAgent: request.headers.get('user-agent') || undefined,
  };
}

export async function GET(request: NextRequest) {
  try {
    const access = await authorizeApiRequest(request, 'firewall', 'read');
    if (!access.allowed) return access.response;
    const { service, target } = await getFortiGateContext(request);

    const quarantined = await service.fetchQuarantinedIPs();

    if (quarantined.some(row => row.vdom && row.vdom !== target.vdom)) throw new FirewallIntegrationError('INVALID_RESPONSE', 'Quarantine VDOM mismatch', false, 502);
    let writeAccess: { allowed: boolean; code?: string } = { allowed: false, code: 'unavailable' };
    try { const decision = await authorizeLegacyFirewallWrite(request); writeAccess = decision.allowed ? { allowed: true } : { allowed: false, code: decision.code }; } catch { /* Read availability is independent of write authorization. */ }
    return NextResponse.json({
      success: true,
      target: { configId: target.configId, vdom: target.vdom, host: target.host },
      source: 'fortigate-rest', collectedAt: new Date().toISOString(), writeAccess,
      data: quarantined,
      count: quarantined.length,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Quarantine GET error:', error);
    const response = connectorErrorResponse(error);
    if (response) return response;
    return NextResponse.json(
      { success: false, error: 'Karantina isteği tamamlanamadı.', data: [] },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireLegacyWriteAccess(request);
    if (access instanceof NextResponse) return access;

    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ success: false, error: 'Karantina isteği geçersiz.' }, { status: 400 });
    const { ip, expiry_hours, comment } = body;

    if (!quarantineIpValid(ip)) {
      return NextResponse.json(
        { success: false, error: 'Geçerli bir IPv4 veya IPv6 adresi girin.' },
        { status: 400 }
      );
    }

    if (expiry_hours !== undefined && (!Number.isSafeInteger(expiry_hours) || expiry_hours < 1 || expiry_hours > 8760) || comment !== undefined && (typeof comment !== 'string' || comment.length > 500)) return NextResponse.json({ success: false, error: 'Süre 1–8760 saat arasında tam sayı, açıklama en fazla 500 karakter olmalıdır.' }, { status: 400 });
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
      { success: false, error: 'Karantina isteği tamamlanamadı.' },
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

    if (!quarantineIpValid(ip)) {
      return NextResponse.json(
        { success: false, error: 'Geçerli bir IPv4 veya IPv6 adresi gerekir.' },
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
      { success: false, error: 'Karantina isteği tamamlanamadı.' },
      { status: 500 }
    );
  }
}
