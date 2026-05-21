const { pool } = require("../config/database");

const STOCK_IN_TYPES = new Set(["OPENING", "GRN_IN", "MANUAL_IN", "TRANSFER_IN", "ADJUSTMENT_IN"]);
const STOCK_OUT_TYPES = new Set(["REQUEST_ISSUE", "MANUAL_OUT", "TRANSFER_OUT", "ADJUSTMENT_OUT", "RESERVE", "UNRESERVE"]);

async function listInventoryBalances(filters = {}) {
  const where = [];
  const params = [];

  if (filters.category) {
    where.push("category = ?");
    params.push(filters.category);
  }
  if (filters.locationId) {
    where.push("location_id = ?");
    params.push(filters.locationId);
  }
  if (filters.status) {
    where.push("stock_status = ?");
    params.push(filters.status);
  }
  if (filters.search) {
    where.push("(item_id LIKE ? OR item_name LIKE ? OR item_type LIKE ?)");
    const term = `%${filters.search}%`;
    params.push(term, term, term);
  }

  const page = Math.max(Number(filters.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(filters.pageSize) || 25, 1), 100);
  const offset = (page - 1) * pageSize;
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.execute(
    `SELECT item_pk, item_id, item_name, item_type, category, location_id, location_name,
            quantity_on_hand, quantity_reserved, quantity_available, stock_status
     FROM v_inventory_stock
     ${whereSql}
     ORDER BY item_name, item_type, location_name
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM v_inventory_stock ${whereSql}`,
    params
  );

  return {
    rows,
    pagination: {
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0)
    }
  };
}

async function listStockMovements(filters = {}) {
  const where = [];
  const params = [];

  if (filters.itemId) {
    where.push("sm.item_id = ?");
    params.push(filters.itemId);
  }
  if (filters.locationId) {
    where.push("sm.location_id = ?");
    params.push(filters.locationId);
  }
  if (filters.sourceType) {
    where.push("sm.source_type = ?");
    params.push(filters.sourceType);
  }

  const page = Math.max(Number(filters.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(filters.pageSize) || 25, 1), 100);
  const offset = (page - 1) * pageSize;
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.execute(
    `SELECT sm.id, sm.movement_number, sm.movement_type, sm.quantity, sm.unit_cost,
            sm.source_type, sm.source_id, sm.source_line_id, sm.notes_remarks, sm.created_at,
            i.item_id, i.item_name, i.item_type, l.name AS location_name, u.full_name AS created_by_name
     FROM stock_movements sm
     JOIN items i ON i.id = sm.item_id
     JOIN locations l ON l.id = sm.location_id
     LEFT JOIN users u ON u.id = sm.created_by
     ${whereSql}
     ORDER BY sm.created_at DESC, sm.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM stock_movements sm
     ${whereSql}`,
    params
  );

  return {
    rows,
    pagination: {
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0)
    }
  };
}

async function postStockMovement(input) {
  const movementType = validateMovementType(input.movementType);
  const sourceType = validateSourceType(input.sourceType || "MANUAL");
  const quantity = Number(input.quantity);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    const error = new Error("quantity must be greater than zero.");
    error.statusCode = 400;
    throw error;
  }

  const movementNumber = input.movementNumber || await nextMovementNumber();

  await pool.execute(
    "CALL sp_record_stock_movement(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      movementNumber,
      positiveInteger(input.itemId, "itemId"),
      positiveInteger(input.locationId, "locationId"),
      movementType,
      quantity,
      input.unitCost == null ? null : Number(input.unitCost),
      sourceType,
      input.sourceId == null ? null : Number(input.sourceId),
      input.sourceLineId == null ? null : Number(input.sourceLineId),
      input.notes || null,
      input.createdBy == null ? null : Number(input.createdBy)
    ]
  );

  return { movementNumber };
}

async function nextMovementNumber() {
  const [rows] = await pool.query("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM stock_movements");
  return `MOV-${String(rows[0].next_id).padStart(8, "0")}`;
}

function validateMovementType(value) {
  const movementType = String(value || "").trim().toUpperCase();
  if (!STOCK_IN_TYPES.has(movementType) && !STOCK_OUT_TYPES.has(movementType)) {
    const error = new Error("movementType is invalid.");
    error.statusCode = 400;
    throw error;
  }
  return movementType;
}

function validateSourceType(value) {
  const sourceType = String(value || "").trim().toUpperCase();
  const allowed = new Set(["OPENING", "GRN", "REQUEST", "PO", "TRANSFER", "ADJUSTMENT", "MANUAL"]);
  if (!allowed.has(sourceType)) {
    const error = new Error("sourceType is invalid.");
    error.statusCode = 400;
    throw error;
  }
  return sourceType;
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    const error = new Error(`${name} must be a positive integer.`);
    error.statusCode = 400;
    throw error;
  }
  return number;
}

module.exports = {
  listInventoryBalances,
  listStockMovements,
  postStockMovement
};
