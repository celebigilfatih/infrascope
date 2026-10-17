import { z } from '@/lib/i18n/validation';

export const acknowledgeAlarmsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "En az bir alarm seçin.").max(100),
  acknowledged: z.boolean(),
});

export const alarmDefinitionUpdateSchema = z.object({
  id: z.string().min(1, 'Kural kimliği zorunludur.'),
  enabled: z.boolean().optional(),
  notifyEmail: z.boolean().optional(),
  cooldownMinutes: z.number().int().min(0).max(525600).optional(),
  detectionLogic: z.record(z.string(), z.unknown()).optional(),
}).strict().refine(value => Object.keys(value).some(key => key !== 'id'), 'Kaydedilecek bir değişiklik seçin.');

export const notificationConfigSchema = z.object({
  enabled: z.boolean().optional(),
  smtpHost: z.string().min(1, "SMTP sunucusu zorunludur."),
  smtpPort: z.number().int().min(1).max(65535, "Port numarası geçersiz."),
  smtpUser: z.string().min(1, "SMTP kullanıcı adı zorunludur."),
  smtpPass: z.string().optional(),
  smtpSecure: z.boolean().optional(),
  recipients: z.array(z.string().email()).min(1, "En az bir alıcı ekleyin."),
});
