/**
 * Zod validation helper for API route request bodies.
 */

import { ZodSchema } from '@/lib/i18n/validation';
import { uiError } from '@/lib/i18n/tr';

const fieldLabels: Record<string, string> = { name: 'Ad', email: 'E-posta', password: 'Parola', currentPassword: 'Mevcut parola', newPassword: 'Yeni parola', role: 'Rol', status: 'Durum', userId: 'Kullanıcı', id: 'Kayıt', token: 'Doğrulama kodu', host: 'Sunucu', username: 'Kullanıcı adı', smtpHost: 'SMTP sunucusu', smtpPort: 'SMTP portu', smtpUser: 'SMTP kullanıcı adı', recipients: 'Alıcılar', ids: 'Seçili kayıtlar', acknowledged: 'Onay durumu', pollingInterval: 'Veri toplama aralığı', enabledModules: 'Etkin modüller' };

export function validateBody<T>(
  body: unknown,
  schema: ZodSchema<T>
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors = result.error.issues
    .map((i) => `${i.path.map(part => fieldLabels[String(part)] || String(part)).join(' · ')}: ${uiError(i.message)}`)
    .join('; ');
  return { success: false, error: errors };
}
