import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { jobSelect } from '@/lib/nms/backup-service';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  if (!await getRequestActor(req)) return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  const jobs = await prisma.nmsBackupJob.findMany({ where: id ? { id } : {}, select: jobSelect, orderBy: { createdAt: 'desc' }, take: id ? 1 : 100 });
  return NextResponse.json({ jobs }, { headers: { 'Cache-Control': 'private, no-store' } });
}
