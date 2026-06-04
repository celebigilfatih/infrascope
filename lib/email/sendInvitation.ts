import nodemailer from 'nodemailer';
import { getEmailConfig } from '@/lib/notifications/email';
import { createLogger } from '@/lib/logger';

const log = createLogger('send-invitation');

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface InvitationEmailParams {
  to: string;
  token: string;
  invitedBy: string;
  role: string;
}

/**
 * Send an invitation email with a verification link.
 * In development mode, logs the link instead of sending.
 */
export async function sendInvitationEmail(params: InvitationEmailParams): Promise<boolean> {
  const { to, token, invitedBy, role } = params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:8170';
  const verificationUrl = `${baseUrl}/verify?token=${token}`;

  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    log.info({ verificationUrl }, 'DEV MODE - Verification URL');
    log.info({ to, role, invitedBy }, 'DEV MODE - Invitation email details');
    return true;
  }

  try {
    const config = await getEmailConfig();

    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure || false,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
      tls: { rejectUnauthorized: false },
    });

    await transporter.sendMail({
      from: `"InfraScope" <${config.smtpUser}>`,
      to,
      subject: 'You are invited to join InfraScope',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #f9fafb; border-radius: 12px;">
          <div style="background: white; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <h1 style="font-size: 24px; font-weight: 700; color: #111827; margin: 0 0 16px;">You're Invited!</h1>
            <p style="font-size: 16px; color: #4b5563; margin: 0 0 8px;">
              <strong>${escapeHtml(invitedBy)}</strong> has invited you to join InfraScope as a <strong style="text-transform: capitalize;">${escapeHtml(role)}</strong>.
            </p>
            <p style="font-size: 14px; color: #6b7280; margin: 0 0 24px;">
              Click the button below to set your password and activate your account.
            </p>
            <a href="${verificationUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 16px;">
              Accept Invitation
            </a>
            <p style="font-size: 12px; color: #9ca3af; margin: 24px 0 0;">
              This invitation expires in 7 days. If you did not expect this email, you can ignore it.
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="font-size: 12px; color: #9ca3af; margin: 0;">
              If the button above doesn't work, copy and paste this link into your browser:<br/>
              <a href="${verificationUrl}" style="color: #2563eb; word-break: break-all;">${verificationUrl}</a>
            </p>
          </div>
        </div>
      `,
    });

    log.info({ to }, 'Invitation email sent');
    return true;
  } catch (error) {
    log.error({ err: error as Error }, 'Failed to send invitation email');
    return false;
  }
}

/**
 * Send a password reset email with a verification link.
 */
export async function sendPasswordResetEmail(params: {
  to: string;
  token: string;
  userName: string;
}): Promise<boolean> {
  const { to, token, userName } = params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:8170';
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    log.info({ resetUrl }, 'DEV MODE - Password reset URL');
    log.info({ to, userName }, 'DEV MODE - Password reset email details');
    return true;
  }

  try {
    const config = await getEmailConfig();

    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure || false,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
      tls: { rejectUnauthorized: false },
    });

    await transporter.sendMail({
      from: `"InfraScope" <${config.smtpUser}>`,
      to,
      subject: 'InfraScope - Password Reset',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #f9fafb; border-radius: 12px;">
          <div style="background: white; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <h1 style="font-size: 24px; font-weight: 700; color: #111827; margin: 0 0 16px;">Password Reset</h1>
            <p style="font-size: 16px; color: #4b5563; margin: 0 0 24px;">
              Hello <strong>${escapeHtml(userName)}</strong>, we received a request to reset your password.
            </p>
            <a href="${resetUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 16px;">
              Reset Password
            </a>
            <p style="font-size: 12px; color: #9ca3af; margin: 24px 0 0;">
              This link expires in 1 hour. If you did not request this, you can ignore this email.
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="font-size: 12px; color: #9ca3af; margin: 0;">
              If the button above doesn't work, copy and paste this link into your browser:<br/>
              <a href="${resetUrl}" style="color: #2563eb; word-break: break-all;">${resetUrl}</a>
            </p>
          </div>
        </div>
      `,
    });

    log.info({ to }, 'Password reset email sent');
    return true;
  } catch (error) {
    log.error({ err: error as Error }, 'Failed to send password reset email');
    return false;
  }
}
