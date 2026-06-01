const express = require("express");
const inventoryController = require("../controllers/inventoryController");
const { PERMISSIONS } = require("../config/permissions");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(requireAuth);

router.get("/balances", requirePermission(PERMISSIONS.VIEW_INVENTORY), inventoryController.getInventoryBalances);

router.get("/movements", requirePermission(PERMISSIONS.VIEW_INVENTORY), inventoryController.getStockMovements);

router.post("/movements", requirePermission(PERMISSIONS.MANAGE_INVENTORY), inventoryController.createStockMovement);

module.exports = router;
