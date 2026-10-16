import { z } from '@/lib/i18n/validation';

export const loginSchema = z.object({
  email: z.string().email("Geçerli bir e-posta adresi girin."),
  password: z.string().min(1, "Parola zorunludur."),
});
