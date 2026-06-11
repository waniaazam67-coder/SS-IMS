const rateLimit = require("express-rate-limit");

const RATE_LIMIT_MESSAGE = "Too many requests. Please try again later.";

function jsonRateLimitHandler(req, res) {
  return res.status(429).json({ error: RATE_LIMIT_MESSAGE });
}

function createLimiter(options) {
  // TODO: Replace the default in-memory store with Redis/MySQL-backed storage before scaling beyond one Node process.
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    handler: jsonRateLimitHandler,
    ...options
  });
}

// General API read/config limiter: keeps public API endpoints from being scraped or hammered.
const generalApiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 300
});

// Login limiter: strict because repeated token/session checks can indicate credential stuffing.
const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5
});

// Signup/invite limiter: strict hourly cap for account creation and invite generation endpoints.
const signupLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 5
});

// Password reset limiter: strict hourly cap for forgot/reset-password style endpoints.
const passwordResetLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 3
});

// Write limiter: moderate cap for normal authenticated IMS write operations.
const writeLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 60
});

// Admin/settings limiter: tighter cap for privileged configuration and user/role mutations.
const adminWriteLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 30
});

module.exports = {
  adminWriteLimiter,
  generalApiLimiter,
  loginLimiter,
  passwordResetLimiter,
  signupLimiter,
  writeLimiter
};
