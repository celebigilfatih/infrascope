import nodemailer from 'nodemailer';
import { prisma } from '@/lib/prisma';

interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure?: boolean;
  recipients: string[];
}

interface AlarmEmailData {
  alarmCode: string;
  alarmName: string;
  severity: string;
  category: string;
  title: string;
  message: string;
  sourceIp?: string;
  destIp?: string;
  deviceName?: string;
  timestamp: Date;
  rawData?: Record<string, unknown>;
}

const DEFAULT_EMAIL_CONFIG: EmailConfig = {
  smtpHost: 'mail.webmahsul.com.tr',
  smtpPort: 587,
  smtpUser: 'alert@webmahsul.com.tr',
  smtpPass: 'Thor.7485-Scope',
  smtpSecure: false,
  recipients: ['alert@webmahsul.com.tr'],
};

/**
 * Get email config from DB or use defaults
 */
export async function getEmailConfig(): Promise<EmailConfig> {
  try {
    const config = await prisma.notificationConfig.findUnique({
      where: { channel: 'email' },
    });
    if (config && config.enabled) {
      return config.config as unknown as EmailConfig;
    }
  } catch (error) {
    console.error('Failed to load email config from DB:', error);
  }
  return DEFAULT_EMAIL_CONFIG;
}

/**
 * Get severity color for email template
 */
function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'ALARM_CRITICAL': return '#dc2626';
    case 'ALARM_HIGH': return '#ea580c';
    case 'ALARM_MEDIUM': return '#ca8a04';
    case 'ALARM_LOW': return '#2563eb';
    case 'ALARM_INFO': return '#6b7280';
    default: return '#6b7280';
  }
}

function getSeverityLabel(severity: string): string {
  switch (severity) {
    case 'ALARM_CRITICAL': return 'CRITICAL';
    case 'ALARM_HIGH': return 'HIGH';
    case 'ALARM_MEDIUM': return 'MEDIUM';
    case 'ALARM_LOW': return 'LOW';
    case 'ALARM_INFO': return 'INFO';
    default: return severity;
  }
}

function getCategoryLabel(category: string): string {
  switch (category) {
    case 'CONFIG_ACCESS': return 'Config & Access';
    case 'SECURITY': return 'Security';
    case 'RISK_ANOMALY': return 'Risk & Anomaly';
    case 'OPERATIONAL': return 'Operational';
    case 'SOC_CORRELATION': return 'SOC Correlation';
    default: return category;
  }
}

/**
 * Parse structured alarm message into sections for email rendering
 */
function parseMessageSections(message: string): { description: string; count: string; details: string[]; otherEvents: string[]; action: string } {
  const blocks = message.split('\n\n');
  const result = { description: '', count: '', details: [] as string[], otherEvents: [] as string[], action: '' };

  for (const block of blocks) {
    if (block.startsWith('Tespit edilen')) {
      result.count = block;
    } else if (block.startsWith('Onerilen Aksiyon:')) {
      result.action = block.replace('Onerilen Aksiyon: ', '');
    } else if (block.startsWith('Diger olaylar:')) {
      result.otherEvents = block.replace('Diger olaylar:\n', '').split('\n').map(l => l.replace(/^- /, ''));
    } else if (block.includes(': ') && block.includes('\n')) {
      result.details = block.split('\n').filter(Boolean);
    } else if (!result.description) {
      result.description = block;
    }
  }
  return result;
}

/**
 * Build HTML email for alarm notification
 */
function buildAlarmEmailHtml(data: AlarmEmailData): string {
  const severityColor = getSeverityColor(data.severity);
  const severityLabel = getSeverityLabel(data.severity);
  const categoryLabel = getCategoryLabel(data.category);
  const timestamp = data.timestamp.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
  const sections = parseMessageSections(data.message);

  // Build detail rows HTML
  const detailRowsHtml = sections.details.map(line => {
    const idx = line.indexOf(': ');
    if (idx === -1) return '';
    const label = line.substring(0, idx);
    const value = line.substring(idx + 2);
    return `
      <tr>
        <td style="padding:6px 12px;font-size:13px;color:#64748b;white-space:nowrap;vertical-align:top;">${label}</td>
        <td style="padding:6px 12px;font-size:13px;color:#1e293b;word-break:break-word;">${value}</td>
      </tr>`;
  }).join('');

  // Build other events HTML
  const otherEventsHtml = sections.otherEvents.length > 0 ? `
    <div style="margin-top:16px;">
      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Diger Olaylar</div>
      ${sections.otherEvents.map(e => `<div style="font-size:13px;color:#475569;padding:4px 0;border-bottom:1px solid #f1f5f9;">&#8226; ${e}</div>`).join('')}
    </div>` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background:#f8fafc;">
  <div style="max-width:600px;margin:20px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="background:${severityColor};color:white;padding:20px 24px;">
      <h1 style="margin:0;font-size:18px;font-weight:600;">InfraScope Alarm: ${data.alarmName}</h1>
      <div style="display:inline-block;background:rgba(255,255,255,0.2);padding:2px 8px;border-radius:4px;font-size:12px;margin-top:8px;">${severityLabel} - ${categoryLabel}</div>
    </div>

    <div style="padding:24px;">
      <!-- Alarm Title -->
      <div style="margin-bottom:16px;">
        <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Alarm</div>
        <div style="font-size:15px;color:#1e293b;font-weight:600;">${data.title}</div>
      </div>

      <!-- Description -->
      <div style="margin-bottom:16px;">
        <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Aciklama</div>
        <div style="font-size:14px;color:#334155;line-height:1.5;">${sections.description}</div>
        ${sections.count ? `<div style="font-size:13px;color:#64748b;margin-top:4px;">${sections.count}</div>` : ''}
      </div>

      <!-- Event Details Table -->
      ${detailRowsHtml ? `
      <div style="margin-bottom:16px;">
        <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Olay Detaylari</div>
        <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:6px;overflow:hidden;">
          ${detailRowsHtml}
        </table>
      </div>` : ''}

      <!-- Info Grid -->
      <table style="width:100%;border-collapse:separate;border-spacing:8px 0;margin:-4px;">
        <tr>
          <td style="background:#f1f5f9;padding:10px 12px;border-radius:6px;width:50%;">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Kod</div>
            <div style="font-size:13px;color:#1e293b;font-weight:500;margin-top:2px;">${data.alarmCode}</div>
          </td>
          <td style="background:#f1f5f9;padding:10px 12px;border-radius:6px;width:50%;">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Zaman</div>
            <div style="font-size:13px;color:#1e293b;font-weight:500;margin-top:2px;">${timestamp}</div>
          </td>
        </tr>
        ${(data.sourceIp || data.deviceName) ? `
        <tr>
          ${data.sourceIp ? `
          <td style="background:#f1f5f9;padding:10px 12px;border-radius:6px;padding-top:10px;">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Kaynak IP</div>
            <div style="font-size:13px;color:#1e293b;font-weight:500;margin-top:2px;">${data.sourceIp}</div>
          </td>` : '<td></td>'}
          ${data.deviceName ? `
          <td style="background:#f1f5f9;padding:10px 12px;border-radius:6px;padding-top:10px;">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Cihaz</div>
            <div style="font-size:13px;color:#1e293b;font-weight:500;margin-top:2px;">${data.deviceName}</div>
          </td>` : '<td></td>'}
        </tr>` : ''}
      </table>

      ${otherEventsHtml}

      <!-- Recommended Action -->
      ${sections.action ? `
      <div style="margin-top:16px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px 16px;">
        <div style="font-size:12px;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-weight:600;">Onerilen Aksiyon</div>
        <div style="font-size:13px;color:#78350f;line-height:1.5;">${sections.action}</div>
      </div>` : ''}
    </div>

    <!-- Footer -->
    <div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center;">
      InfraScope Alarm Management System &bull; ${timestamp}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Send alarm notification email
 */
export async function sendAlarmEmail(data: AlarmEmailData): Promise<boolean> {
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
      tls: {
        rejectUnauthorized: false,
      },
    });

    const severityLabel = getSeverityLabel(data.severity);
    const subject = `[${severityLabel}] InfraScope Alarm: ${data.alarmName} - ${data.title}`;
    const html = buildAlarmEmailHtml(data);

    const info = await transporter.sendMail({
      from: `"InfraScope Alerts" <${config.smtpUser}>`,
      to: config.recipients.join(', '),
      subject,
      html,
    });

    console.log(`Alarm email sent: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('Failed to send alarm email:', error);
    return false;
  }
}

/**
 * Send a test email to verify SMTP configuration
 */
export async function sendTestEmail(configOverride?: Partial<EmailConfig>): Promise<{ success: boolean; error?: string }> {
  try {
    const baseConfig = await getEmailConfig();
    const config = { ...baseConfig, ...configOverride };

    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure || false,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    await transporter.verify();

    await transporter.sendMail({
      from: `"InfraScope Alerts" <${config.smtpUser}>`,
      to: config.recipients.join(', '),
      subject: 'InfraScope - Test Email',
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2 style="color: #16a34a;">InfraScope Email Test Basarili</h2>
          <p>Bu bir test emailidir. Alarm bildirimleri bu adrese gonderilecektir.</p>
          <p style="color: #64748b; font-size: 12px;">Zaman: ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</p>
        </div>
      `,
    });

    return { success: true };
  } catch (error) {
    const errMsg = (error as Error).message || 'Unknown error';
    console.error('Test email failed:', errMsg);
    return { success: false, error: errMsg };
  }
}
