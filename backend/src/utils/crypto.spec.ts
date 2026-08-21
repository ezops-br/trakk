import { encrypt, decrypt } from './crypto';

describe('encrypt', () => {
  it('returns a string in iv:ciphertext:authTag format', () => {
    const result = encrypt('hello world');
    const parts = result.split(':');
    expect(parts).toHaveLength(3);
    parts.forEach(part => expect(part.length).toBeGreaterThan(0));
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const a = encrypt('same input');
    const b = encrypt('same input');
    expect(a).not.toBe(b);
  });
});

describe('decrypt', () => {
  it('round-trips plaintext correctly', () => {
    const original = 'super-secret-google-refresh-token';
    expect(decrypt(encrypt(original))).toBe(original);
  });

  it('round-trips text with special characters', () => {
    const original = '1/abc+xyz==\ntoken with\nnewlines';
    expect(decrypt(encrypt(original))).toBe(original);
  });

  it('throws on malformed input', () => {
    expect(() => decrypt('not-a-valid-encrypted-string')).toThrow();
  });

  it('throws when auth tag is tampered (GCM integrity check)', () => {
    const encrypted = encrypt('secret');
    const parts = encrypted.split(':');
    // Corrupt the auth tag
    const tampered = `${parts[0]}:${parts[1]}:${'0'.repeat(parts[2]!.length)}`;
    expect(() => decrypt(tampered)).toThrow();
  });
});
