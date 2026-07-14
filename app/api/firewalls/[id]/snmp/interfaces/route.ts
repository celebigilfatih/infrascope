import { NextRequest, NextResponse } from 'next/server';
import { firewallListQueryFromUrl } from '@/lib/firewall/read-query';
import { FirewallReadTargetError } from '@/lib/firewall/read-service';
import { readFirewallSnmpInterfaces } from '@/lib/firewall/snmp-read';

type RouteContext = { params: { id: string } };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const result = await readFirewallSnmpInterfaces({
      connectorId: params.id,
      query: firewallListQueryFromUrl(request.url, ['link']),
    });
    return NextResponse.json({ success: true, target: result.target, ...result.envelope });
  } catch (error) {
    if (error instanceof FirewallReadTargetError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Firewall SNMP interface read failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to read firewall SNMP interfaces' }, { status: 500 });
  }
}
