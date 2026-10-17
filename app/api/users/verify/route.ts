import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit/logger';
import { hashPassword, validatePasswordStrength } from '@/lib/auth/password';
import { checkUserLimit } from '@/lib/license/middleware';
export const dynamic = 'force-dynamic';
class InvitationLimitError extends Error { constructor(public response: NextResponse) { super('Invitation capacity exceeded'); } }
const headers = { 'Cache-Control': 'private, no-store' };
const validToken = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const invalid = () => reply({ success: false, valid: false, error: 'Davet bağlantısı geçersiz veya artık kullanılamıyor.' }, 400);

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || !validToken(body.token) || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100 || typeof body.password !== 'string') return reply({ success: false, error: 'Davet bağlantısını, ad soyad ve parola bilgilerini kontrol edin.' }, 400);
    const { token, password } = body, name = body.name.trim();
    const invitation = await prisma.invitation.findUnique({ where: { token } });
    if (!invitation || invitation.status !== 'PENDING' || invitation.acceptedAt || invitation.expiresAt.getTime() <= Date.now()) return invalid();
    const existingUser = await prisma.user.findFirst({ where: { email: { equals: invitation.email, mode: 'insensitive' } }, select: { id: true } });
    if (existingUser) return reply({ success: false, error: 'Bu e-posta adresiyle kayıtlı bir hesap var. Giriş ekranını kullanın.' }, 409);
    const limit = await checkUserLimit(await prisma.user.count()); if (limit) return limit;
    if (!validatePasswordStrength(password).valid) return reply({ success: false, error: 'Parola 8–72 karakter olmalı; büyük harf, rakam ve özel karakter içermelidir.' }, 400);
    const hashedPassword = await hashPassword(password);
    const user = await prisma.$transaction(async tx => {
      const capacity = await checkUserLimit(await tx.user.count());
      if (capacity) throw new InvitationLimitError(capacity);
      const claimed = await tx.invitation.updateMany({ where: { id: invitation.id, token, status: 'PENDING', acceptedAt: null, expiresAt: { gt: new Date() } }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
      if (claimed.count !== 1) throw new Error('INVITATION_CHANGED');
      const created = await tx.user.create({ data: { name, email: invitation.email, password: hashedPassword, role: invitation.role, status: 'ACTIVE' } });
      await tx.userActivity.create({ data: { userId: created.id, action: 'account_created' } });
      return created;
    }, { isolationLevel: 'Serializable' });
    await logAudit({ userId: user.id, action: 'invitation.accept', resource: 'invitation', resourceId: invitation.id, details: { email: invitation.email, role: invitation.role } });
    return reply({ success: true, data: { id: user.id, name: user.name, email: user.email, role: user.role.toLowerCase() } });
  } catch (error) {
    if (error instanceof InvitationLimitError) return error.response;
    if ((error as { code?: string })?.code === 'P2034') return reply({ success: false, error: 'Davet eşzamanlı bir işlemde değişti. Hesap durumunu kontrol edip bağlantıyı yeniden açın.' }, 409);
    if ((error as { code?: string })?.code === 'P2002') return reply({ success: false, error: 'Bu e-posta adresiyle kayıtlı bir hesap var. Giriş ekranını kullanın.' }, 409);
    if (error instanceof Error && error.message === 'INVITATION_CHANGED') return reply({ success: false, error: 'Davet başka bir işlemde kullanıldı veya süresi doldu. Bağlantıyı yeniden açın.' }, 409);
    console.error('[Invitation] Acceptance failed', error instanceof Error ? error.name : 'UnknownError');
    return reply({ success: false, error: 'Hesap oluşturma tamamlanamadı. Tekrar denemeden önce giriş ekranından hesap durumunu kontrol edin.' }, 500);
  }
}
export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get('token');
    if (!validToken(token)) return invalid();
    const invitation = await prisma.invitation.findUnique({ where: { token } });
    if (!invitation || invitation.status !== 'PENDING' || invitation.acceptedAt || invitation.expiresAt.getTime() <= Date.now()) return invalid();
    return reply({ success: true, valid: true, data: { email: invitation.email, role: invitation.role.toLowerCase(), invitedBy: invitation.invitedBy, expiresAt: invitation.expiresAt } });
  } catch (error) {
    console.error('[Invitation] Token read failed', error instanceof Error ? error.name : 'UnknownError');
    return reply({ success: false, valid: false, error: 'Davet şu anda doğrulanamıyor. Yeniden deneyin.' }, 503);
  }
}
