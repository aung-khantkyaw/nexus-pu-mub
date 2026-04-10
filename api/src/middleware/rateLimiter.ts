import rateLimit from 'express-rate-limit';

const FIFTEEN_MS = 15 * 60 * 1000;

export const apiLimiter = rateLimit({
  windowMs: FIFTEEN_MS,
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const registerLimiter = rateLimit({
  windowMs: FIFTEEN_MS,
  max: 5,
  message: 'Too many registration attempts, please try again later'
})

export const loginLimiter = rateLimit({
  windowMs: FIFTEEN_MS,
  max: 5,
  message: 'Too many login attempts, please try again later'
})