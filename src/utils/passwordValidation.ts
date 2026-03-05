export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('At least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('One uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('One lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('One number');
  }

  return { isValid: errors.length === 0, errors };
}

export function validateEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) {
    return false;
  }
  if (normalized.includes('..')) {
    return false;
  }
  const [localPart, domain] = normalized.split('@');
  if (!localPart || !domain) {
    return false;
  }
  if (localPart.startsWith('.') || localPart.endsWith('.')) {
    return false;
  }
  if (domain.startsWith('-') || domain.endsWith('-')) {
    return false;
  }
  if (domain.includes('-.') || domain.includes('.-')) {
    return false;
  }
  return true;
}
