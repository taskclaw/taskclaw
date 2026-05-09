import {
  encrypt,
  decrypt,
  generateEncryptionKey,
  maskSensitiveValue,
  verifyEncryption,
} from './encryption.util';

// Use a valid 64-hex-char test key (32 bytes)
const TEST_KEY = 'a'.repeat(64);

describe('encryption.util', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  afterAll(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  // ─── encrypt / decrypt roundtrip ────────────────────────────

  describe('encrypt + decrypt roundtrip', () => {
    it('recovers the original plaintext', () => {
      const plaintext = 'my-secret-api-key';
      const ciphertext = encrypt(plaintext);
      expect(decrypt(ciphertext)).toBe(plaintext);
    });

    it('produces different ciphertext on each call (random IV)', () => {
      const plaintext = 'same-input';
      const a = encrypt(plaintext);
      const b = encrypt(plaintext);
      expect(a).not.toBe(b);
    });

    it('handles unicode / special characters', () => {
      const plaintext = 'päss!@#$%^&*()wörд 日本語';
      expect(decrypt(encrypt(plaintext))).toBe(plaintext);
    });

    it('handles a long string (>1 AES block)', () => {
      const plaintext = 'x'.repeat(1000);
      expect(decrypt(encrypt(plaintext))).toBe(plaintext);
    });
  });

  // ─── encrypt edge cases ─────────────────────────────────────

  describe('encrypt', () => {
    it('throws when plaintext is empty string', () => {
      expect(() => encrypt('')).toThrow('Cannot encrypt empty value');
    });

    it('produces output in iv:authTag:ciphertext format (3 colon-separated parts)', () => {
      const parts = encrypt('test').split(':');
      expect(parts).toHaveLength(3);
      // IV = 16 bytes → 32 hex chars
      expect(parts[0]).toHaveLength(32);
      // authTag = 16 bytes → 32 hex chars
      expect(parts[1]).toHaveLength(32);
    });

    it('throws when ENCRYPTION_KEY is missing', () => {
      const saved = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;
      expect(() => encrypt('test')).toThrow(
        'ENCRYPTION_KEY environment variable is not set',
      );
      process.env.ENCRYPTION_KEY = saved;
    });

    it('throws when ENCRYPTION_KEY has wrong length', () => {
      const saved = process.env.ENCRYPTION_KEY;
      process.env.ENCRYPTION_KEY = 'tooshort';
      expect(() => encrypt('test')).toThrow(
        'ENCRYPTION_KEY must be 64 hex characters',
      );
      process.env.ENCRYPTION_KEY = saved;
    });
  });

  // ─── decrypt edge cases ─────────────────────────────────────

  describe('decrypt', () => {
    it('throws when encrypted is empty string', () => {
      expect(() => decrypt('')).toThrow('Cannot decrypt empty value');
    });

    it('throws on malformed input (wrong number of segments)', () => {
      expect(() => decrypt('onlyone')).toThrow('Invalid encrypted format');
      expect(() => decrypt('two:parts')).toThrow('Invalid encrypted format');
      expect(() => decrypt('four:parts:is:bad')).toThrow(
        'Invalid encrypted format',
      );
    });

    it('throws when the auth tag is tampered (integrity violation)', () => {
      const encrypted = encrypt('original');
      const [iv, _tag, ciphertext] = encrypted.split(':');
      const tamperedTag = 'f'.repeat(32); // replace tag with garbage
      expect(() => decrypt(`${iv}:${tamperedTag}:${ciphertext}`)).toThrow();
    });

    it('throws when ciphertext is tampered', () => {
      const encrypted = encrypt('original');
      const [iv, tag] = encrypted.split(':');
      const tamperedCiphertext = 'ff'.repeat(16);
      expect(() => decrypt(`${iv}:${tag}:${tamperedCiphertext}`)).toThrow();
    });
  });

  // ─── generateEncryptionKey ──────────────────────────────────

  describe('generateEncryptionKey', () => {
    it('returns a 64-character hex string', () => {
      const key = generateEncryptionKey();
      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]+$/);
    });

    it('returns different keys on each call', () => {
      expect(generateEncryptionKey()).not.toBe(generateEncryptionKey());
    });
  });

  // ─── maskSensitiveValue ─────────────────────────────────────

  describe('maskSensitiveValue', () => {
    it('shows last 4 chars by default', () => {
      expect(maskSensitiveValue('abcdefgh')).toBe('****efgh');
    });

    it('preserves sk- prefix for API keys', () => {
      expect(maskSensitiveValue('sk-abcdefgh')).toBe('sk-****efgh');
    });

    it('returns **** for short values (≤ visibleChars)', () => {
      expect(maskSensitiveValue('abc')).toBe('****');
      expect(maskSensitiveValue('')).toBe('****');
    });

    it('respects custom visibleChars', () => {
      expect(maskSensitiveValue('abcdefgh', 2)).toBe('****gh');
    });
  });

  // ─── verifyEncryption ───────────────────────────────────────

  describe('verifyEncryption', () => {
    it('returns true when encryption is working', () => {
      expect(verifyEncryption()).toBe(true);
    });

    it('returns false when ENCRYPTION_KEY is missing', () => {
      const saved = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;
      expect(verifyEncryption()).toBe(false);
      process.env.ENCRYPTION_KEY = saved;
    });
  });
});
