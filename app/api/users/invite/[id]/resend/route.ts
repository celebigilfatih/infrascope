import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRequest } from '@/lib/auth/api-permission';
import { prisma } from '@/lib/prisma';
import { checkUserLimit } from '@/lib/license/middleware';
import { InvitationOperationError, resendWorkspaceInvitation } from '@/lib/invitations/service';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const authorization = await authorizeApiRequest(request, 'users', 'write');if (!authorization.allowed) return authorization.response;
  try {
    if (!params.id || params.id.length > 200) return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: 'Geçerli bir davet seçin.' }, { status: 400, headers });
    const limit = await checkUserLimit(await prisma.user.count()); if (limit) return limit;
    return NextResponse.json(await resendWorkspaceInvitation(params.id, authorization.auth.actor), { headers });
  } catch (error) {
    if (error instanceof InvitationOperationError) return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: error.status, headers });
    console.error('[Invitation] Resend failed', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ success: false, error: 'Davet işleminin sonucu doğrulanamadı. Listeyi yenileyin.' }, { status: 500, headers });
  }
}
