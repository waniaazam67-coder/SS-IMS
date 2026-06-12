const express = require("express");
const authService = require("../services/authService");
const { PERMISSIONS } = require("../config/permissions");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const { adminWriteLimiter, sessionLimiter, signupLimiter } = require("../middleware/rateLimitMiddleware");
const { ok } = require("../utils/apiResponse");
const v = require("../utils/validation");

const router = express.Router();

// Session/profile checks are frequent during normal portal use, so they use a lenient bucket separate from login/signup.
router.get("/me", sessionLimiter, requireAuth, (req, res) => {
  ok(res, req.auth);
});

router.get("/users", requireAuth, requirePermission(PERMISSIONS.MANAGE_USERS), async (req, res, next) => {
  try {
    ok(res, { users: await authService.listUsers() });
  } catch (error) {
    next(error);
  }
});

router.post("/users", signupLimiter, requireAuth, requirePermission(PERMISSIONS.MANAGE_USERS), v.validateBody(createUserBody), async (req, res, next) => {
  try {
    const origin = `${req.protocol}://${req.get("host")}`;
    const user = await authService.createUser({ ...req.body, inviteBaseUrl: origin }, req.auth.user.id);
    ok(res, { user, message: "User added." }, 201);
  } catch (error) {
    next(error);
  }
});

router.get("/roles", requireAuth, requirePermission(PERMISSIONS.MANAGE_ROLES), async (req, res, next) => {
  try {
    ok(res, { roles: await authService.listRoles() });
  } catch (error) {
    next(error);
  }
});

router.post("/roles", adminWriteLimiter, requireAuth, requirePermission(PERMISSIONS.MANAGE_ROLES), v.validateBody(roleBody), async (req, res, next) => {
  try {
    const role = await authService.createRole(req.body, req.auth.user.id);
    ok(res, { role, message: "Role created." }, 201);
  } catch (error) {
    next(error);
  }
});

router.delete("/roles/:role", adminWriteLimiter, requireAuth, requirePermission(PERMISSIONS.MANAGE_ROLES), v.validateParams(roleParam), async (req, res, next) => {
  try {
    await authService.deleteRole(req.params.role);
    ok(res, { message: "Role deleted." });
  } catch (error) {
    next(error);
  }
});

router.post("/users/:userId/roles", adminWriteLimiter, requireAuth, requirePermission(PERMISSIONS.MANAGE_ROLES), v.validateParams(userIdParam), v.validateBody(assignRoleBody), async (req, res, next) => {
  try {
    await authService.assignRoleToUser(Number(req.params.userId), req.body.role, req.auth.user.id);
    ok(res, { message: "Role assigned." });
  } catch (error) {
    next(error);
  }
});

router.put("/users/:userId/roles", adminWriteLimiter, requireAuth, requirePermission(PERMISSIONS.MANAGE_ROLES), v.validateParams(userIdParam), v.validateBody(setRolesBody), async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (userId === Number(req.auth.user.id) && !Array.isArray(req.body.roles)) {
      const error = new Error("roles must be an array.");
      error.statusCode = 400;
      throw error;
    }
    const selfRoles = req.body.roles.map((role) => String(role).toLowerCase().replace(/[\s-]+/g, "_"));
    if (userId === Number(req.auth.user.id) && !selfRoles.some((role) => role === "admin" || role === "superadmin")) {
      const error = new Error("You cannot remove admin or superadmin from your own account.");
      error.statusCode = 400;
      throw error;
    }
    const updatedUser = await authService.setUserRoles(userId, req.body.roles, req.auth.user.id);
    ok(res, { user: updatedUser, message: "User roles updated." });
  } catch (error) {
    next(error);
  }
});

router.put("/users/:userId/status", adminWriteLimiter, requireAuth, requirePermission(PERMISSIONS.MANAGE_USERS), v.validateParams(userIdParam), v.validateBody(statusBody), async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const isActive = req.body.isActive === true || req.body.isActive === "true" || req.body.isActive === 1 || req.body.isActive === "1";
    if (userId === Number(req.auth.user.id) && !isActive) {
      const error = new Error("You cannot deactivate your own account.");
      error.statusCode = 400;
      throw error;
    }
    const updatedUser = await authService.setUserActiveStatus(userId, isActive, req.auth.user.id);
    ok(res, { user: updatedUser, message: updatedUser.isActive ? "User activated." : "User deactivated." });
  } catch (error) {
    next(error);
  }
});

router.delete("/users/:userId/roles/:role", adminWriteLimiter, requireAuth, requirePermission(PERMISSIONS.MANAGE_ROLES), v.validateParams(userRoleParams), async (req, res, next) => {
  try {
    await authService.removeRoleFromUser(Number(req.params.userId), req.params.role);
    ok(res, { message: "Role removed." });
  } catch (error) {
    next(error);
  }
});

router.delete("/users/:userId", adminWriteLimiter, requireAuth, requirePermission(PERMISSIONS.MANAGE_USERS), v.validateParams(userIdParam), async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (userId === Number(req.auth.user.id)) {
      const error = new Error("You cannot delete your own account.");
      error.statusCode = 400;
      throw error;
    }
    await authService.deleteUser(userId, req.auth.user.id);
    ok(res, { message: "User deleted." });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

function userIdParam(input) {
  return { userId: v.positiveInt(input.userId, "userId") };
}

function roleParam(input) {
  return { role: roleName(input.role, "role") };
}

function userRoleParams(input) {
  return { userId: v.positiveInt(input.userId, "userId"), role: roleName(input.role, "role") };
}

function roleName(value, field) {
  const clean = v.requiredText(value, field, 80);
  if (!/^[A-Za-z][A-Za-z0-9 _-]{1,79}$/.test(clean)) v.badRequest("contains invalid characters.", field);
  return clean;
}

function createUserBody(input) {
  return {
    name: v.requiredText(input.name || input.fullName, "name", 180),
    fullName: v.requiredText(input.fullName || input.name, "fullName", 180),
    email: v.email(input.email, "email", { required: true }),
    roles: Array.isArray(input.roles) ? input.roles.map((role, index) => roleName(role, `roles[${index}]`)) : undefined
  };
}

function roleBody(input) {
  return {
    name: roleName(input.name || input.label, "name"),
    label: roleName(input.label || input.name, "label"),
    description: v.optionalText(input.description, "description", 500)
  };
}

function assignRoleBody(input) {
  return { role: roleName(input.role, "role") };
}

function setRolesBody(input) {
  return { roles: v.array(input.roles, "roles", { min: 1, max: 50 }).map((role, index) => roleName(role, `roles[${index}]`)) };
}

function statusBody(input) {
  if (![true, false, "true", "false", "1", "0", 1, 0].includes(input.isActive)) {
    v.badRequest("must be a boolean.", "isActive");
  }
  return { isActive: input.isActive };
}
