import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { FortiGateService } from '@/lib/integrations/fortigate';

export async function GET() {
  try {
    // First try to get from database
    const dbPolicies = await prisma.firewallPolicy.findMany({
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
    const config = await prisma.integrationConfig.findFirst({
      where: { type: 'FORTIGATE', enabled: true },
    });

    if (!config) {
      return NextResponse.json({
        success: false,
        error: 'FortiGate integration not configured',
        data: [],
        count: 0,
      });
    }

    const fortiConfig = config.config as {
      host: string;
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

    const service = new FortiGateService({
      host: fortiConfig.host,
      accessToken: fortiConfig.accessToken,
      pollingInterval: fortiConfig.pollingInterval,
      syncMode: fortiConfig.syncMode,
      enabledModules: { ...fortiConfig.enabledModules, policies: true },
    });

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
        fortiDeviceId: fortiConfig.host,
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
    return NextResponse.json(
      { success: false, error: (error as Error).message, data: [], count: 0 },
      { status: 500 }
    );
  }
}
