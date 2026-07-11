import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface TrendRow {
  day: Date;
  severity: string;
  status: string;
  source: string;
  count: bigint;
  occurrences: bigint;
}

export async function GET(request: NextRequest) {
  try {
    const days = Math.min(Math.max(Number(request.nextUrl.searchParams.get('days') || 30), 1), 365);
    const from = new Date(Date.now() - days * 86_400_000);
    const rows = await prisma.$queryRaw<TrendRow[]>(Prisma.sql`
      SELECT
        date_trunc('day', "lastSeenAt") AS day,
        "severity"::text AS severity,
        "status"::text AS status,
        "source",
        COUNT(*) AS count,
        SUM("occurrenceCount") AS occurrences
      FROM "alarm_incidents"
      WHERE "lastSeenAt" >= ${from}
      GROUP BY 1, 2, 3, 4
      ORDER BY 1 ASC
    `);

    return NextResponse.json({
      success: true,
      from,
      days,
      data: rows.map((row) => ({
        ...row,
        count: Number(row.count),
        occurrences: Number(row.occurrences),
      })),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
