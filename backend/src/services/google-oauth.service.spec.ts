import {
  generateAuthUrl,
  exchangeCodeForTokens,
  decodeIdToken,
  revokeToken,
  verifyState,
} from './google-oauth.service';
import { AppError } from '../lib/app-error';

// Mock the google-client utility
const mockGenerateAuthUrl = jest.fn();
const mockGetToken = jest.fn();
const mockRevokeToken = jest.fn();

const mockOAuth2Client = {
  generateAuthUrl: mockGenerateAuthUrl,
  getToken: mockGetToken,
  revokeToken: mockRevokeToken,
};

jest.mock('../utils/google-client', () => ({
  createGoogleOAuth2Client: jest.fn(() => mockOAuth2Client),
}));

// Helper: build a minimal base64url-encoded id_token with a given payload
function buildIdToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fakesignature`;
}

describe('generateAuthUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateAuthUrl.mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?mock=1');
  });

  it('returns an object with a url string and a 64-character hex state string', () => {
    // Act
    const result = generateAuthUrl();

    // Assert
    expect(typeof result.url).toBe('string');
    expect(result.url.length).toBeGreaterThan(0);
    expect(typeof result.state).toBe('string');
    expect(result.state).toHaveLength(64);
    expect(result.state).toMatch(/^[0-9a-f]{64}$/);
  });

  it('includes all required scopes in the generated URL', () => {
    // Act
    generateAuthUrl();

    // Assert
    const callArgs = mockGenerateAuthUrl.mock.calls[0][0] as { scope: string[] };
    const scopes = callArgs?.scope ?? [];
    expect(scopes).toEqual(
      expect.arrayContaining([
        expect.stringContaining('userinfo.email'),
        expect.stringContaining('userinfo.profile'),
        expect.stringContaining('calendar'),
      ]),
    );
  });
});

describe('exchangeCodeForTokens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns token fields { access_token, id_token, expiry_date } on success', async () => {
    // Arrange
    const fakeTokens = {
      access_token: 'acc-token',
      id_token: 'id-token',
      expiry_date: 9999999999,
    };
    mockGetToken.mockResolvedValue({ tokens: fakeTokens });

    // Act
    const result = await exchangeCodeForTokens('auth-code-123');

    // Assert
    expect(result.access_token).toBe('acc-token');
    expect(result.id_token).toBe('id-token');
    expect(result.expiry_date).toBe(9999999999);
  });

  it('includes refresh_token in result when Google provides one', async () => {
    // Arrange
    const fakeTokens = {
      access_token: 'acc-token',
      id_token: 'id-token',
      refresh_token: 'refresh-token',
      expiry_date: 9999999999,
    };
    mockGetToken.mockResolvedValue({ tokens: fakeTokens });

    // Act
    const result = await exchangeCodeForTokens('auth-code-123');

    // Assert
    expect(result.refresh_token).toBe('refresh-token');
  });

  it('omits refresh_token from result when Google does not provide one', async () => {
    // Arrange
    const fakeTokens = {
      access_token: 'acc-token',
      id_token: 'id-token',
      expiry_date: 9999999999,
    };
    mockGetToken.mockResolvedValue({ tokens: fakeTokens });

    // Act
    const result = await exchangeCodeForTokens('auth-code-123');

    // Assert
    expect(result.refresh_token).toBeUndefined();
  });

  it('throws internalError when the Google getToken call fails', async () => {
    // Arrange
    mockGetToken.mockRejectedValue(new Error('Network error'));

    // Act & Assert
    await expect(exchangeCodeForTokens('bad-code')).rejects.toThrow(AppError);
    await expect(exchangeCodeForTokens('bad-code')).rejects.toMatchObject({ statusCode: 500 });
  });

  it('throws internalError when access_token is absent from the Google response', async () => {
    // Arrange
    mockGetToken.mockResolvedValue({ tokens: { id_token: 'id-token', expiry_date: 999 } });

    // Act & Assert
    await expect(exchangeCodeForTokens('code')).rejects.toThrow(AppError);
    await expect(exchangeCodeForTokens('code')).rejects.toMatchObject({ statusCode: 500 });
  });

  it('throws internalError when id_token is absent from the Google response', async () => {
    // Arrange
    mockGetToken.mockResolvedValue({ tokens: { access_token: 'acc-token', expiry_date: 999 } });

    // Act & Assert
    await expect(exchangeCodeForTokens('code')).rejects.toThrow(AppError);
    await expect(exchangeCodeForTokens('code')).rejects.toMatchObject({ statusCode: 500 });
  });
});

describe('decodeIdToken', () => {
  it('extracts { sub, email, name, picture } from a valid base64url-encoded id_token payload', () => {
    // Arrange
    const payload = {
      sub: 'google-sub-abc',
      email: 'alice@example.com',
      name: 'Alice Smith',
      picture: 'https://example.com/pic.jpg',
    };
    const idToken = buildIdToken(payload);

    // Act
    const result = decodeIdToken(idToken);

    // Assert
    expect(result.sub).toBe('google-sub-abc');
    expect(result.email).toBe('alice@example.com');
    expect(result.name).toBe('Alice Smith');
    expect(result.picture).toBe('https://example.com/pic.jpg');
  });

  it('throws internalError when payload is missing the sub field', () => {
    // Arrange
    const idToken = buildIdToken({ email: 'alice@example.com', name: 'Alice' });

    // Act & Assert
    expect(() => decodeIdToken(idToken)).toThrow(AppError);
    expect(() => decodeIdToken(idToken)).toThrow(expect.objectContaining({ statusCode: 500 }));
  });

  it('throws internalError when payload is missing the email field', () => {
    // Arrange
    const idToken = buildIdToken({ sub: 'google-sub-abc', name: 'Alice' });

    // Act & Assert
    expect(() => decodeIdToken(idToken)).toThrow(AppError);
    expect(() => decodeIdToken(idToken)).toThrow(expect.objectContaining({ statusCode: 500 }));
  });
});

describe('revokeToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls oauth2Client.revokeToken with the provided token', async () => {
    // Arrange
    mockRevokeToken.mockResolvedValue({});

    // Act
    await revokeToken('my-refresh-token');

    // Assert
    expect(mockRevokeToken).toHaveBeenCalledWith('my-refresh-token');
  });

  it('does not throw when the Google revokeToken call fails', async () => {
    // Arrange
    mockRevokeToken.mockRejectedValue(new Error('Revoke failed'));

    // Act & Assert
    await expect(revokeToken('my-token')).resolves.not.toThrow();
  });
});

describe('verifyState', () => {
  it('returns true when cookieState and queryState are identical', () => {
    expect(verifyState('abc123', 'abc123')).toBe(true);
  });

  it('returns false when cookieState and queryState differ', () => {
    expect(verifyState('abc123', 'xyz789')).toBe(false);
  });

  it('returns false when cookieState is empty string', () => {
    expect(verifyState('', 'abc123')).toBe(false);
  });

  it('returns false when queryState is empty string', () => {
    expect(verifyState('abc123', '')).toBe(false);
  });
});
