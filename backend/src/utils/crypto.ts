import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm' as const;
const IV_BYTES = 12;

function getKey(): Buffer {
  return Buffer.from(config.TOKEN_ENCRYPTION_KEY, 'hex');
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
}

export function decrypt(encryptedString: string): string {
  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted string format');
  }
  const [ivHex, cipherHex, authTagHex] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, 'hex');
  const ciphertext = Buffer.from(cipherHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}
