const { pool } = require("../config/database");

async function audit(tableName, recordId, action, changedBy, newValues = null, connection = pool) {
  await connection.execute(
    `INSERT INTO audit_logs (table_name, record_id, action, changed_by, new_values)
     VALUES (?, ?, ?, ?, ?)`,
    [tableName, Number(recordId) || 0, action, changedBy || null, newValues ? JSON.stringify(newValues) : null]
  );
}

async function listItems() {
  const [rows] = await pool.execute(
    `SELECT i.id, i.item_id AS code, i.item_name AS name, i.item_type AS type,
            c.name AS category, i.unit, i.reorder_level AS reorderLevel, i.is_active AS active
     FROM items i
     JOIN item_categories c ON c.id = i.category_id
     WHERE i.deleted_at IS NULL
     ORDER BY i.item_name, i.item_type`
  );
  return rows;
}

async function createItems(input, userId) {
  const category = String(input.category || "").trim();
  const name = String(input.name || "").trim();
  const unit = String(input.unit || "").trim() || null;
  const rows = Array.isArray(input.types) ? input.types : [];
  if (!category || !name || !rows.length) throwBadRequest("Category, item name, and at least one type are required.");

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [categoryResult] = await connection.execute(
      `INSERT INTO item_categories (name) VALUES (?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [category]
    );
    const categoryId = categoryResult.insertId;
    const created = [];
    for (const row of rows) {
      const code = String(row.code || "").trim();
      const type = String(row.type || "").trim();
      if (!code || !type) throwBadRequest("Each item type requires an Item ID and type.");
      const [result] = await connection.execute(
        `INSERT INTO items (item_id, item_name, item_type, category_id, unit, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [code, name, type, categoryId, unit, userId, userId]
      );
      created.push({ id: result.insertId, code, name, type, category, unit });
      await audit("items", result.insertId, "INSERT", userId, created[created.length - 1], connection);
    }
    await connection.commit();
    return created;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listVendors() {
  const [rows] = await pool.execute(
    `SELECT id, CONCAT('VEN-', LPAD(id, 3, '0')) AS vendorId, name, phone, contact, email, address
     FROM vendors
     WHERE deleted_at IS NULL
     ORDER BY name`
  );
  return rows;
}

async function createVendor(input, userId) {
  const [result] = await pool.execute(
    `INSERT INTO vendors (name, phone, contact, address, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [required(input.name, "Vendor name"), input.phone || null, input.contact || null, input.address || null, userId, userId]
  );
  await audit("vendors", result.insertId, "INSERT", userId, input);
  return { id: result.insertId, vendorId: `VEN-${String(result.insertId).padStart(3, "0")}`, ...input };
}

async function listRequests() {
  const [rows] = await pool.execute(
    `SELECT r.id, r.request_number AS requestId, r.request_date AS date,
            COALESCE(u.full_name, '') AS requester, COALESCE(d.name, '') AS department,
            COALESCE(l.name, '') AS location, r.notes_remarks,
            ri.id AS itemRowId, ri.item_code_snapshot AS itemCode, ri.item_name_snapshot AS itemName,
            ri.item_type_snapshot AS type, ri.quantity_requested AS quantity,
            ri.line_status AS approvalStatus, ri.line_status AS issuanceStatus
     FROM requests r
     LEFT JOIN users u ON u.id = r.requester_user_id
     LEFT JOIN departments d ON d.id = r.department_id
     LEFT JOIN locations l ON l.id = r.location_id
     LEFT JOIN request_items ri ON ri.request_id = r.id
     WHERE r.deleted_at IS NULL
     ORDER BY r.request_date DESC, r.id DESC, ri.line_no`
  );
  return groupLines(rows, "requestId", "items");
}

async function createRequest(input, userId) {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) throwBadRequest("At least one request item is required.");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const departmentId = await ensureNamed(connection, "departments", input.department);
    const locationId = await ensureNamed(connection, "locations", input.location);
    const requestNumber = await nextNumber(connection, "requests", "request_number", "REQ");
    const [requestResult] = await connection.execute(
      `INSERT INTO requests (request_number, requester_user_id, department_id, location_id, notes_remarks, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [requestNumber, userId, departmentId, locationId, input.notes || null, userId, userId]
    );
    for (const [index, row] of items.entries()) {
      const item = await getItemByCode(connection, row.itemCode);
      await connection.execute(
        `INSERT INTO request_items (request_id, line_no, item_id, item_name_snapshot, item_type_snapshot, item_code_snapshot, quantity_requested, source_location_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [requestResult.insertId, index + 1, item.id, item.item_name, item.item_type, item.item_id, Number(row.quantity), locationId]
      );
    }
    await audit("requests", requestResult.insertId, "INSERT", userId, { requestNumber, items }, connection);
    await connection.commit();
    return { requestId: requestNumber };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listPurchaseOrders() {
  const [rows] = await pool.execute(
    `SELECT po.id, po.po_number AS poNumber, po.issue_date AS issueDate, po.status,
            po.total_amount AS poAmount, po.expected_date AS arrivedBy, po.notes_remarks AS notesRemarks,
            v.id AS vendorId, v.name AS vendorName, l.name AS location,
            pol.description AS specifications, pol.quantity_ordered AS quantityOrdered,
            pol.quantity_received AS quantityReceived, pol.unit_price AS unitPrice, pol.tax_rate AS taxRate,
            i.item_id AS itemCode
     FROM purchase_orders po
     JOIN vendors v ON v.id = po.vendor_id
     LEFT JOIN locations l ON l.id = po.delivery_location_id
     LEFT JOIN purchase_order_lines pol ON pol.purchase_order_id = po.id
     LEFT JOIN items i ON i.id = pol.item_id
     WHERE po.deleted_at IS NULL
     ORDER BY po.created_at DESC, po.id DESC`
  );
  return rows;
}

async function createPurchaseOrder(input, userId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const poNumber = input.poNumber || await nextNumber(connection, "purchase_orders", "po_number", "PO");
    const locationId = await ensureNamed(connection, "locations", input.location);
    const item = await firstOrExistingItem(connection, input.productCode, input.specifications, userId);
    const qty = Number(input.quantityOrdered);
    const unitPrice = Number(input.unitPrice || 0);
    const taxRate = Number(input.taxRate || 0);
    const subtotal = qty * unitPrice;
    const tax = subtotal * taxRate / 100;
    const [poResult] = await connection.execute(
      `INSERT INTO purchase_orders (po_number, issue_date, vendor_id, status, expected_date, delivery_location_id,
        subtotal_amount, tax_amount, total_amount, notes_remarks, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [poNumber, input.issueDate || null, positive(input.vendorId, "Vendor"), "Draft", input.arrivedBy || null, locationId, subtotal, tax, subtotal + tax, input.notesRemarks || null, userId, userId]
    );
    await connection.execute(
      `INSERT INTO purchase_order_lines (purchase_order_id, line_no, item_id, description, quantity_ordered, quantity_received, unit_price, tax_rate)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?)`,
      [poResult.insertId, item.id, input.specifications || item.item_name, qty, Number(input.quantityReceived || 0), unitPrice, taxRate]
    );
    await audit("purchase_orders", poResult.insertId, "INSERT", userId, { poNumber }, connection);
    await connection.commit();
    return { poNumber };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listGrns() {
  const [rows] = await pool.execute(
    `SELECT g.id, g.grn_number AS grnNumber, po.po_number AS poNumber, g.grn_date AS date,
            l.name AS location, u.full_name AS receivedBy, gl.quantity_received AS qtyReceived,
            gl.quantity_accepted AS qtyAccepted, i.item_id AS itemCode
     FROM grns g
     LEFT JOIN purchase_orders po ON po.id = g.purchase_order_id
     JOIN locations l ON l.id = g.location_id
     LEFT JOIN users u ON u.id = g.received_by
     LEFT JOIN grn_lines gl ON gl.grn_id = g.id
     LEFT JOIN items i ON i.id = gl.item_id
     ORDER BY g.created_at DESC, g.id DESC`
  );
  return rows;
}

async function createGrn(input, userId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const item = await getItemByCode(connection, input.itemCode);
    const locationId = await ensureNamed(connection, "locations", input.location);
    const grnNumber = await nextNumber(connection, "grns", "grn_number", "GRN");
    const [grnResult] = await connection.execute(
      `INSERT INTO grns (grn_number, grn_date, received_by, location_id, status, notes_remarks, created_by, updated_by)
       VALUES (?, CURRENT_DATE(), ?, ?, 'Posted', ?, ?, ?)`,
      [grnNumber, userId, locationId, input.notes || null, userId, userId]
    );
    const movementNumber = await nextNumber(connection, "stock_movements", "movement_number", "MOV", 8);
    await connection.execute(
      "CALL sp_record_stock_movement(?, ?, ?, 'GRN_IN', ?, NULL, 'GRN', ?, NULL, ?, ?)",
      [movementNumber, item.id, locationId, Number(input.qtyAccepted), grnResult.insertId, `GRN receipt ${grnNumber}`, userId]
    );
    const [movementRows] = await connection.execute("SELECT id FROM stock_movements WHERE movement_number = ?", [movementNumber]);
    await connection.execute(
      `INSERT INTO grn_lines (grn_id, line_no, item_id, quantity_received, quantity_accepted, quantity_rejected, stock_movement_id)
       VALUES (?, 1, ?, ?, ?, ?, ?)`,
      [grnResult.insertId, item.id, Number(input.qtyReceived), Number(input.qtyAccepted), Math.max(Number(input.qtyReceived) - Number(input.qtyAccepted), 0), movementRows[0]?.id || null]
    );
    await audit("grns", grnResult.insertId, "INSERT", userId, { grnNumber }, connection);
    await connection.commit();
    return { grnNumber };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listAudit() {
  const [rows] = await pool.execute(
    `SELECT a.changed_at AS date, a.action, a.table_name AS entityType, a.record_id AS entityId, a.new_values AS details
     FROM audit_logs a
     ORDER BY a.changed_at DESC
     LIMIT 200`
  );
  return rows;
}

async function postStockMovement(input, userId, type) {
  const connection = await pool.getConnection();
  try {
    const item = await getItemByCode(connection, input.itemCode);
    const locationId = await ensureNamed(connection, "locations", input.location);
    const movementNumber = await nextNumber(connection, "stock_movements", "movement_number", "MOV", 8);
    await connection.execute(
      "CALL sp_record_stock_movement(?, ?, ?, ?, ?, NULL, 'MANUAL', NULL, NULL, ?, ?)",
      [movementNumber, item.id, locationId, type, Number(input.quantity), input.notes || null, userId]
    );
    const [rows] = await connection.execute("SELECT id FROM stock_movements WHERE movement_number = ?", [movementNumber]);
    await audit("stock_movements", rows[0]?.id || 0, "POST", userId, { movementNumber, type, ...input }, connection);
    return { movementNumber };
  } finally {
    connection.release();
  }
}

async function listInventory() {
  const [rows] = await pool.execute(
    `SELECT item_pk AS id, item_id AS code, item_name AS name, item_type AS type, category,
            location_name AS location, quantity_on_hand AS stock, stock_status AS status
     FROM v_inventory_stock
     ORDER BY item_name, item_type, location_name`
  );
  return rows;
}

async function ensureNamed(connection, table, name) {
  const clean = String(name || "").trim();
  if (!clean) return null;
  const [result] = await connection.execute(
    `INSERT INTO ${table} (name) VALUES (?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [clean]
  );
  return result.insertId;
}

async function getItemByCode(connection, code) {
  const [rows] = await connection.execute("SELECT * FROM items WHERE item_id = ? LIMIT 1", [required(code, "Item ID")]);
  if (!rows[0]) throwBadRequest(`Unknown item ID: ${code}`);
  return rows[0];
}

async function firstOrExistingItem(connection, code, description, userId) {
  if (code) {
    const [rows] = await connection.execute("SELECT * FROM items WHERE item_id = ? LIMIT 1", [code]);
    if (rows[0]) return rows[0];
  }
  const fallbackCode = code || `PO-SERVICE-${Date.now()}`;
  const categoryId = await ensureNamed(connection, "item_categories", "Procurement");
  const [result] = await connection.execute(
    `INSERT INTO items (item_id, item_name, item_type, category_id, unit, created_by, updated_by)
     VALUES (?, ?, 'Specification', ?, 'unit', ?, ?)`,
    [fallbackCode, String(description || "Procurement item").slice(0, 255), categoryId, userId, userId]
  );
  return { id: result.insertId, item_id: fallbackCode, item_name: description || fallbackCode };
}

async function nextNumber(connection, table, column, prefix, pad = 3) {
  const [rows] = await connection.execute(`SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM ${table}`);
  return `${prefix}-${String(rows[0].next_id).padStart(pad, "0")}`;
}

function groupLines(rows, idKey, lineKey) {
  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row[idKey])) map.set(row[idKey], { ...row, [lineKey]: [] });
    const target = map.get(row[idKey]);
    if (row.itemRowId) target[lineKey].push({
      id: row.itemRowId,
      itemCode: row.itemCode,
      itemName: row.itemName,
      type: row.type,
      quantity: row.quantity,
      approvalStatus: row.approvalStatus === "Pending Approval" ? "Pending" : row.approvalStatus,
      issuanceStatus: row.issuanceStatus === "Issued" ? "Issued" : "Pending"
    });
  });
  return [...map.values()];
}

function required(value, label) {
  const clean = String(value || "").trim();
  if (!clean) throwBadRequest(`${label} is required.`);
  return clean;
}

function positive(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throwBadRequest(`${label} is required.`);
  return number;
}

function throwBadRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

module.exports = {
  listInventory,
  postStockMovement,
  listItems,
  createItems,
  listVendors,
  createVendor,
  listRequests,
  createRequest,
  listPurchaseOrders,
  createPurchaseOrder,
  listGrns,
  createGrn,
  listAudit
};
