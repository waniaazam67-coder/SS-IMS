const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const RATE_LIMIT_MESSAGE = "Too many attempts. Please wait a few minutes and try again.";
const RATE_LIMIT_ENABLED = String(process.env.RATE_LIMIT_ENABLED ?? "true").trim().toLowerCase() !== "false";
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const sharedWindowMs = envInt("GENERAL_RATE_LIMIT_WINDOW_MS", FIFTEEN_MINUTES_MS);

function envInt(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function retryAfterSeconds(req) {
  const resetTime = req.rateLimit?.resetTime;
  if (!resetTime || typeof resetTime.getTime !== "function") return undefined;
  return Math.max(0, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
}

function jsonRateLimitHandler(limiterName) {
  return function rateLimitHandler(req, res) {
    const retryAfter = retryAfterSeconds(req);

    console.warn("Rate limit exceeded", {
      limiterName,
      method: req.method,
      path: req.originalUrl || req.path,
      ip: req.ip || "unknown",
      userEmail: req.auth?.user?.email || null
    });

    return res.status(429).json({
      success: false,
      message: RATE_LIMIT_MESSAGE,
      code: "RATE_LIMITED",
      limiter: limiterName,
      retryAfter
    });
  };
}

function clientIpKeyGenerator(req) {
  // Express derives req.ip from proxy headers only when server.js has the correct trust proxy hop count.
  // Use express-rate-limit's helper so IPv6 clients cannot rotate addresses to bypass limits.
  return req.ip ? ipKeyGenerator(req.ip) : "unknown";
}

function skipNonReadRequests(req) {
  return !["GET", "HEAD", "OPTIONS"].includes(req.method);
}

function skipSessionRoute(req) {
  return String(req.path || "").replace(/\/+$/, "") === "/auth/me";
}

function createLimiter(limiterName, options) {
  if (!RATE_LIMIT_ENABLED) {
    return (req, res, next) => next();
  }

  // TODO: Replace the default in-memory store with Redis/MySQL-backed storage before scaling beyond one Node process.
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: clientIpKeyGenerator,
    handler: jsonRateLimitHandler(limiterName),
    ...options
  });
}

// General read/config limiter: lenient safety net for GET/HEAD/OPTIONS only.
const generalApiLimiter = createLimiter("generalApiLimiter", {
  windowMs: sharedWindowMs,
  limit: envInt("GENERAL_RATE_LIMIT_MAX", 3000),
  skip: (req) => skipNonReadRequests(req) || skipSessionRoute(req)
});

// Session/profile limiter: /api/auth/me refresh checks are frequent during normal portal use.
const sessionLimiter = createLimiter("sessionLimiter", {
  windowMs: sharedWindowMs,
  limit: envInt("SESSION_RATE_LIMIT_MAX", 1000)
});

// Login limiter: for any future backend credential-login endpoint. Current Firebase login happens client-side.
const loginLimiter = createLimiter("loginLimiter", {
  windowMs: sharedWindowMs,
  limit: envInt("LOGIN_RATE_LIMIT_MAX", 30)
});

// Signup/invite limiter: strict hourly cap for account creation and invite generation endpoints.
const signupLimiter = createLimiter("signupLimiter", {
  windowMs: ONE_HOUR_MS,
  limit: envInt("SIGNUP_RATE_LIMIT_MAX", 20)
});

// Password reset limiter: strict hourly cap for forgot/reset-password style endpoints.
const passwordResetLimiter = createLimiter("passwordResetLimiter", {
  windowMs: ONE_HOUR_MS,
  limit: envInt("PASSWORD_RESET_RATE_LIMIT_MAX", 5)
});

// Write limiter: moderate cap for normal authenticated IMS write operations.
const writeLimiter = createLimiter("writeLimiter", {
  windowMs: sharedWindowMs,
  limit: envInt("WRITE_RATE_LIMIT_MAX", 500)
});

// Admin/settings limiter: tighter cap for privileged configuration and user/role mutations.
const adminWriteLimiter = createLimiter("adminWriteLimiter", {
  windowMs: sharedWindowMs,
  limit: envInt("ADMIN_WRITE_RATE_LIMIT_MAX", 300)
});

module.exports = {
  adminWriteLimiter,
  generalApiLimiter,
  loginLimiter,
  passwordResetLimiter,
  sessionLimiter,
  signupLimiter,
  writeLimiter
};
