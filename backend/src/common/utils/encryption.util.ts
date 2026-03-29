import * as crypto from 'crypto';

/**
 * Encryption utility for securing sensitive data (API keys, URLs, etc.)
 * Uses AES-256-GCM for authenticated encryption
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes for GCM
const AUTH_TAG_LENGTH = 16; // 16 bytes authentication tag
const KEY_LENGTH = 32; // 32 bytes for AES-256

/**
 * Get encryption key from environment variable
 * Key must be a 64-character hex string (32 bytes)
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;

  if (!keyHex) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  if (keyHex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }

  return Buffer.from(keyHex, 'hex');
}

/**
 * Generate a new encryption key (for setup/testing)
 * Run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Encrypt a string value
 * @param plaintext - The value to encrypt
 * @returns Encrypted string in format: iv:authTag:ciphertext (all hex-encoded)
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty value');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all hex-encoded)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
}

/**
 * Decrypt an encrypted string
 * @param encrypted - The encrypted value (format: iv:authTag:ciphertext)
 * @returns Decrypted plaintext string
 */
export function decrypt(encrypted: string): string {
  if (!encrypted) {
    throw new Error('Cannot decrypt empty value');
  }

  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error(
      'Invalid encrypted format. Expected: iv:authTag:ciphertext',
    );
  }

  const [ivHex, authTagHex, ciphertext] = parts;

  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

/**
 * Mask a sensitive value for display (e.g., API keys)
 * @param value - The value to mask
 * @param visibleChars - Number of characters to show at the end (default: 4)
 * @returns Masked string (e.g., "sk-****1234")
 */
export function maskSensitiveValue(
  value: string,
  visibleChars: number = 4,
): string {
  if (!value || value.length <= visibleChars) {
    return '****';
  }

  const visible = value.slice(-visibleChars);
  const prefix = value.startsWith('sk-') ? 'sk-' : '';

  return `${prefix}****${visible}`;
}

/**
 * Verify encryption is working (for health checks)
 */
export function verifyEncryption(): boolean {
  try {
    const testValue = 'test-encryption-value';
    const encrypted = encrypt(testValue);
    const decrypted = decrypt(encrypted);
    return decrypted === testValue;
  } catch (error) {
    console.error('Encryption verification failed:', error);
    return false;
  }
}
