export class AppError extends Error {
  readonly statusCode: number;
  readonly details: string | undefined;
  readonly isOperational: boolean;

  constructor(
    statusCode: number,
    message: string,
    details?: string,
    isOperational = true,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const badRequest = (msg: string, details?: string): AppError =>
  new AppError(400, msg, details);

export const unauthorized = (msg = 'Unauthorized'): AppError =>
  new AppError(401, msg);

export const forbidden = (msg = 'Forbidden'): AppError =>
  new AppError(403, msg);

export const notFound = (msg = 'Not found'): AppError =>
  new AppError(404, msg);

export const conflict = (msg: string, details?: string): AppError =>
  new AppError(409, msg, details);

export const internalError = (msg = 'Internal server error'): AppError =>
  new AppError(500, msg, undefined, false);
