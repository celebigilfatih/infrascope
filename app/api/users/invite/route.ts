import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeApiRequest } from '@/lib/auth/api-permission';
import { validateBody } from '@/lib/validators';
import { inviteUserSchema } from '@/lib/validators/users';
import { checkUserLimit } from '@/lib/license/middleware';
import { createWorkspaceInvitation, InvitationOperationError, publicInvitation } from '@/lib/invitations/service';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function POST(request: NextRequest) {
  const authorization = await authorizeApiRequest(request, 'users', 'write'); if (!authorization.allowed) return authorization.response;
  try {
    const body = await request.json().catch(() => null), parsed = validateBody(body, inviteUserSchema);
    if (!parsed.success) return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: 'Geçerli bir e-posta adresi ve rol seçin.' }, { status: 400, headers });
    const limit = await checkUserLimit(await prisma.user.count()); if (limit) return limit;
    return NextResponse.json(await createWorkspaceInvitation(parsed.data.email, (parsed.data.role?.toUpperCase() || 'VIEWER') as 'ADMIN' | 'EDITOR' | 'VIEWER', authorization.auth.actor), { headers });
  } catch (error) {
    if (error instanceof InvitationOperationError) return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: error.status, headers });
    if ((error as { code?: string })?.code === 'P2002') return NextResponse.json({ success: false, code: 'INVITE_EXISTS', error: 'Bu adrese ait davet zaten var. Listeyi yenileyin.' }, { status: 409, headers });
    console.error('[Invitation] Create failed', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ success: false, error: 'Davet işleminin sonucu doğrulanamadı. Listeyi yenileyin.' }, { status: 500, headers });
  }
}
export async function GET(request: NextRequest) {
  const authorization = await authorizeApiRequest(request, 'users', 'read'); if (!authorization.allowed) return authorization.response;
  try {
    const invitations = await prisma.invitation.findMany({ orderBy: { createdAt: 'desc' } });
    const now = Date.now(), data = invitations.map(invitation => publicInvitation(invitation, now));
    const stats = { total: data.length, pending: data.filter(row => row.status === 'pending').length, accepted: data.filter(row => row.status === 'accepted').length, expired: data.filter(row => row.status === 'expired').length };
    return NextResponse.json({ success: true, data, stats, observedAt: new Date(now).toISOString(), deliveryMode: process.env.NODE_ENV === 'development' ? 'development' : 'smtp' }, { headers });
  } catch (error) {
    console.error('[Invitation] Read failed', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ success: false, error: 'Davet listesi alınamadı.' }, { status: 500, headers });
  }
}
