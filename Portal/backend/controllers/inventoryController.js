const inventoryService = require("../services/inventoryService");
const { ok } = require("../utils/apiResponse");
const v = require("../utils/validation");

async function getInventoryBalances(req, res, next) {
  try {
    const result = await inventoryService.listInventoryBalances(inventoryQuery(req.query));
    return ok(res, { inventory: result.rows, pagination: result.pagination });
  } catch (error) {
    return next(error);
  }
}

async function getStockMovements(req, res, next) {
  try {
    const result = await inventoryService.listStockMovements(movementQuery(req.query));
    return ok(res, { movements: result.rows, pagination: result.pagination });
  } catch (error) {
    return next(error);
  }
}

async function createStockMovement(req, res, next) {
  try {
    const createdBy = req.auth.user.id;
    const result = await inventoryService.postStockMovement({ ...stockMovementBody(req.body), createdBy });
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

function inventoryQuery(input = {}) {
  return {
    category: v.optionalText(input.category, "category", 120),
    locationId: input.locationId ? v.positiveInt(input.locationId, "locationId") : undefined,
    status: v.optionalText(input.status, "status", 80),
    search: v.optionalText(input.search, "search", 120),
    page: input.page ? v.positiveInt(input.page, "page", { max: 100000 }) : undefined,
    pageSize: input.pageSize ? v.positiveInt(input.pageSize, "pageSize", { max: 100 }) : undefined
  };
}

function movementQuery(input = {}) {
  return {
    itemId: input.itemId ? v.positiveInt(input.itemId, "itemId") : undefined,
    locationId: input.locationId ? v.positiveInt(input.locationId, "locationId") : undefined,
    sourceType: v.optionalText(input.sourceType, "sourceType", 40),
    page: input.page ? v.positiveInt(input.page, "page", { max: 100000 }) : undefined,
    pageSize: input.pageSize ? v.positiveInt(input.pageSize, "pageSize", { max: 100 }) : undefined
  };
}

function stockMovementBody(input = {}) {
  return {
    movementNumber: input.movementNumber ? v.code(input.movementNumber, "movementNumber", { max: 40 }) : "",
    itemId: v.positiveInt(input.itemId, "itemId"),
    locationId: v.positiveInt(input.locationId, "locationId"),
    movementType: v.oneOf(input.movementType, "movementType", ["OPENING", "GRN_IN", "MANUAL_IN", "TRANSFER_IN", "ADJUSTMENT_IN", "REQUEST_ISSUE", "MANUAL_OUT", "TRANSFER_OUT", "ADJUSTMENT_OUT", "RESERVE", "UNRESERVE"], { required: true }),
    quantity: v.positiveNumber(input.quantity, "quantity", { max: 1000000 }),
    unitCost: input.unitCost == null || input.unitCost === "" ? null : v.nonNegativeNumber(input.unitCost, "unitCost", { max: 100000000 }),
    sourceType: input.sourceType ? v.oneOf(input.sourceType, "sourceType", ["OPENING", "GRN", "REQUEST", "PO", "TRANSFER", "ADJUSTMENT", "MANUAL"], { required: true }) : "MANUAL",
    sourceId: input.sourceId == null || input.sourceId === "" ? null : v.positiveInt(input.sourceId, "sourceId"),
    sourceLineId: input.sourceLineId == null || input.sourceLineId === "" ? null : v.positiveInt(input.sourceLineId, "sourceLineId"),
    notes: v.optionalText(input.notes, "notes", 1000)
  };
}
