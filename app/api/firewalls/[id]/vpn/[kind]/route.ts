import { NextRequest, NextResponse } from 'next/server';
import {
  executeFirewallRestRead,
  FirewallReadTargetError,
} from '@/lib/firewall/read-service';
import { firewallListQueryFromUrl, paginateFirewallItems } from '@/lib/firewall/read-query';

type RouteContext = { params: { id: string; kind: string } };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const query = firewallListQueryFromUrl(request.url, params.kind === 'ipsec' ? ['status'] : []);
    const result = params.kind === 'ssl-sessions'
      ? await executeFirewallRestRead({
          connectorId: params.id,
          read: async (service) => paginateFirewallItems({
            items: await service.getSSLVPNUsers(),
            query,
            searchText: (item) => `${item.user_name} ${item.remote_host} ${item.aip} ${item.interface}`,
          }),
        })
      : params.kind === 'ipsec'
        ? await executeFirewallRestRead({
            connectorId: params.id,
            read: async (service) => paginateFirewallItems({
              items: await service.getIPsecTunnels(),
              query,
              searchText: (item) => `${item.name} ${item.comments} ${item.username} ${item.rgwy}`,
              filter: (item, filters) => !filters.status || item.status.toLowerCase() === filters.status,
            }),
          })
        : null;
    if (!result) {
      return NextResponse.json({ success: false, error: 'Firewall VPN resource not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, target: result.target, ...result.envelope });
  } catch (error) {
    if (error instanceof FirewallReadTargetError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Firewall VPN resource read failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to read firewall VPN resource' }, { status: 500 });
  }
}
