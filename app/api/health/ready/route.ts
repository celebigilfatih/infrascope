/**
 * GET /api/health/ready
 *
 * Lightweight container readiness check.
 * This endpoint intentionally checks only the application process and database
 * connectivity. Integration/alarm health belongs to /api/health and
 * /api/health/alarms, but those can be degraded before a customer configures
 * FortiAnalyzer, VMware, NMS, or email.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
      checks: {
        app: 'ready',
        database: 'ready',
      },
      responseTimeMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        checks: {
          app: 'ready',
          database: 'not_ready',
        },
        error: (error as Error).message,
        responseTimeMs: Date.now() - startedAt,
      },
      { status: 503 }
    );
  }
}
