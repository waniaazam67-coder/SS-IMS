const authService = require("../services/authService");

function getBearerToken(req) {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

async function requireAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    const context = await authService.resolveAuthContextFromToken(token);

    if (!context) {
      const error = new Error("Authentication required.");
      error.statusCode = 401;
      throw error;
    }

    req.auth = context;
    next();
  } catch (error) {
    next(error);
  }
}

function requirePermission(permission) {
  return function permissionMiddleware(req, res, next) {
    const permissions = new Set(req.auth?.permissions || []);

    if (!permissions.has(permission)) {
      const error = new Error("You do not have permission to perform this action.");
      error.statusCode = 403;
      return next(error);
    }

    return next();
  };
}

module.exports = {
  requireAuth,
  requirePermission
};
