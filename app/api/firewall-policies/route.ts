import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  FortiGateConnectorError,
  fortiGateTargetSelectorFromUrl,
  getFortiGateConnector,
  resolveFortiGateTarget,
} from '@/lib/firewall/connector-factory';
import { firewallErrorPayload, FirewallIntegrationError } from '@/lib/firewall/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const selector = fortiGateTargetSelectorFromUrl(request.url);
    const resolved = await resolveFortiGateTarget(selector);
    // First try to get from database
    const dbPolicies = await prisma.firewallPolicy.findMany({
      where: resolved.target.inventoryDeviceId
        ? { deviceId: resolved.target.inventoryDeviceId }
        : { id: { in: [] } },
      include: {
        device: {
          select: {
            id: true,
            name: true,
            fortiDeviceId: true,
          },
        },
      },
      orderBy: {
        hitCount: 'desc',
      },
    });

    if (dbPolicies.length > 0) {
      const serializedPolicies = dbPolicies.map((policy: typeof dbPolicies[number]) => ({
        ...policy,
        hitCount: policy.hitCount.toString(),
      }));
      return NextResponse.json({
        success: true,
        data: serializedPolicies,
        count: serializedPolicies.length,
        source: 'database',
      });
    }

    // If database is empty, fetch live from FortiGate API
    const { service, target } = await getFortiGateConnector(selector);

    const livePolicies = await service.fetchFirewallPolicies();

    const formattedPolicies = livePolicies.map((policy, index) => ({
      id: `live-${index}`,
      policyId: policy.policyid,
      name: policy.name || null,
      action: policy.action,
      srcInterface: policy.srcintf?.map((i: { name: string }) => i.name).join(', ') || null,
      dstInterface: policy.dstintf?.map((i: { name: string }) => i.name).join(', ') || null,
      srcAddresses: policy.srcaddr?.map((a: { name: string }) => a.name) || null,
      dstAddresses: policy.dstaddr?.map((a: { name: string }) => a.name) || null,
      services: policy.service?.map((s: { name: string }) => s.name) || null,
      schedule: policy.schedule || null,
      hitCount: String(policy.hit_count || 0),
      lastHit: policy.last_used || null,
      device: {
        name: 'FortiGate',
        fortiDeviceId: target.host,
      },
    }));

    return NextResponse.json({
      success: true,
      data: formattedPolicies,
      count: formattedPolicies.length,
      source: 'live',
    });
  } catch (error) {
    console.error('Error fetching firewall policies:', error);
    if (error instanceof FortiGateConnectorError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code, data: [], count: 0 },
        { status: error.status }
      );
    }
    if (error instanceof FirewallIntegrationError) {
      const payload = firewallErrorPayload(error);
      return NextResponse.json(
        {
          success: false,
          error: payload.error,
          code: payload.code,
          retryable: payload.retryable,
          data: [],
          count: 0,
        },
        { status: payload.status }
      );
    }
    return NextResponse.json(
      { success: false, error: (error as Error).message, data: [], count: 0 },
      { status: 500 }
    );
  }
}
