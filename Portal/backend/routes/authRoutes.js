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

router.delete("/users/:userId/roles/:role", requireAuth, requirePermission(PERMISSIONS.MANAGE_ROLES), async (req, res, next) => {
  try {
    await authService.removeRoleFromUser(Number(req.params.userId), req.params.role);
    ok(res, { message: "Role removed." });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
