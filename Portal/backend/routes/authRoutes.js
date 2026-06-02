const express = require("express");
const authService = require("../services/authService");
const { PERMISSIONS } = require("../config/permissions");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const { ok } = require("../utils/apiResponse");

const router = express.Router();

router.get("/me", requireAuth, (req, res) => {
  ok(res, req.auth);
});

router.get("/users", requireAuth, requirePermission(PERMISSIONS.MANAGE_USERS), async (req, res, next) => {
  try {
    ok(res, { users: await authService.listUsers() });
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

router.post("/users/:userId/roles", requireAuth, requirePermission(PERMISSIONS.MANAGE_ROLES), async (req, res, next) => {
  try {
    await authService.assignRoleToUser(Number(req.params.userId), req.body.role, req.auth.user.id);
    ok(res, { message: "Role assigned." });
  } catch (error) {
    next(error);
  }
});

router.put("/users/:userId/roles", requireAuth, requirePermission(PERMISSIONS.MANAGE_ROLES), async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (userId === Number(req.auth.user.id) && !Array.isArray(req.body.roles)) {
      const error = new Error("roles must be an array.");
      error.statusCode = 400;
      throw error;
    }
    if (userId === Number(req.auth.user.id) && !req.body.roles.map((role) => String(role).toLowerCase()).includes("admin")) {
      const error = new Error("You cannot remove admin from your own account.");
      error.statusCode = 400;
      throw error;
    }
    const updatedUser = await authService.setUserRoles(userId, req.body.roles, req.auth.user.id);
    ok(res, { user: updatedUser, message: "User roles updated." });
  } catch (error) {
    next(error);
  }
});

router.put("/users/:userId/status", requireAuth, requirePermission(PERMISSIONS.MANAGE_USERS), async (req, res, next) => {
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

router.delete("/users/:userId/roles/:role", requireAuth, requirePermission(PERMISSIONS.MANAGE_ROLES), async (req, res, next) => {
  try {
    await authService.removeRoleFromUser(Number(req.params.userId), req.params.role);
    ok(res, { message: "Role removed." });
  } catch (error) {
    next(error);
  }
});

router.delete("/users/:userId", requireAuth, requirePermission(PERMISSIONS.MANAGE_USERS), async (req, res, next) => {
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
