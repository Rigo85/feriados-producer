import crypto from 'node:crypto';

export function createHash(value: string): string {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}
