import {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  internalError,
} from './app-error';

describe('AppError', () => {
  it('sets all properties from constructor', () => {
    const err = new AppError(422, 'Unprocessable', 'field x is invalid', true);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(422);
    expect(err.message).toBe('Unprocessable');
    expect(err.details).toBe('field x is invalid');
    expect(err.isOperational).toBe(true);
    expect(err.name).toBe('AppError');
  });

  it('defaults isOperational to true', () => {
    expect(new AppError(400, 'bad').isOperational).toBe(true);
  });

  it('has a stack trace', () => {
    expect(new AppError(400, 'oops').stack).toBeDefined();
  });
});

describe('factory functions', () => {
  it('badRequest returns 400', () => {
    const e = badRequest('Invalid input', 'name: required');
    expect(e.statusCode).toBe(400);
    expect(e.message).toBe('Invalid input');
    expect(e.details).toBe('name: required');
  });

  it('unauthorized returns 401 with default message', () => {
    const e = unauthorized();
    expect(e.statusCode).toBe(401);
    expect(e.message).toBe('Unauthorized');
  });

  it('unauthorized accepts custom message', () => {
    expect(unauthorized('Token expired').message).toBe('Token expired');
  });

  it('forbidden returns 403', () => {
    expect(forbidden().statusCode).toBe(403);
  });

  it('notFound returns 404', () => {
    expect(notFound('Project not found').statusCode).toBe(404);
  });

  it('conflict returns 409', () => {
    const e = conflict('Key already exists', 'key: DEMO is taken');
    expect(e.statusCode).toBe(409);
    expect(e.details).toBe('key: DEMO is taken');
  });

  it('internalError returns 500 and isOperational false', () => {
    const e = internalError();
    expect(e.statusCode).toBe(500);
    expect(e.isOperational).toBe(false);
  });
});
