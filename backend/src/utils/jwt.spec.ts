import { signAccessToken, verifyToken } from './jwt';

const payload = { userId: 'user-123', email: 'alice@test.com' };

describe('signAccessToken', () => {
  it('returns a JWT string', () => {
    const token = signAccessToken(payload);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });
});

describe('verifyToken', () => {
  it('decodes a token signed by signAccessToken', () => {
    const token = signAccessToken(payload);
    const decoded = verifyToken(token);
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.email).toBe(payload.email);
  });

  it('throws on a tampered token', () => {
    const token = signAccessToken(payload);
    const tampered = token.slice(0, -3) + 'xxx';
    expect(() => verifyToken(tampered)).toThrow();
  });

  it('throws on a completely invalid string', () => {
    expect(() => verifyToken('not.a.token')).toThrow();
  });
});
