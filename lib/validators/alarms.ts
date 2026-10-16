import { z } from '@/lib/i18n/validation';

export const acknowledgeAlarmsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "En az bir alarm seçin.").max(100),
  acknowledged: z.boolean(),
});

export const notificationConfigSchema = z.object({
  enabled: z.boolean().optional(),
  smtpHost: z.string().min(1, "SMTP sunucusu zorunludur."),
  smtpPort: z.number().int().min(1).max(65535, "Port numarası geçersiz."),
  smtpUser: z.string().min(1, "SMTP kullanıcı adı zorunludur."),
  smtpPass: z.string().optional(),
  smtpSecure: z.boolean().optional(),
  recipients: z.array(z.string().email()).min(1, "En az bir alıcı ekleyin."),
});
