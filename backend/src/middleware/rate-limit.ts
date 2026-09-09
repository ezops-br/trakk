import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';

export const authRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
  skip: () => isTest,
});

// Higher limit than authRateLimit: this route also receives bounced traffic
// relayed from every active sandbox deployment, not just prod's own logins.
export const authCallbackRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
  skip: () => isTest,
});

export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
  skip: () => isTest,
});
