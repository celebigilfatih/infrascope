import { authorizeApiRequest } from '@/lib/auth/api-permission';
import { NextRequest, NextResponse } from 'next/server';
import { FirewallReadTargetError } from '@/lib/firewall/read-service';
import { readFirewallSnmpHealth } from '@/lib/firewall/snmp-read';

export const dynamic = 'force-dynamic';

type RouteContext = { params: { id: string } };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const access = await authorizeApiRequest(request, 'firewall', 'read'); if (!access.allowed) return access.response;
  try {
    const result = await readFirewallSnmpHealth(params.id);
    return NextResponse.json({ success: true, target: result.target, ...result.envelope }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof FirewallReadTargetError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Firewall SNMP health read failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to read firewall SNMP health' }, { status: 500 });
  }
}
