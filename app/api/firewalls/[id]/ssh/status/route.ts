import { NextRequest, NextResponse } from 'next/server';
import { FirewallReadTargetError } from '@/lib/firewall/read-service';
import { readFirewallSshStatus } from '@/lib/firewall/ssh-read';

type RouteContext = { params: { id: string } };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const result = await readFirewallSshStatus(params.id);
    return NextResponse.json({ success: true, target: result.target, ...result.envelope });
  } catch (error) {
    if (error instanceof FirewallReadTargetError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Firewall SSH status read failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to read firewall SSH status' }, { status: 500 });
  }
}
