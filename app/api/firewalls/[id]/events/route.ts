import { authorizeApiRequest } from '@/lib/auth/api-permission';
import { NextRequest, NextResponse } from 'next/server';
import {
  readFirewallAnalyzerEvents,
  type FirewallEventCategory,
} from '@/lib/firewall/fortianalyzer-events';
import { FirewallAnalyzerCorrelationError } from '@/lib/firewall/fortianalyzer-correlation';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };
const CATEGORIES = new Set<FirewallEventCategory>(['auth', 'security', 'config']);

export async function GET(request: NextRequest, props: RouteContext) {
  const params = await props.params;
  const access = await authorizeApiRequest(request, 'firewall', 'read');if (!access.allowed) return access.response;
  try {
    const categoryValue = new URL(request.url).searchParams.get('category') || 'auth';
    if (!CATEGORIES.has(categoryValue as FirewallEventCategory)) {
      return NextResponse.json({ success: false, error: 'Invalid firewall event category' }, { status: 400 });
    }
    const analyzerConfigId = new URL(request.url).searchParams.get('analyzerConfigId')?.trim() || undefined;
    const result = await readFirewallAnalyzerEvents({
      connectorId: params.id,
      category: categoryValue as FirewallEventCategory,
      requestUrl: request.url,
      analyzerConfigId,
    });
    return NextResponse.json({ success: true, target: result.target, ...result.envelope }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof FirewallAnalyzerCorrelationError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error('Firewall analyzer event API failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to read firewall events' }, { status: 500 });
  }
}
