import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;
const MAX_PASSWORD_LENGTH = 72;

/**
 * Hash a plaintext password using bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a plaintext password against a bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Validate password strength requirements.
 * Returns an object with `valid` flag and array of error messages.
 */
export function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 8) errors.push('At least 8 characters');
  if (password.length > MAX_PASSWORD_LENGTH) errors.push(`No more than ${MAX_PASSWORD_LENGTH} characters`);
  if (!/[A-Z]/.test(password)) errors.push('At least one uppercase letter');
  if (!/[0-9]/.test(password)) errors.push('At least one number');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) errors.push('At least one special character');

  return { valid: errors.length === 0, errors };
}

/**
 * Get password strength score (0-4) for UI meter.
 */
export function getPasswordStrength(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score++;
  return score;
}

/**
 * Get a human-readable strength label from score.
 */
export function getStrengthLabel(score: number): { label: string; color: string } {
  switch (score) {
    case 0: return { label: 'Too short', color: 'bg-red-500' };
    case 1: return { label: 'Weak', color: 'bg-red-500' };
    case 2: return { label: 'Fair', color: 'bg-yellow-500' };
    case 3: return { label: 'Good', color: 'bg-blue-500' };
    case 4: return { label: 'Strong', color: 'bg-green-500' };
    default: return { label: 'Unknown', color: 'bg-gray-500' };
  }
}
