const inventoryService = require("../services/inventoryService");
const { ok } = require("../utils/apiResponse");

async function getInventoryBalances(req, res, next) {
  try {
    const result = await inventoryService.listInventoryBalances(req.query);
    return ok(res, { inventory: result.rows, pagination: result.pagination });
  } catch (error) {
    return next(error);
  }
}

async function getStockMovements(req, res, next) {
  try {
    const result = await inventoryService.listStockMovements(req.query);
    return ok(res, { movements: result.rows, pagination: result.pagination });
  } catch (error) {
    return next(error);
  }
}

async function createStockMovement(req, res, next) {
  try {
    const createdBy = req.auth.user.id;
    const result = await inventoryService.postStockMovement({ ...req.body, createdBy });
    return ok(res, result, 201);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getInventoryBalances,
  getStockMovements,
  createStockMovement
};
