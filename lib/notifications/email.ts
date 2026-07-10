/**
 * InfraScope Email Notification Service
 * 
 * Production-grade email delivery for alarm notifications.
 * Architecture: Immediate send (no batching) for Next.js serverless compatibility.
 * 
 * Features:
 * - Immediate email delivery (no setTimeout dependency)
 * - Hourly rate limiting (configurable MAX_EMAILS_PER_HOUR)
 * - Per-alarm cooldown tracking (prevents duplicate alerts)
 * - SMTP connection pooling via nodemailer
 * - Rich HTML templates with severity-based styling
 * - UI-managed SMTP configuration
 */

import nodemailer from 'nodemailer';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('email');

// ============================================================================
// TYPES
// ============================================================================

interface EmailConfig {
  enabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure?: boolean;
  recipients: string[];
}

export interface AlarmEmailData {
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
  alarmEventId?: string; // Required for DLQ retry
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const EMPTY_EMAIL_CONFIG: EmailConfig = {
  enabled: false,
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPass: '',
  smtpSecure: false,
  recipients: [],
};

// Rate limiting constants
const MAX_EMAILS_PER_HOUR = 50;           // Maximum emails per hour (safety limit)
const ALARM_COOLDOWN_MS = 5 * 60 * 1000;  // 5 minutes cooldown per alarm code

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

// Hourly rate limiter
let emailCountThisHour = 0;
let hourlyResetTime = Date.now() + 60 * 60 * 1000;

// Per-alarm cooldown tracker (prevents duplicate emails for same alarm)
const alarmCooldowns = new Map<string, number>();

// Cached SMTP transporter (connection pooling)
let cachedTransporter: any = null;
let transporterConfig: string | null = null;

function getSmtpTlsOptions() {
  if (process.env.NODE_ENV === 'production' && process.env.SMTP_TLS_INSECURE === 'true') {
    throw new Error('SMTP_TLS_INSECURE=true is not allowed in production');
  }

  return {
    rejectUnauthorized: process.env.SMTP_TLS_INSECURE !== 'true',
  };
}

// ============================================================================
// HELPERS: Configuration
// ============================================================================

/**
 * Get email configuration from the Admin UI managed database record.
 */
export async function getEmailConfig(): Promise<EmailConfig> {
  try {
    const config = await prisma.notificationConfig.findUnique({
      where: { channel: 'email' },
    });
    if (config?.config) {
      return {
        enabled: config.enabled,
        ...(config.config as unknown as Omit<EmailConfig, 'enabled'>),
      };
    }
  } catch (error) {
    log.error({ err: error }, 'Failed to load email config from DB');
  }
  return EMPTY_EMAIL_CONFIG;
}

function getEmailConfigError(config: EmailConfig, options?: { requireEnabled?: boolean }): string | null {
  if (options?.requireEnabled && !config.enabled) return 'Email notifications are disabled';
  if (!config.smtpHost) return 'SMTP host is not configured';
  if (!config.smtpPort || config.smtpPort < 1 || config.smtpPort > 65535) return 'SMTP port is invalid';
  if (!config.smtpUser) return 'SMTP user is not configured';
  if (!config.smtpPass) return 'SMTP password is not configured';
  if (!Array.isArray(config.recipients) || config.recipients.length === 0) return 'At least one email recipient is required';
  return null;
}

/**
 * Get or create SMTP transporter (connection pooling)
 */
async function getTransporter(): Promise<any> {
  const config = await getEmailConfig();
  const configError = getEmailConfigError(config, { requireEnabled: true });
  if (configError) throw new Error(configError);

  const configKey = `${config.smtpHost}:${config.smtpPort}:${config.smtpUser}:${config.smtpPass}:${config.smtpSecure ? 'secure' : 'plain'}`;
  
  // Reuse existing transporter if config hasn't changed
  if (cachedTransporter && transporterConfig === configKey) {
    return cachedTransporter;
  }
  
  // Create new transporter
  cachedTransporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure || false,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
    tls: getSmtpTlsOptions(),
    pool: true,                  // Enable connection pooling
    maxConnections: 3,           // Max concurrent connections
    maxMessages: 100,            // Messages per connection before reconnect
  });
  
  transporterConfig = configKey;
  log.info('SMTP transporter created (pooled)');
  return cachedTransporter;
}

// ============================================================================
// HELPERS: Rate Limiting
// ============================================================================

/**
 * Check if we've exceeded hourly email limit
 */
function isHourlyLimitExceeded(): boolean {
  const now = Date.now();
  
  // Reset counter if hour has passed
  if (now > hourlyResetTime) {
    emailCountThisHour = 0;
    hourlyResetTime = now + 60 * 60 * 1000;
    log.info('Hourly counter reset');
  }
  
  return emailCountThisHour >= MAX_EMAILS_PER_HOUR;
}

/**
 * Check if specific alarm is in cooldown (prevents duplicate emails)
 */
function isAlarmInCooldown(alarmCode: string): boolean {
  const lastSent = alarmCooldowns.get(alarmCode);
  if (!lastSent) return false;
  
  const elapsed = Date.now() - lastSent;
  return elapsed < ALARM_COOLDOWN_MS;
}

/**
 * Record that an alarm email was sent
 */
function recordAlarmSent(alarmCode: string): void {
  alarmCooldowns.set(alarmCode, Date.now());
  emailCountThisHour++;
  
  // Cleanup old cooldowns (memory management)
  if (alarmCooldowns.size > 200) {
    const cutoff = Date.now() - ALARM_COOLDOWN_MS;
    for (const [code, time] of alarmCooldowns) {
      if (time < cutoff) alarmCooldowns.delete(code);
    }
  }
}

// ============================================================================
// HELPERS: Severity & Category Labels
// ============================================================================

const SEVERITY_COLORS: Record<string, string> = {
  'ALARM_CRITICAL': '#dc2626',
  'ALARM_HIGH': '#ea580c',
  'ALARM_MEDIUM': '#ca8a04',
  'ALARM_LOW': '#2563eb',
  'ALARM_INFO': '#6b7280',
};

const SEVERITY_LABELS: Record<string, string> = {
  'ALARM_CRITICAL': 'KRİTİK',
  'ALARM_HIGH': 'YÜKSEK',
  'ALARM_MEDIUM': 'ORTA',
  'ALARM_LOW': 'DÜŞÜK',
  'ALARM_INFO': 'BİLGİ',
};

const CATEGORY_LABELS: Record<string, string> = {
  'CONFIG_ACCESS': 'Konfigürasyon & Erişim',
  'SECURITY': 'Güvenlik',
  'RISK_ANOMALY': 'Risk & Anomali',
  'OPERATIONAL': 'Operasyonel',
  'SOC_CORRELATION': 'SOC Korelasyon',
};

function getSeverityColor(severity: string): string {
  return SEVERITY_COLORS[severity] || '#6b7280';
}

function getSeverityLabel(severity: string): string {
  return SEVERITY_LABELS[severity] || severity;
}

function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || category;
}

// ============================================================================
// HELPERS: Message Parsing
// ============================================================================

interface MessageSections {
  description: string;
  count: string;
  details: string[];
  otherEvents: string[];
  action: string;
}

/**
 * Parse structured alarm message into sections for email rendering
 */
function parseMessageSections(message: string): MessageSections {
  const blocks = message.split('\n\n');
  const result: MessageSections = {
    description: '',
    count: '',
    details: [],
    otherEvents: [],
    action: '',
  };

  for (const block of blocks) {
    if (block.startsWith('Tespit edilen')) {
      result.count = block;
    } else if (block.startsWith('Onerilen Aksiyon:')) {
      result.action = block.replace('Onerilen Aksiyon: ', '');
    } else if (block.startsWith('Diger olaylar:') || block.startsWith('Diger etkilenen')) {
      result.otherEvents = block
        .replace(/^Diger [^\n]+\n/, '')
        .split('\n')
        .map(l => l.replace(/^- /, ''))
        .filter(Boolean);
    } else if (block.includes(': ') && block.includes('\n')) {
      result.details = block.split('\n').filter(Boolean);
    } else if (!result.description) {
      result.description = block;
    }
  }
  
  return result;
}

// ============================================================================
// HTML TEMPLATE
// ============================================================================

/**
 * Build professional HTML email for alarm notification
 */
function buildAlarmEmailHtml(data: AlarmEmailData): string {
  const severityColor = getSeverityColor(data.severity);
  const severityLabel = getSeverityLabel(data.severity);
  const categoryLabel = getCategoryLabel(data.category);
  const timestamp = data.timestamp.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
  const sections = parseMessageSections(data.message);

  // Build detail rows
  const detailRowsHtml = sections.details
    .map(line => {
      const idx = line.indexOf(': ');
      if (idx === -1) return '';
      const label = line.substring(0, idx);
      const value = line.substring(idx + 2);
      return `
        <tr>
          <td style="padding:8px 12px;font-size:13px;color:#64748b;white-space:nowrap;vertical-align:top;font-weight:500;">${label}</td>
          <td style="padding:8px 12px;font-size:13px;color:#1e293b;word-break:break-word;">${value}</td>
        </tr>`;
    })
    .join('');

  // Build other events list
  const otherEventsHtml = sections.otherEvents.length > 0
    ? `<div style="margin-top:16px;">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;font-weight:600;">Diğer Olaylar</div>
        ${sections.otherEvents.map(e => `<div style="font-size:13px;color:#475569;padding:4px 0;border-bottom:1px solid #f1f5f9;">• ${e}</div>`).join('')}
      </div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;margin:0;padding:0;background:#f1f5f9;">
  <div style="max-width:640px;margin:20px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -2px rgba(0,0,0,0.1);">
    
    <!-- Header -->
    <div style="background:${severityColor};color:white;padding:24px;">
      <h1 style="margin:0 0 8px 0;font-size:20px;font-weight:600;">🚨 ${data.alarmName}</h1>
      <div style="display:inline-block;background:rgba(255,255,255,0.2);padding:4px 10px;border-radius:4px;font-size:12px;font-weight:500;">${severityLabel} • ${categoryLabel}</div>
    </div>

    <div style="padding:24px;">
      
      <!-- Title -->
      <div style="margin-bottom:20px;">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-weight:600;">Alarm Başlığı</div>
        <div style="font-size:16px;color:#0f172a;font-weight:600;">${data.title}</div>
      </div>

      <!-- Description -->
      <div style="margin-bottom:20px;">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-weight:600;">Açıklama</div>
        <div style="font-size:14px;color:#334155;line-height:1.6;">${sections.description}</div>
        ${sections.count ? `<div style="font-size:13px;color:#64748b;margin-top:6px;font-style:italic;">${sections.count}</div>` : ''}
      </div>

      <!-- Details Table -->
      ${detailRowsHtml ? `
      <div style="margin-bottom:20px;">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;font-weight:600;">Olay Detayları</div>
        <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden;">
          ${detailRowsHtml}
        </table>
      </div>` : ''}

      <!-- Metadata Grid -->
      <table style="width:100%;border-collapse:separate;border-spacing:8px 0;margin:-4px 0 16px -4px;">
        <tr>
          <td style="background:#f1f5f9;padding:12px;border-radius:8px;width:50%;">
            <div style="font-size:10px;color:#64748b;text-transform:uppercase;font-weight:600;">Alarm Kodu</div>
            <div style="font-size:13px;color:#0f172a;font-weight:600;margin-top:4px;font-family:monospace;">${data.alarmCode}</div>
          </td>
          <td style="background:#f1f5f9;padding:12px;border-radius:8px;width:50%;">
            <div style="font-size:10px;color:#64748b;text-transform:uppercase;font-weight:600;">Zaman</div>
            <div style="font-size:13px;color:#0f172a;font-weight:500;margin-top:4px;">${timestamp}</div>
          </td>
        </tr>
        ${(data.sourceIp || data.deviceName) ? `
        <tr>
          ${data.sourceIp ? `
          <td style="background:#f1f5f9;padding:12px;border-radius:8px;">
            <div style="font-size:10px;color:#64748b;text-transform:uppercase;font-weight:600;">Kaynak IP</div>
            <div style="font-size:13px;color:#0f172a;font-weight:500;margin-top:4px;font-family:monospace;">${data.sourceIp}</div>
          </td>` : '<td></td>'}
          ${data.deviceName ? `
          <td style="background:#f1f5f9;padding:12px;border-radius:8px;">
            <div style="font-size:10px;color:#64748b;text-transform:uppercase;font-weight:600;">Cihaz</div>
            <div style="font-size:13px;color:#0f172a;font-weight:500;margin-top:4px;">${data.deviceName}</div>
          </td>` : '<td></td>'}
        </tr>` : ''}
      </table>

      ${otherEventsHtml}

      <!-- Recommended Action -->
      ${sections.action ? `
      <div style="margin-top:20px;background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:16px;">
        <div style="font-size:11px;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;font-weight:700;">⚡ Önerilen Aksiyon</div>
        <div style="font-size:14px;color:#78350f;line-height:1.5;">${sections.action}</div>
      </div>` : ''}
    </div>

    <!-- Footer -->
    <div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
      <div style="font-size:11px;color:#94a3b8;">InfraScope Alarm Management System</div>
      <div style="font-size:10px;color:#cbd5c1;margin-top:4px;">${timestamp}</div>
    </div>
  </div>
</body>
</html>`;
}

// ============================================================================
// MAIN API: Send Alarm Email
// ============================================================================

/**
 * Send alarm notification email IMMEDIATELY (no batching)
 * 
 * @param data - Alarm data to send
 * @returns true if email was sent, false if skipped/failed
 * 
 * Skip reasons:
 * - Hourly limit exceeded (rate limiting)
 * - Alarm in cooldown (duplicate prevention)
 * - SMTP error (logged)
 */
export async function sendAlarmEmail(data: AlarmEmailData, options?: { bypassCooldown?: boolean; skipDLQ?: boolean }): Promise<boolean> {
  const startTime = Date.now();
  const bypassCooldown = options?.bypassCooldown ?? false;
  const skipDLQ = options?.skipDLQ ?? false;
  const config = await getEmailConfig();
  const configError = getEmailConfigError(config, { requireEnabled: true });
  if (configError) {
    log.info({ alarmCode: data.alarmCode, reason: configError }, 'Email notification skipped');
    return false;
  }
  
  // Check hourly rate limit (never bypassed for safety)
  if (isHourlyLimitExceeded()) {
    log.info({ alarmCode: data.alarmCode, maxPerHour: MAX_EMAILS_PER_HOUR }, 'Hourly limit exceeded, skipping');
    return false;
  }
  
  // Check per-alarm cooldown (can be bypassed for retries of failed notifications)
  if (!bypassCooldown && isAlarmInCooldown(data.alarmCode)) {
    log.info({ alarmCode: data.alarmCode }, 'Alarm in cooldown, skipping');
    return false;
  }
  
  try {
    log.info({ alarmCode: data.alarmCode }, 'Sending email');
    
    const transporter = await getTransporter();
    
    const subject = `[${getSeverityLabel(data.severity)}] ${data.alarmName}`;
    const html = buildAlarmEmailHtml(data);
    
    const info = await transporter.sendMail({
      from: `"InfraScope Alerts" <${config.smtpUser}>`,
      to: config.recipients.join(', '),
      subject,
      html,
    });
    
    // Record successful send
    recordAlarmSent(data.alarmCode);
    
    const elapsed = Date.now() - startTime;
    log.info({ elapsed, messageId: info.messageId, alarmCode: data.alarmCode }, 'Email sent');
    
    return true;
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const errorMsg = (error as Error).message || 'Unknown error';
    log.error({ err: error, elapsed, alarmCode: data.alarmCode }, 'Failed to send email');
    
    // Only clear the cached transporter for connection/auth errors.
    // Temporary message-delivery failures (recipient unknown, relay issues)
    // do NOT require a new SMTP connection — the pool is still valid.
    const isConnectionError = (
      errorMsg.includes('ECONNREFUSED') ||
      errorMsg.includes('ECONNRESET') ||
      errorMsg.includes('ETIMEDOUT') ||
      errorMsg.includes('ENOTFOUND') ||
      errorMsg.includes('authentication') ||
      errorMsg.includes('535') ||
      errorMsg.includes('Invalid login')
    );
    if (isConnectionError) {
      cachedTransporter = null;
      transporterConfig = null;
      log.warn('Connection/auth error — transporter cleared for reconnect');
    }
    
    // Add to DLQ for retry (only if alarmEventId is provided and not already a DLQ retry)
    if (!skipDLQ && data.alarmEventId) {
      try {
        // Dynamic import to avoid circular dependency and graceful fallback if DLQ not available
        const { addToDLQ } = await import('./dlq-worker');
        await addToDLQ(data.alarmEventId, data, errorMsg);
      } catch (dlqError) {
        log.error({ err: dlqError }, 'Failed to add to DLQ');
      }
    }
    
    return false;
  }
}

// ============================================================================
// UTILITY: Test Email
// ============================================================================

/**
 * Send a test email to verify SMTP configuration
 */
export async function sendTestEmail(configOverride?: Partial<EmailConfig>): Promise<{ success: boolean; error?: string }> {
  try {
    const baseConfig = await getEmailConfig();
    const config = { ...baseConfig, ...configOverride };
    const configError = getEmailConfigError(config, { requireEnabled: true });
    if (configError) return { success: false, error: configError };

    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure || false,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
      tls: getSmtpTlsOptions(),
    });

    // Verify connection
    await transporter.verify();

    // Send test email
    const info = await transporter.sendMail({
      from: `"InfraScope Alerts" <${config.smtpUser}>`,
      to: config.recipients.join(', '),
      subject: '✅ InfraScope - Email Testi Başarılı',
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;padding:32px;">
          <div style="background:#10b981;color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
            <h2 style="margin:0;font-size:20px;">✅ Email Testi Başarılı</h2>
          </div>
          <div style="background:#f8fafc;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;border-top:none;">
            <p style="margin:0 0 16px 0;color:#334155;">Bu bir test e-postasıdır. Alarm bildirimleri bu adrese gönderilecektir.</p>
            <div style="background:#e0f2fe;padding:12px;border-radius:6px;font-size:13px;color:#0369a1;">
              <strong>SMTP Server:</strong> ${config.smtpHost}:${config.smtpPort}
            </div>
            <p style="margin:16px 0 0 0;font-size:12px;color:#94a3b8;">
              Zaman: ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}
            </p>
          </div>
        </div>
      `,
    });

    log.info({ messageId: info.messageId }, 'Test email sent');
    return { success: true };
  } catch (error) {
    const errMsg = (error as Error).message || 'Unknown error';
    log.error({ errMsg }, 'Test email failed');
    return { success: false, error: errMsg };
  }
}

// ============================================================================
// UTILITY: Get Email Statistics
// ============================================================================

/**
 * Get current email service statistics (for monitoring/debugging)
 */
export function getEmailStats(): {
  emailsThisHour: number;
  maxPerHour: number;
  hourlyResetIn: number;
  activeCooldowns: number;
  transporterActive: boolean;
} {
  return {
    emailsThisHour: emailCountThisHour,
    maxPerHour: MAX_EMAILS_PER_HOUR,
    hourlyResetIn: Math.max(0, Math.round((hourlyResetTime - Date.now()) / 1000 / 60)),
    activeCooldowns: alarmCooldowns.size,
    transporterActive: cachedTransporter !== null,
  };
}
