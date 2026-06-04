import { NextRequest, NextResponse } from 'next/server';
import { TopologyRelationshipEngine } from '@/lib/topology';
import { validateBody } from '@/lib/validators';
import { topologyActionSchema } from '@/lib/validators/integrations';

const CACHE_HEADERS = { 'Cache-Control': 'private, max-age=30' };
const NO_CACHE_HEADERS = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const organizationId = searchParams.get('organizationId') || undefined;
  const action = searchParams.get('action') || 'graph';

  const engine = new TopologyRelationshipEngine();

  try {
    if (action === 'graph') {
      const graph = await engine.getTopologyGraph(organizationId);
      return NextResponse.json(graph, { headers: CACHE_HEADERS });
    } else if (action === 'stats') {
      const stats = await engine.getRelationshipStats();
      return NextResponse.json(stats, { headers: CACHE_HEADERS });
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400, headers: NO_CACHE_HEADERS });
    }
  } catch (error) {
    console.error('Topology API error:', error);
    return NextResponse.json(
      { error: 'Failed to process topology request' },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.json();
  const parsed = validateBody(rawBody, topologyActionSchema);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: NO_CACHE_HEADERS });
  }
  const { action } = parsed.data;

  const engine = new TopologyRelationshipEngine();

  try {
    if (action === 'correlate') {
      const result = await engine.correlateAll();
      return NextResponse.json(result, { headers: NO_CACHE_HEADERS });
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400, headers: NO_CACHE_HEADERS });
    }
  } catch (error) {
    console.error('Topology correlation error:', error);
    return NextResponse.json(
      { error: 'Failed to correlate relationships' },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
