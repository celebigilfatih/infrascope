import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getRequestActor } from '@/lib/auth/request-actor';
import { clearFortiGateConnectors } from '@/lib/firewall/connector-factory';
import { inspectTrustedCaBundle, normalizeTrustedCaBundle } from '@/lib/firewall/tls-ca';
import { probeFirewallConnector } from '@/lib/firewall/probe';
import type { FortiGateConfig } from '@/lib/integrations/fortigate';
import { prisma } from '@/lib/prisma';
import { protectIntegrationConfig, unprotectIntegrationConfig } from '@/lib/security/integration-credentials';

type RouteContext = { params: { id: string } };

async function requireAdmin(request: NextRequest) {
  const auth = await getRequestActor(request);
  if (!auth) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  if (auth.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'Admin role required' }, { status: 403 });
  }
  return auth.actor;
}

async function loadConnector(id: string) {
  return prisma.firewallConnector.findUnique({
    where: { id },
    include: { integrationConfig: { select: { id: true, config: true } } },
  });
}

function publicCaStatus(config: FortiGateConfig) {
  if (!config.tlsCaPem) return { configured: false, updatedAt: null, summary: null };
  try {
    return {
      configured: true,
      updatedAt: config.tlsCaUpdatedAt || null,
      summary: inspectTrustedCaBundle(config.tlsCaPem),
    };
  } catch {
    // A legacy malformed value must never expose its contents to the browser.
    return { configured: true, updatedAt: config.tlsCaUpdatedAt || null, summary: null };
  }
}

async function refreshProbe(connectorId: string, targetKey: string) {
  await clearFortiGateConnectors(targetKey);
  return probeFirewallConnector(connectorId, { trigger: 'configuration' });
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const actor = await requireAdmin(request);
  if (actor instanceof NextResponse) return actor;

  const connector = await loadConnector(params.id);
  if (!connector) return NextResponse.json({ success: false, error: 'Firewall connector not found' }, { status: 404 });
  const config = unprotectIntegrationConfig<FortiGateConfig>(connector.integrationConfig.config, 'FORTIGATE');
  return NextResponse.json({ success: true, data: publicCaStatus(config) });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const actor = await requireAdmin(request);
    if (actor instanceof NextResponse) return actor;

    const formData = await request.formData();
    const uploaded = formData.get('certificate');
    if (!(uploaded instanceof File)) {
      return NextResponse.json({ success: false, error: 'Select a PEM or CRT CA certificate file.' }, { status: 400 });
    }
    if (uploaded.size === 0 || uploaded.size > 256 * 1024) {
      return NextResponse.json({ success: false, error: 'CA certificate file must be between 1 byte and 256 KB.' }, { status: 400 });
    }

    const text = Buffer.from(await uploaded.arrayBuffer()).toString('utf8');
    const { pem, summary } = normalizeTrustedCaBundle(text);
    const connector = await loadConnector(params.id);
    if (!connector) return NextResponse.json({ success: false, error: 'Firewall connector not found' }, { status: 404 });

    const current = unprotectIntegrationConfig<FortiGateConfig>(connector.integrationConfig.config, 'FORTIGATE');
    const updatedAt = new Date().toISOString();
    const protectedConfig = protectIntegrationConfig<Prisma.InputJsonValue>({
      ...current,
      tlsCaPem: pem,
      tlsCaUpdatedAt: updatedAt,
    }, 'FORTIGATE');

    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          entity: 'FirewallConnector',
          entityId: connector.id,
          action: 'firewall.tls-ca.configure',
          resource: 'firewall',
          resourceId: connector.id,
          userId: actor.id,
          details: {
            integrationConfigId: connector.integrationConfigId,
            certificateCount: summary.certificateCount,
            validUntil: summary.validUntil,
            fingerprint: summary.fingerprint,
          },
        },
      });
      await tx.integrationConfig.update({
        where: { id: connector.integrationConfigId },
        data: { config: protectedConfig, lastSyncStatus: 'pending-probe' },
      });
    });

    const probe = await refreshProbe(connector.id, `${connector.integrationConfigId}:${connector.vdom}`);
    return NextResponse.json({
      success: true,
      data: { ...publicCaStatus({ ...current, tlsCaPem: pem, tlsCaUpdatedAt: updatedAt }), probe: probe.status },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CA certificate could not be saved.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const actor = await requireAdmin(request);
    if (actor instanceof NextResponse) return actor;

    const connector = await loadConnector(params.id);
    if (!connector) return NextResponse.json({ success: false, error: 'Firewall connector not found' }, { status: 404 });
    const current = unprotectIntegrationConfig<FortiGateConfig>(connector.integrationConfig.config, 'FORTIGATE');
    if (!current.tlsCaPem) return NextResponse.json({ success: true, data: publicCaStatus(current) });

    const { tlsCaPem: _tlsCaPem, tlsCaUpdatedAt: _tlsCaUpdatedAt, ...withoutCa } = current;
    const protectedConfig = protectIntegrationConfig<Prisma.InputJsonValue>(withoutCa, 'FORTIGATE');
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          entity: 'FirewallConnector',
          entityId: connector.id,
          action: 'firewall.tls-ca.remove',
          resource: 'firewall',
          resourceId: connector.id,
          userId: actor.id,
          details: { integrationConfigId: connector.integrationConfigId },
        },
      });
      await tx.integrationConfig.update({
        where: { id: connector.integrationConfigId },
        data: { config: protectedConfig, lastSyncStatus: 'pending-probe' },
      });
    });

    const probe = await refreshProbe(connector.id, `${connector.integrationConfigId}:${connector.vdom}`);
    return NextResponse.json({ success: true, data: { ...publicCaStatus(withoutCa), probe: probe.status } });
  } catch (error) {
    console.error('Firewall trusted CA removal failed:', error);
    return NextResponse.json({ success: false, error: 'CA certificate could not be removed.' }, { status: 500 });
  }
}
