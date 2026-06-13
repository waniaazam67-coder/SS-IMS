const path = require("path");
const express = require("express");
const config = require("./config/env");
const settingsRoutes = require("./routes/settingsRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const imsRoutes = require("./routes/imsRoutes");
const authRoutes = require("./routes/authRoutes");
const chatRoutes = require("./routes/chatRoutes");
const { errorHandler, notFoundHandler } = require("./middleware/errorMiddleware");
const { corsMiddleware } = require("./middleware/corsMiddleware");
const { generalApiLimiter } = require("./middleware/rateLimitMiddleware");
const { requireAuth, requirePermission } = require("./middleware/authMiddleware");
const { PERMISSIONS } = require("./config/permissions");
const { initializeDatabase, testDatabaseConnection } = require("./config/database");
const { assertFirebaseAdminReady } = require("./services/authService");

const app = express();
const PORT = config.port;
const frontendPath = path.resolve(__dirname, "../frontend");
const requisitionFormPath = path.resolve(__dirname, "../../Requisition-From");
const grnInvoiceUploadsPath = path.resolve(__dirname, "../uploads/grn-invoices");

// Hostinger sits in front of Node as a reverse proxy. Trust exactly one proxy hop so Express derives req.ip
// from the proxy-provided client IP, without blindly trusting arbitrary client-supplied forwarding chains.
app.set("trust proxy", 1);
app.use(corsMiddleware);
app.use(securityHeaders);
app.use(express.json({ limit: "1mb" }));
app.use(express.static(frontendPath, {
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html") || filePath.endsWith(".css") || filePath.endsWith(".js")) {
      res.setHeader("Cache-Control", "no-store");
    }
  }
}));
app.use("/uploads/grn-invoices", requireAuth, requirePermission(PERMISSIONS.MANAGE_GRNS), express.static(grnInvoiceUploadsPath, {
  fallthrough: false,
  setHeaders(res) {
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", "inline");
  }
}));
app.get("/requisition-form", (req, res, next) => {
  return res.sendFile(path.join(requisitionFormPath, "Form.html"), next);
});

app.get("/requisition-form/", (req, res, next) => {
  return res.sendFile(path.join(requisitionFormPath, "Form.html"), next);
});
app.use("/requisition-form", express.static(requisitionFormPath, {
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-store");
    }
  }
}));

app.get("/api/health", (req, res) => {
  res.json({ success: true, data: { status: "ok" } });
});

app.get("/api/health/deep", async (req, res, next) => {
  try {
    if (config.isProduction) return notFoundHandler(req, res);
    await testDatabaseConnection();
    res.json({ success: true, data: { status: "ok", database: "ok" } });
  } catch (error) {
    next(error);
  }
});

app.get("/api/firebase-config", (req, res) => {
  res.json({ success: true, firebase: config.firebase.web });
});

// Rate limiting strategy:
// - generalApiLimiter: lenient GET/HEAD/OPTIONS read safety net only; skips /api/auth/me.
// - sessionLimiter: applied in authRoutes to /api/auth/me refresh/profile checks.
// - signupLimiter/passwordResetLimiter/loginLimiter: public auth-sensitive buckets when those endpoints exist.
// - writeLimiter/adminWriteLimiter: applied inside route modules to mutation endpoints.
app.use("/api", generalApiLimiter);

app.use("/api", imsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/inventory", inventoryRoutes);

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return notFoundHandler(req, res);
  return res.sendFile(path.join(frontendPath, "index.html"), next);
});

app.use(errorHandler);

async function startServer() {
  try {
    config.validateEnvironmentConfig();
    if (config.isProduction) assertFirebaseAdminReady();
    await initializeDatabase();
    await testDatabaseConnection();
    const server = app.listen(PORT, () => {
      console.log(`IMS server running at http://localhost:${PORT}`);
    });
    server.on("error", (error) => {
      if (error?.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use. Stop the existing IMS backend before starting a new one.`);
        process.exit(1);
      }
      console.error("Failed to start IMS server.");
      console.error(error.message);
      process.exit(1);
    });
  } catch (error) {
    if (error?.code === "ENV_VALIDATION_FAILED") {
      console.error("IMS server configuration is invalid.");
      console.error(error.message);
      process.exit(1);
    }
    console.error("Failed to initialize IMS database connection.");
    console.error(error.message);
    process.exit(1);
  }
}

startServer();

function securityHeaders(req, res, next) {
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // TODO: Remove 'unsafe-inline' after generated dashboard HTML no longer emits inline onclick handlers.
    "script-src 'self' 'unsafe-inline' https://unpkg.com https://www.gstatic.com https://www.google.com https://apis.google.com",
    "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://firebaseinstallations.googleapis.com https://firebaseappcheck.googleapis.com",
    "frame-src 'self' https://www.google.com https://*.firebaseapp.com",
    "form-action 'self'"
  ].join("; ");
  res.setHeader("Content-Security-Policy", csp);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return next();
}
