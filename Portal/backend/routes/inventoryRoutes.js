const express = require("express");
const inventoryController = require("../controllers/inventoryController");

const router = express.Router();

router.get("/balances", inventoryController.getInventoryBalances);

router.get("/movements", inventoryController.getStockMovements);

router.post("/movements", inventoryController.createStockMovement);

module.exports = router;
