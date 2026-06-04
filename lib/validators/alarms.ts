import { z } from 'zod';

export const acknowledgeAlarmsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'At least one alarm ID is required').max(100),
  acknowledged: z.boolean(),
});

export const notificationConfigSchema = z.object({
  smtpHost: z.string().min(1, 'SMTP host is required'),
  smtpPort: z.number().int().min(1).max(65535, 'Invalid port number'),
  smtpUser: z.string().min(1, 'SMTP user is required'),
  smtpPass: z.string().optional(),
  smtpSecure: z.boolean().optional(),
  recipients: z.array(z.string().email()).min(1, 'At least one recipient is required').optional(),
});
