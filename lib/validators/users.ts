import { z } from '@/lib/i18n/validation';

export const createUserSchema = z.object({
  name: z.string().min(1, "Ad zorunludur.").max(100),
  email: z.string().email("Geçerli bir e-posta adresi girin."),
  password: z.string().min(8, "Parola en az 8 karakter olmalıdır.").max(72, "Parola en fazla 72 karakter olmalıdır."),
  role: z.enum(['ADMIN', 'EDITOR', 'VIEWER', 'admin', 'editor', 'viewer']),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
});

export const updateUserSchema = z.object({
  id: z.string().min(1, "Kullanıcı kimliği zorunludur."),
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  role: z.enum(['ADMIN', 'EDITOR', 'VIEWER', 'admin', 'editor', 'viewer']).optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
});

export const changePasswordSchema = z.object({
  userId: z.string().min(1, "Kullanıcı kimliği zorunludur."),
  currentPassword: z.string().min(1, "Mevcut parola zorunludur."),
  newPassword: z.string().min(8, "Yeni parola en az 8 karakter olmalıdır."),
});

export const resetPasswordRequestSchema = z.object({
  email: z.string().email("Geçerli bir e-posta adresi girin."),
});

export const resetPasswordConfirmSchema = z.object({
  token: z.string().min(1, "Doğrulama kodu zorunludur."),
  newPassword: z.string().min(8, "Yeni parola en az 8 karakter olmalıdır."),
});

export const inviteUserSchema = z.object({
  email: z.string().email("Geçerli bir e-posta adresi girin."),
  role: z.enum(['ADMIN', 'EDITOR', 'VIEWER', 'admin', 'editor', 'viewer']).optional(),
});
