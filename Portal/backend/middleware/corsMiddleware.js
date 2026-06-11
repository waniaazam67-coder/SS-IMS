const config = require("../config/env");

const DEV_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

function normalizeOrigin(origin) {
  return String(origin || "").trim().replace(/\/+$/, "");
}

function isAllowedOrigin(origin) {
  const cleanOrigin = normalizeOrigin(origin);
  if (!cleanOrigin) return true;
  if (config.corsOrigins.includes(cleanOrigin)) return true;
  return !config.isProduction && DEV_ORIGINS.has(cleanOrigin);
}

function corsMiddleware(req, res, next) {
  const origin = normalizeOrigin(req.headers.origin);
  if (origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({ error: "CORS origin is not allowed." });
  }

  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
}

module.exports = {
  corsMiddleware
};
