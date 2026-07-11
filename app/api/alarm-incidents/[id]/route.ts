import { gunzipSync } from 'zlib';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const incident = await prisma.alarmIncident.findUnique({
      where: { id: params.id },
      include: {
        alarm: true,
        transitions: { orderBy: { createdAt: 'desc' }, take: 100 },
        notificationAttempts: { orderBy: { createdAt: 'desc' }, take: 100 },
        occurrences: {
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    });
    if (!incident) return NextResponse.json({ success: false, error: 'Incident not found' }, { status: 404 });

    const archives = await prisma.alarmArchivePayload.findMany({
      where: { incidentId: incident.id },
      select: { alarmEventId: true, payload: true, encoding: true },
    });
    const archiveByEvent = new Map(archives.map((entry) => [entry.alarmEventId, entry]));
    const occurrences = incident.occurrences.map((event) => {
      const archive = archiveByEvent.get(event.id);
      if (!archive) return event;
      try {
        return { ...event, rawData: JSON.parse(gunzipSync(new Uint8Array(archive.payload)).toString('utf8')) };
      } catch {
        return event;
      }
    });

    return NextResponse.json({ success: true, data: { ...incident, occurrences } });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
