import crypto from 'crypto';
import type { Invitation } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { sendInvitationEmail } from '@/lib/email/sendInvitation';
import { logAudit } from '@/lib/audit/logger';
import { invitationErrors, type InvitationErrorCode, type DeliveryStatus } from './workspace';

export class InvitationOperationError extends Error {
  constructor(public code: InvitationErrorCode, public status: number) { super(invitationErrors[code]); }
}
export function publicInvitation(invitation: Invitation, now = Date.now()) {
  return { id: invitation.id, email: invitation.email, role: invitation.role.toLowerCase(), status: invitation.status === 'PENDING' && invitation.expiresAt.getTime() <= now ? 'expired' : invitation.status.toLowerCase(), invitedBy: invitation.invitedBy, expiresAt: invitation.expiresAt.toISOString(), acceptedAt: invitation.acceptedAt?.toISOString() ?? null, createdAt: invitation.createdAt.toISOString() };
}
async function assertNoAccount(email: string) {
  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
  if (existing) throw new InvitationOperationError('ACCOUNT_EXISTS', 409);
}
async function finish(invitation: Invitation, actor: { id?: string; name: string }, resend: boolean) {
  let emailSent = false;
  try { emailSent = await sendInvitationEmail({ to: invitation.email, token: invitation.token, invitedBy: invitation.invitedBy, role: invitation.role.toLowerCase() }); } catch { /* The saved invitation is retained even when transport fails. */ }
  const delivery: DeliveryStatus = emailSent ? process.env.NODE_ENV === 'development' ? 'development' : 'submitted' : 'failed';
  await logAudit({ userId: actor.id, action: resend ? 'invitation.resend' : 'invitation.create', resource: 'invitation', resourceId: invitation.id, details: { email: invitation.email, role: invitation.role, emailSent, delivery, expiresAt: invitation.expiresAt.toISOString(), invitedBy: invitation.invitedBy } });
  return { success: true as const, data: { ...publicInvitation(invitation), emailSent }, delivery };
}
export async function createWorkspaceInvitation(email: string, role: 'ADMIN' | 'EDITOR' | 'VIEWER', actor: { id?: string; name: string }) {
  const normalized = email.trim().toLowerCase(); await assertNoAccount(normalized);
  if (await prisma.invitation.findFirst({ where: { email: { equals: normalized, mode: 'insensitive' } }, select: { id: true } })) throw new InvitationOperationError('INVITE_EXISTS', 409);
  const invitation = await prisma.invitation.create({ data: { email: normalized, role, invitedBy: actor.name, token: crypto.randomBytes(32).toString('hex'), status: 'PENDING', expiresAt: new Date(Date.now() + 7 * 86400000) } });
  return finish(invitation, actor, false);
}
export async function resendWorkspaceInvitation(id: string, actor: { id?: string; name: string }) {
  const invitation = await prisma.invitation.findUnique({ where: { id } });
  if (!invitation) throw new InvitationOperationError('NOT_FOUND', 404);
  if (invitation.status === 'ACCEPTED' || invitation.acceptedAt) throw new InvitationOperationError('ACCEPTED', 409);
  await assertNoAccount(invitation.email);
  let expiresAt = new Date(Date.now() + 7 * 86400000);
  // Ensure the compare-and-set always changes the expiry, including same-ms calls.
  if (expiresAt.getTime() === invitation.expiresAt.getTime()) expiresAt = new Date(expiresAt.getTime() + 1);
  const update = await prisma.invitation.updateMany({ where: { id, token: invitation.token, expiresAt: invitation.expiresAt, status: { in: ['PENDING', 'EXPIRED'] }, acceptedAt: null }, data: { expiresAt, status: 'PENDING' } });
  if (update.count !== 1) throw new InvitationOperationError('CHANGED', 409);
  // Preserve the token and role: existing links share the renewed expiry.
  return finish({ ...invitation, expiresAt, status: 'PENDING' }, actor, true);
}
