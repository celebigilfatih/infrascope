/**
 * POST /api/alarms/definitions/seed - Seed alarm definitions into database
 */

import { NextResponse } from 'next/server';
import { seedAlarmDefinitions } from '@/lib/alarms/seed-alarms';

export async function POST() {
  try {
    const result = await seedAlarmDefinitions();
    
    return NextResponse.json({
      success: true,
      message: `Seeded ${result.created} new alarms, updated ${result.updated} existing alarms. Total: ${result.total}`,
      result,
    });
  } catch (error) {
    console.error('[SeedAPI] Error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
