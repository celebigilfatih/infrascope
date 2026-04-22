import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/alarms/suppression
 * Get suppression engine stats and rules
 */
export async function GET() {
  try {
    const engine = (globalThis as any).__detectionEngine;
    if (!engine) {
      return NextResponse.json({ 
        success: false, 
        error: 'Detection engine not initialized' 
      }, { status: 503 });
    }

    const stats = engine.getSuppressionStats();
    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error('[Suppression API] GET error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch suppression stats' 
    }, { status: 500 });
  }
}

/**
 * PATCH /api/alarms/suppression
 * Enable/disable a suppression rule
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { ruleId, enabled } = body;

    if (!ruleId || typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing required fields: ruleId, enabled' },
        { status: 400 }
      );
    }

    const engine = (globalThis as any).__detectionEngine;
    if (!engine) {
      return NextResponse.json({ 
        success: false, 
        error: 'Detection engine not initialized' 
      }, { status: 503 });
    }

    const success = engine.getSuppressionEngine().setRuleEnabled(ruleId, enabled);
    if (!success) {
      return NextResponse.json(
        { error: `Rule '${ruleId}' not found` },
        { status: 404 }
      );
    }

    const stats = engine.getSuppressionStats();
    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error('[Suppression API] PATCH error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to update suppression rule' 
    }, { status: 500 });
  }
}
