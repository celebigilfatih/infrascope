import { NextRequest, NextResponse } from 'next/server';
import { getRequestActor } from '@/lib/auth/request-actor';
import {
  correlateFirewallConnectorWithAnalyzer,
  FirewallAnalyzerCorrelationError,
} from '@/lib/firewall/fortianalyzer-correlation';

type RouteContext = { params: { id: string } };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Admin role required' }, { status: 403 });
    }
    let body: { analyzerConfigId?: string } = {};
    try {
      body = await request.json() as { analyzerConfigId?: string };
    } catch {
      // Empty request bodies use the single configured FortiAnalyzer target.
    }
    const analyzerConfigId = typeof body.analyzerConfigId === 'string'
      ? body.analyzerConfigId.trim() || undefined
      : undefined;
    const result = await correlateFirewallConnectorWithAnalyzer({
      connectorId: params.id,
      analyzerConfigId,
      actor: auth.actor,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof FirewallAnalyzerCorrelationError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error('FortiAnalyzer identity correlation failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to correlate FortiAnalyzer identity' },
      { status: 500 }
    );
  }
}
