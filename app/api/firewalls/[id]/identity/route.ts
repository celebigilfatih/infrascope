import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import {
  protectIntegrationConfig,
  unprotectIntegrationConfig,
} from '@/lib/security/integration-credentials';
import { clearFortiGateConnectors } from '@/lib/firewall/connector-factory';
import type { FortiGateConfig } from '@/lib/integrations/fortigate';

type RouteContext = { params: { id: string } };
type IdentityAction = 'keep-current' | 'accept-candidate' | 'merge-into-existing';

async function requireAdmin(request: NextRequest) {
  const auth = await getRequestActor(request);
  if (!auth) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  if (auth.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'Admin role required' }, { status: 403 });
  }
  return auth.actor;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const actor = await requireAdmin(request);
    if (actor instanceof NextResponse) return actor;
    let body: { action?: IdentityAction };
    try {
      body = await request.json() as { action?: IdentityAction };
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!['keep-current', 'accept-candidate', 'merge-into-existing'].includes(body.action || '')) {
      return NextResponse.json({ success: false, error: 'Invalid identity action' }, { status: 400 });
    }
  const connector = await prisma.firewallConnector.findUnique({
    where: { id: params.id },
    include: { integrationConfig: true, device: true },
  });
  if (!connector) {
    return NextResponse.json({ success: false, error: 'Firewall connector not found' }, { status: 404 });
  }
  if (connector.identityStatus !== 'CONFLICT' || !connector.identityCandidateKey) {
    return NextResponse.json({ success: false, error: 'Firewall connector has no identity conflict' }, { status: 409 });
  }

  if (body.action === 'keep-current') {
    if (!connector.identityKey) {
      return NextResponse.json({ success: false, error: 'There is no verified identity to keep' }, { status: 409 });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.firewallConnector.update({
        where: { id: connector.id },
        data: {
          identityStatus: 'VERIFIED',
          identityCandidateKey: null,
          identityConflictWithId: null,
        },
      });
      await tx.auditLog.create({
        data: {
          entity: 'FirewallConnector',
          entityId: connector.id,
          action: 'firewall.identity.keep-current',
          resource: 'firewall',
          resourceId: connector.id,
          userId: actor.id,
          details: { identityKey: connector.identityKey, rejectedCandidate: connector.identityCandidateKey },
        },
      });
      return result;
    });
    return NextResponse.json({ success: true, data: updated });
  }

  if (body.action === 'accept-candidate') {
    const owner = await prisma.firewallConnector.findUnique({
      where: { identityKey: connector.identityCandidateKey },
      select: { id: true },
    });
    if (owner && owner.id !== connector.id) {
      return NextResponse.json(
        { success: false, error: 'Candidate identity belongs to another connector; merge review is required', code: 'MERGE_REQUIRED', conflictWithId: owner.id },
        { status: 409 }
      );
    }
    const serialNumber = connector.identityCandidateKey.split('::')[0];
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.firewallConnector.update({
        where: { id: connector.id },
        data: {
          serialNumber,
          identityKey: connector.identityCandidateKey,
          identityStatus: 'VERIFIED',
          identityCandidateKey: null,
          identityConflictWithId: null,
        },
      });
      await tx.device.update({ where: { id: connector.deviceId }, data: { serialNumber } });
      await tx.auditLog.create({
        data: {
          entity: 'FirewallConnector',
          entityId: connector.id,
          action: 'firewall.identity.accept-candidate',
          resource: 'firewall',
          resourceId: connector.id,
          userId: actor.id,
          details: { previousIdentity: connector.identityKey, acceptedIdentity: connector.identityCandidateKey },
        },
      });
      return result;
    });
    return NextResponse.json({ success: true, data: updated });
  }

  if (body.action === 'merge-into-existing') {
    if (!connector.identityConflictWithId) {
      return NextResponse.json({ success: false, error: 'No existing connector owns the candidate identity' }, { status: 409 });
    }
    const target = await prisma.firewallConnector.findUnique({
      where: { id: connector.identityConflictWithId },
      include: { integrationConfig: true, device: true },
    });
    if (!target || target.identityKey !== connector.identityCandidateKey || target.vdom !== connector.vdom) {
      return NextResponse.json({ success: false, error: 'Identity conflict target is no longer valid' }, { status: 409 });
    }
    const sourceConfig = unprotectIntegrationConfig<FortiGateConfig>(connector.integrationConfig.config, 'FORTIGATE');
    const targetConfig = unprotectIntegrationConfig<FortiGateConfig>(target.integrationConfig.config, 'FORTIGATE');
    const protectedConfig = protectIntegrationConfig<Record<string, unknown>>({
      ...targetConfig,
      host: connector.managementHost,
      username: sourceConfig.username || targetConfig.username,
      password: sourceConfig.password || targetConfig.password || '',
      accessToken: sourceConfig.accessToken || targetConfig.accessToken || '',
      deviceId: target.deviceId,
      vdom: target.vdom,
    }, 'FORTIGATE');
    await prisma.$transaction(async (tx) => {
      await tx.integrationConfig.update({
        where: { id: target.integrationConfigId },
        data: { config: protectedConfig as any, lastSyncStatus: 'pending-probe' },
      });
      await tx.firewallConnector.update({
        where: { id: target.id },
        data: {
          managementHost: connector.managementHost,
          identityStatus: 'VERIFIED',
          identityCandidateKey: null,
          identityConflictWithId: null,
        },
      });
      await tx.device.update({
        where: { id: target.deviceId },
        data: { managementIp: connector.managementHost, status: connector.device.status },
      });
      await tx.auditLog.create({
        data: {
          entity: 'FirewallConnector',
          entityId: target.id,
          action: 'firewall.identity.merge',
          resource: 'firewall',
          resourceId: target.id,
          userId: actor.id,
          details: {
            sourceConnectorId: connector.id,
            sourceDeviceId: connector.deviceId,
            targetConnectorId: target.id,
            targetDeviceId: target.deviceId,
            identityKey: target.identityKey,
          },
        },
      });
      await tx.integrationConfig.delete({ where: { id: connector.integrationConfigId } });
      await tx.device.delete({ where: { id: connector.deviceId } });
    });
    await Promise.all([
      clearFortiGateConnectors(`${connector.integrationConfigId}:${connector.vdom}`),
      clearFortiGateConnectors(`${target.integrationConfigId}:${target.vdom}`),
    ]);
    return NextResponse.json({ success: true, data: { connectorId: target.id, deviceId: target.deviceId } });
  }

    return NextResponse.json({ success: false, error: 'Invalid identity action' }, { status: 400 });
  } catch (error) {
    console.error('Firewall identity review failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to review firewall identity' },
      { status: 500 }
    );
  }
}
