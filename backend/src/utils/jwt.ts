import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface TokenPayload {
  userId: string;
  email: string;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRY as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, config.JWT_SECRET);
  if (
    typeof decoded === 'string' ||
    !decoded ||
    typeof (decoded as TokenPayload).userId !== 'string' ||
    typeof (decoded as TokenPayload).email !== 'string'
  ) {
    throw new Error('Invalid token payload');
  }
  return decoded as TokenPayload;
}
