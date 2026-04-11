import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many registration attempts, please try again later'
})

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts, please try again later'
})

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, 
  max: 3, 
  message: { error: 'Too many password reset requests, please try again after an hour' }
});

export const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 5,
  message: { error: 'Too many password change attempts, please try again later' }
});

export const emailChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, 
  max: 3,
  message: { error: 'Too many email change requests, please try again after an hour' }
});

export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 20, 
  message: { error: 'Too many token refresh attempts, please try again later' }
});