const authService = require("../services/authService");

function getBearerToken(req) {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

async function requireAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    // #region debug-point M:backend-require-auth-start
    fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"signin-stale-user",runId:"pre-fix",hypothesisId:"M",location:"authMiddleware.js:requireAuth:start",msg:"[DEBUG] backend requireAuth started",data:{path:req.originalUrl||req.url||"",hasToken:Boolean(token),tokenLength:String(token||"").length},ts:Date.now()})}).catch(()=>{});
    // #endregion
    const context = await authService.resolveAuthContextFromToken(token);

    if (!context) {
      const error = new Error("Authentication required.");
      error.statusCode = 401;
      throw error;
    }

    // #region debug-point N:backend-require-auth-success
    fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"signin-stale-user",runId:"pre-fix",hypothesisId:"N",location:"authMiddleware.js:requireAuth:success",msg:"[DEBUG] backend requireAuth resolved context",data:{path:req.originalUrl||req.url||"",userId:context?.user?.id||"",email:context?.user?.email||"",roles:context?.roles||[]},ts:Date.now()})}).catch(()=>{});
    // #endregion
    req.auth = context;
    next();
  } catch (error) {
    // #region debug-point O:backend-require-auth-error
    fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"signin-stale-user",runId:"pre-fix",hypothesisId:"O",location:"authMiddleware.js:requireAuth:error",msg:"[DEBUG] backend requireAuth failed",data:{path:req.originalUrl||req.url||"",message:error?.message||"",statusCode:error?.statusCode||""},ts:Date.now()})}).catch(()=>{});
    // #endregion
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
