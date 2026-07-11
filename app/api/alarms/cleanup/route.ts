/**
 * Compatibility endpoint for the former physical alarm cleanup API.
 * Closed incidents are now soft-archived; alarm evidence is never deleted here.
 */

import { AlarmArchiveState, AlarmIncidentStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { transitionAlarmIncident } from '@/lib/alarms/incident-service';
import { getAlarmRetentionStats } from '@/lib/alarms/retention-service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const auth = await getRequestActor(request);
    if (!auth || auth.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Admin role required' }, { status: 403 });
    }

    const hoursOld = Math.max(Number(request.nextUrl.searchParams.get('hoursOld') || 24 * 365), 1);
    const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true';
    const cutoff = new Date(Date.now() - hoursOld * 3_600_000);
    const candidates = await prisma.alarmIncident.findMany({
      where: {
        status: AlarmIncidentStatus.CLOSED,
        archiveState: AlarmArchiveState.HOT,
        legalHold: false,
        lastSeenAt: { lt: cutoff },
      },
      select: { id: true, title: true, severity: true, lastSeenAt: true },
      orderBy: { lastSeenAt: 'asc' },
      take: 10_000,
    });

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        wouldArchive: candidates.length,
        wouldDelete: 0,
        sampleIncidents: candidates.slice(0, 10),
        cutoff: cutoff.toISOString(),
      });
    }

    for (const incident of candidates) {
      await transitionAlarmIncident({
        incidentId: incident.id,
        action: 'ARCHIVE',
        actor: auth.actor,
        reason: `Manual retention archive after ${hoursOld} hours`,
      });
    }

    return NextResponse.json({
      success: true,
      archived: candidates.length,
      deleted: 0,
      message: 'Incidents archived; no alarm evidence was deleted',
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = await getRequestActor(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'Admin role required' }, { status: 403 });
  }
  return NextResponse.json({ success: true, stats: await getAlarmRetentionStats() });
}
