import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { SESSION_COOKIE_NAME, verifySessionToken } from './session';
import type { IncidentActor } from '@/lib/alarms/incident-service';

export async function getRequestActor(request: NextRequest): Promise<{
  actor: IncidentActor;
  role: string;
} | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, role: true, status: true },
  });
  if (!user || user.status !== 'ACTIVE') return null;

  return {
    actor: { type: 'USER', id: user.id, name: user.name || user.email },
    role: user.role,
  };
}
