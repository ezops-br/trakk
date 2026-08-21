import type { Request, Response, NextFunction } from 'express';
import { unauthorized } from '../lib/app-error';
import { verifyToken } from '../utils/jwt';

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token: string | undefined = req.cookies?.trakk_session;
  if (!token) {
    next(unauthorized());
    return;
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    next(unauthorized());
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token: string | undefined = req.cookies?.trakk_session;
  if (!token) {
    req.user = null;
    next();
    return;
  }
  try {
    req.user = verifyToken(token);
  } catch {
    req.user = null;
  }
  next();
}
