/**
 * GET /api/health
 * Health check endpoint
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest) {
  return NextResponse.json(
    {
      success: true,
      status: 'healthy',
      timestamp: new Date(),
      version: '1.0.0',
    },
    { status: 200 }
  );
}
