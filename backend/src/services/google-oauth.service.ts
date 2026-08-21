import crypto from 'node:crypto';
import { createGoogleOAuth2Client } from '../utils/google-client';
import { decrypt } from '../utils/crypto';
import { AppError } from '../lib/app-error';

export function generateAuthUrl(): { url: string; state: string } {
  const oauth2Client = createGoogleOAuth2Client();
  const state = crypto.randomBytes(32).toString('hex');
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    state,
  });
  return { url, state };
}

export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  id_token: string;
  expiry_date: number;
}> {
  try {
    const oauth2Client = createGoogleOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.access_token || !tokens.id_token) {
      throw new AppError(500, 'Token exchange failed');
    }
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? undefined,
      id_token: tokens.id_token,
      expiry_date: tokens.expiry_date ?? Date.now() + 3600000,
    };
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(500, 'Token exchange failed');
  }
}

export function decodeIdToken(idToken: string): {
  sub: string;
  email: string;
  name: string;
  picture?: string | null;
} {
  const segments = idToken.split('.');
  const segment = segments[1];
  const payload = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  if (
    typeof payload.sub !== 'string' || payload.sub === '' ||
    typeof payload.email !== 'string' || payload.email === '' ||
    typeof payload.name !== 'string' || payload.name === ''
  ) {
    throw new AppError(500, 'Invalid id_token payload');
  }
  return {
    sub: payload.sub as string,
    email: payload.email as string,
    name: payload.name as string,
    picture: payload.picture as string | undefined,
  };
}

export async function revokeToken(refreshToken: string): Promise<void> {
  try {
    const oauth2Client = createGoogleOAuth2Client();
    await oauth2Client.revokeToken(refreshToken);
  } catch {
    // best-effort: swallow all errors silently
  }
}

// Decrypts a stored refresh token and exchanges it for a fresh access token.
// Throws if the token is revoked or the refresh otherwise fails.
export async function getRefreshedAccessToken(
  encryptedRefreshToken: string,
): Promise<string> {
  let refreshToken: string;
  try {
    refreshToken = decrypt(encryptedRefreshToken);
  } catch {
    throw new AppError(500, 'Failed to decrypt refresh token');
  }

  try {
    const oauth2Client = createGoogleOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await oauth2Client.refreshAccessToken();
    if (!credentials.access_token) {
      throw new AppError(401, 'Failed to refresh access token');
    }
    return credentials.access_token;
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(401, 'Failed to refresh access token');
  }
}

export function verifyState(cookieState: string, queryState: string): boolean {
  if (!cookieState || !queryState) {
    return false;
  }
  if (cookieState.length !== queryState.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(cookieState), Buffer.from(queryState));
}
