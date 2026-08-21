import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { validate } from './validate';
import { AppError } from '../lib/app-error';

function makeReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, query: {}, params: {}, ...overrides } as Request;
}
const res = {} as Response;

describe('validate middleware', () => {
  const schema = z.object({ name: z.string().min(1), age: z.coerce.number() });

  it('calls next() with no error when data is valid', () => {
    const next = jest.fn() as NextFunction;
    const req = makeReq({ body: { name: 'Alice', age: '30' } });
    validate(schema)(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('coerces and replaces req.body with parsed output', () => {
    const next = jest.fn() as NextFunction;
    const req = makeReq({ body: { name: 'Alice', age: '30' } });
    validate(schema)(req, res, next);
    expect(req.body.age).toBe(30);
  });

  it('calls next(AppError 400) when body is invalid', () => {
    const next = jest.fn() as NextFunction;
    const req = makeReq({ body: { name: '', age: 'nope' } });
    validate(schema)(req, res, next);
    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.details).toContain('name');
  });

  it('validates req.query when source is "query"', () => {
    const qSchema = z.object({ page: z.coerce.number().default(1) });
    const next = jest.fn() as NextFunction;
    const req = makeReq({ query: { page: '2' } } as unknown as Partial<Request>);
    validate(qSchema, 'query')(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('validates req.params when source is "params"', () => {
    const pSchema = z.object({ id: z.string().uuid() });
    const next = jest.fn() as NextFunction;
    const req = makeReq({ params: { id: 'not-a-uuid' } } as unknown as Partial<Request>);
    validate(pSchema, 'params')(req, res, next);
    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err.statusCode).toBe(400);
  });
});
