import { NextRequest, NextResponse } from 'next/server';
import { TopologyRelationshipEngine } from '@/lib/topology';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const organizationId = searchParams.get('organizationId') || undefined;
  const action = searchParams.get('action') || 'graph';

  const engine = new TopologyRelationshipEngine();

  try {
    if (action === 'graph') {
      const graph = await engine.getTopologyGraph(organizationId);
      return NextResponse.json(graph);
    } else if (action === 'stats') {
      const stats = await engine.getRelationshipStats();
      return NextResponse.json(stats);
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Topology API error:', error);
    return NextResponse.json(
      { error: 'Failed to process topology request' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  const engine = new TopologyRelationshipEngine();

  try {
    if (action === 'correlate') {
      const result = await engine.correlateAll();
      return NextResponse.json(result);
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Topology correlation error:', error);
    return NextResponse.json(
      { error: 'Failed to correlate relationships' },
      { status: 500 }
    );
  }
}
