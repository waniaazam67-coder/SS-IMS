const { pool } = require("../config/database");

async function audit(tableName, recordId, action, changedBy, newValues = null, connection = pool) {
  await connection.execute(
    `INSERT INTO audit_logs (table_name, record_id, action, changed_by, new_values)
     VALUES (?, ?, ?, ?, ?)`,
    [tableName, Number(recordId) || 0, action, changedBy || null, newValues ? JSON.stringify(newValues) : null]
  );
}

function isAdminContext(auth = {}) {
  const roles = (auth.roles || []).map((role) => String(role).toLowerCase());
  const permissions = new Set(auth.permissions || []);
  return roles.includes("admin") || permissions.has("setting.manage") || permissions.has("user.manage");
}

function notificationVisibilityWhere(auth = {}, alias = "n") {
  const email = String(auth.user?.email || "").trim().toLowerCase();
  const clauses = [`${alias}.recipient_user_id = ?`];
  const params = [auth.user?.id || 0];
  if (email) {
    clauses.push(`LOWER(${alias}.recipient_email) = ?`);
    params.push(email);
  }
  if (isAdminContext(auth)) clauses.push(`(${alias}.recipient_user_id IS NULL AND ${alias}.recipient_email IS NULL)`);
  return { sql: `(${clauses.join(" OR ")})`, params };
}

async function createNotification(connection, input = {}) {
  const title = String(input.title || "").trim();
  if (!title) return;
  const metadata = input.metadata ? JSON.stringify(input.metadata) : null;
  await connection.execute(
    `INSERT INTO notifications
      (notification_key, recipient_user_id, recipient_email, channel, title, body, entity_type, entity_id, status, priority, sent_at, metadata, created_by)
     VALUES (?, ?, ?, 'in_app', ?, ?, ?, ?, 'sent', ?, CURRENT_TIMESTAMP, ?, ?)`,
    [
      input.key || null,
      input.recipientUserId || null,
      input.recipientEmail || null,
      title.slice(0, 180),
      input.body || null,
      input.entityType || null,
      input.entityId || null,
      input.priority || "normal",
      metadata,
      input.createdBy || null
    ]
  );
}

async function usersWithPermission(connection, permission) {
  const [rows] = await connection.execute(
    `SELECT DISTINCT u.id, u.email
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE p.permission_key = ? AND u.is_active = 1 AND u.deleted_at IS NULL`,
    [permission]
  );
  return rows;
}

async function notifyPermissionUsers(connection, permission, input = {}) {
  const users = await usersWithPermission(connection, permission);
  for (const user of users) {
    await createNotification(connection, {
      ...input,
      recipientUserId: user.id,
      recipientEmail: user.email
    });
  }
}

async function notifyLowStockIfNeeded(connection, itemId, locationId, userId) {
  const [rows] = await connection.execute(
    `SELECT item_id AS itemCode, item_name AS itemName, location_name AS location, quantity_available AS available, stock_status AS status
       FROM v_inventory_stock
      WHERE item_pk = ? AND location_id = ?
      LIMIT 1`,
    [itemId, locationId]
  );
  const stock = rows[0];
  if (!stock || String(stock.status || "").toUpperCase() === "OK") return;
  await notifyPermissionUsers(connection, "inventory.manage", {
    key: `low-stock-${stock.itemCode}-${stock.location}-${Date.now()}`,
    title: `Stock is ${String(stock.status).toLowerCase()}`,
    body: `${stock.itemName || stock.itemCode} at ${stock.location} has ${Number(stock.available || 0)} available.`,
    entityType: "inventory",
    entityId: itemId,
    priority: "high",
    metadata: { type: "stock_low", itemCode: stock.itemCode, location: stock.location, available: stock.available, status: stock.status, audience: "direct" },
    createdBy: userId
  });
}

async function listNotifications(auth, query = {}) {
  const visibility = notificationVisibilityWhere(auth, "n");
  const unreadOnly = String(query.unreadOnly || "").toLowerCase() === "true";
  const filters = [visibility.sql, "n.channel IN ('in_app', 'system')", "n.status <> 'dismissed'"];
  const params = [...visibility.params];
  if (unreadOnly) filters.push("n.status <> 'read'");
  const [rows] = await pool.execute(
    `SELECT n.id, n.notification_key AS notificationKey, n.title, n.body AS message,
            n.entity_type AS entityType, n.entity_id AS entityId, n.status, n.priority,
            n.metadata, n.created_at AS createdAt, n.read_at AS readAt,
            n.recipient_user_id AS recipientUserId, n.recipient_email AS recipientEmail
       FROM notifications n
      WHERE ${filters.join(" AND ")}
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT 100`,
    params
  );
  return rows.map((row) => ({
    ...row,
    type: notificationType(row),
    unread: row.status !== "read",
    metadata: parseJson(row.metadata)
  }));
}

async function markNotificationRead(id, auth) {
  const visibility = notificationVisibilityWhere(auth, "notifications");
  const [result] = await pool.execute(
    `UPDATE notifications
        SET status = 'read', read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
      WHERE id = ? AND ${visibility.sql}`,
    [positive(id, "Notification"), ...visibility.params]
  );
  if (!result.affectedRows) throwBadRequest("Notification not found.");
  return { id: Number(id), status: "read" };
}

async function markAllNotificationsRead(auth) {
  const visibility = notificationVisibilityWhere(auth, "notifications");
  const [result] = await pool.execute(
    `UPDATE notifications
        SET status = 'read', read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
      WHERE status <> 'read' AND status <> 'dismissed' AND ${visibility.sql}`,
    visibility.params
  );
  return { updated: result.affectedRows };
}

function notificationType(row = {}) {
  const metadata = parseJson(row.metadata);
  if (metadata.type) return metadata.type;
  return String(row.entityType || row.entity_type || "system").replace(/_/g, " ");
}

function parseJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}

async function listItems() {
  const [rows] = await pool.execute(
    `SELECT i.id, i.item_id AS code, i.item_name AS name, i.item_type AS type,
            c.name AS category, i.is_active AS active
     FROM items i
     JOIN item_categories c ON c.id = i.category_id
     WHERE i.deleted_at IS NULL
     ORDER BY i.item_name, i.item_type`
  );
  return rows;
}

async function syncImportedInventory(input, userId) {
  const items = Array.isArray(input.items) ? input.items : [];
  const locations = Array.isArray(input.locations) ? input.locations : [];
  if (!items.length) throwBadRequest("Imported inventory must include at least one item.");

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    for (const location of locations.map((value) => String(value || "").trim()).filter(Boolean)) {
      await connection.execute(
        `INSERT INTO locations (name, created_by, updated_by)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE is_active = 1, deleted_at = NULL, updated_by = VALUES(updated_by)`,
        [location, userId, userId]
      );
    }

    const importedCodes = [];
    for (const row of items) {
      const code = String(row.code || "").trim();
      const name = String(row.name || "").trim();
      const type = String(row.type || "").trim();
      const category = String(row.category || "").trim();
      if (!code || !name || !type || !category) continue;

      importedCodes.push(code);
      const [categoryResult] = await connection.execute(
        `INSERT INTO item_categories (name) VALUES (?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
        [category]
      );
      const categoryId = categoryResult.insertId;
      await connection.execute(
        `INSERT INTO items (item_id, item_name, item_type, category_id, notes_remarks, is_active, deleted_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
         ON DUPLICATE KEY UPDATE
           item_name = VALUES(item_name),
           item_type = VALUES(item_type),
           category_id = VALUES(category_id),
           notes_remarks = VALUES(notes_remarks),
           is_active = VALUES(is_active),
           deleted_at = NULL,
           updated_by = VALUES(updated_by)`,
        [code, name, type, categoryId, row.notes || null, row.active === false ? 0 : 1, userId, userId]
      );
    }

    if (importedCodes.length) {
      await connection.query(
        `UPDATE items
         SET deleted_at = CURRENT_TIMESTAMP, is_active = 0, updated_by = ?
         WHERE item_id NOT IN (?) AND deleted_at IS NULL`,
        [userId, importedCodes]
      );
    }

    await audit("items", 0, "UPDATE", userId, { source: "inventory data category files", itemCount: importedCodes.length, locationCount: locations.length }, connection);
    await connection.commit();
    return { synced: importedCodes.length, locations: locations.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function createItems(input, userId) {
  const category = String(input.category || "").trim();
  const name = String(input.name || "").trim();
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
        `INSERT INTO items (item_id, item_name, item_type, category_id, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [code, name, type, categoryId, userId, userId]
      );
      created.push({ id: result.insertId, code, name, type, category });
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
    `SELECT id, CONCAT('VEN-', LPAD(id, 3, '0')) AS vendorId, name, phone, contact, email, address,
            bank_name AS bankName, account_title AS accountTitle, account_no AS accountNo
     FROM vendors
     WHERE deleted_at IS NULL
     ORDER BY name`
  );
  return rows;
}

async function createVendor(input, userId) {
  const vendor = vendorPayload(input);
  const [result] = await pool.execute(
    `INSERT INTO vendors (name, phone, contact, address, bank_name, account_title, account_no, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      required(vendor.name, "Vendor name"),
      vendor.phone || null,
      vendor.contact || null,
      vendor.address || null,
      vendor.bankName || null,
      vendor.accountTitle || null,
      vendor.accountNo || null,
      userId,
      userId
    ]
  );
  await audit("vendors", result.insertId, "INSERT", userId, vendor);
  return { id: result.insertId, vendorId: `VEN-${String(result.insertId).padStart(3, "0")}`, ...vendor };
}

async function updateVendor(vendorId, input, userId) {
  const vendor = vendorPayload(input);
  const [result] = await pool.execute(
    `UPDATE vendors
        SET name = ?, phone = ?, contact = ?, address = ?, bank_name = ?, account_title = ?, account_no = ?, updated_by = ?
      WHERE id = ? AND deleted_at IS NULL`,
    [
      required(vendor.name, "Vendor name"),
      vendor.phone || null,
      vendor.contact || null,
      vendor.address || null,
      vendor.bankName || null,
      vendor.accountTitle || null,
      vendor.accountNo || null,
      userId,
      positive(vendorId, "Vendor")
    ]
  );
  if (!result.affectedRows) throwBadRequest("Vendor not found.");
  await audit("vendors", vendorId, "UPDATE", userId, vendor);
  return { id: Number(vendorId), vendorId: `VEN-${String(vendorId).padStart(3, "0")}`, ...vendor };
}

function vendorPayload(input = {}) {
  return {
    name: String(input.name || "").trim(),
    phone: String(input.phone || "").trim(),
    contact: String(input.contact || "").trim(),
    address: String(input.address || "").trim(),
    bankName: String(input.bankName || input.bank_name || "").trim(),
    accountTitle: String(input.accountTitle || input.account_title || "").trim(),
    accountNo: String(input.accountNo || input.account_no || "").trim()
  };
}

async function listRequests() {
  const [rows] = await pool.execute(
    `SELECT r.id, r.request_number AS requestId, r.request_date AS date,
            COALESCE(u.full_name, '') AS requester, COALESCE(d.name, '') AS department,
            COALESCE(r.line_manager_email, '') AS managerEmail,
            COALESCE(u.email, '') AS requesterEmail, COALESCE(l.name, '') AS location, r.notes_remarks,
            ri.id AS itemRowId, ri.item_code_snapshot AS itemCode, ri.item_name_snapshot AS itemName,
            ri.item_type_snapshot AS type, ri.quantity_requested AS quantity,
            ri.quantity_approved AS quantityApproved, ri.quantity_issued AS quantityIssued,
            ri.line_status AS lineStatus
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

async function updateRequestApproval(requestNumber, itemId, input, authContext) {
  const userId = authContext?.user?.id;
  const status = String(input.status || "").trim();
  if (!["Approved", "Rejected"].includes(status)) throwBadRequest("Approval status must be Approved or Rejected.");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { request, item } = await getRequestLineForUpdate(connection, requestNumber, itemId);
    assertLineManagerApprovalAccess(request, authContext);
    if (["Issued", "Partially Issued"].includes(item.line_status)) {
      throwBadRequest("Issued request lines cannot be changed by approval.");
    }
    if (!item.source_location_id) throwBadRequest("Request line is missing a source location.");
    if (item.line_status === status) {
      await connection.commit();
      return { requestId: requestNumber, itemId: item.id, status };
    }
    const approvedQuantity = status === "Approved" ? item.quantity_requested : 0;
    const hasLegacyApprovalStatus = await tableColumnExists(connection, "request_items", "approval_status");
    const hasLegacyIssuanceStatus = await tableColumnExists(connection, "request_items", "issuance_status");
    const hasApprovedBy = await tableColumnExists(connection, "request_items", "approved_by");
    const hasApprovedAt = await tableColumnExists(connection, "request_items", "approved_at");
    const hasRejectionReason = await tableColumnExists(connection, "request_items", "rejection_reason");
    const updateColumns = [
      "line_status = ?",
      "quantity_approved = ?",
      "quantity_issued = 0",
      ...(hasLegacyApprovalStatus ? ["approval_status = ?"] : []),
      ...(hasLegacyIssuanceStatus ? ["issuance_status = ?"] : []),
      ...(hasApprovedBy ? ["approved_by = ?"] : []),
      ...(hasApprovedAt ? ["approved_at = CURRENT_TIMESTAMP"] : []),
      ...(hasRejectionReason ? ["rejection_reason = ?"] : [])
    ];
    const updateValues = [
      status,
      approvedQuantity,
      ...(hasLegacyApprovalStatus ? [status] : []),
      ...(hasLegacyIssuanceStatus ? ["Not Issued"] : []),
      ...(hasApprovedBy ? [userId] : []),
      ...(hasRejectionReason ? [status === "Rejected" ? input.notes || null : null] : []),
      item.id
    ];
    await connection.execute(
      `UPDATE request_items
       SET ${updateColumns.join(", ")}
       WHERE id = ?`,
      updateValues
    );
    await recomputeRequestStatuses(connection, request.id, userId);
    await audit("request_items", item.id, "UPDATE", userId, {
      requestNumber,
      fromStatus: item.line_status,
      toStatus: status,
      notes: input.notes || null
    }, connection);
    await createNotification(connection, {
      key: `request-${status.toLowerCase()}-${requestNumber}-${item.id}`,
      recipientUserId: request.requesterUserId,
      recipientEmail: request.requesterEmail,
      title: `Request ${requestNumber} ${status.toLowerCase()}`,
      body: `${item.item_name_snapshot || item.item_code_snapshot || "Requested item"} was ${status.toLowerCase()}.`,
      entityType: "request_items",
      entityId: item.id,
      priority: status === "Rejected" ? "high" : "normal",
      metadata: { type: status === "Approved" ? "request_approved" : "request_rejected", requestNumber, itemId: item.id, audience: "direct" },
      createdBy: userId
    });
    await connection.commit();
    return { requestId: requestNumber, itemId: item.id, status };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function issueRequestStock(requestNumber, itemId, input, userId) {
  const quantity = Number(input.quantity);
  if (!quantity || quantity <= 0) throwBadRequest("Issue quantity must be greater than zero.");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { request, item } = await getRequestLineForUpdate(connection, requestNumber, itemId);
    if (!["Approved", "Partially Issued"].includes(item.line_status)) {
      throwBadRequest("Only approved request lines can be issued.");
    }
    if (!item.source_location_id) throwBadRequest("Request line is missing a source location.");
    const remaining = Number(item.quantity_approved) - Number(item.quantity_issued);
    if (quantity > remaining) throwBadRequest(`Issue quantity cannot exceed remaining approved quantity (${remaining}).`);
    const [stockRows] = await connection.execute(
      `SELECT quantity_on_hand AS stock
       FROM v_inventory_stock
       WHERE item_pk = ? AND location_id = ?
       LIMIT 1`,
      [item.item_id, item.source_location_id]
    );
    const availableStock = Number(stockRows[0]?.stock || 0);
    if (quantity > availableStock) throwBadRequest(`Stock unavailable. Available quantity is ${availableStock}.`);
    const reservationNumber = await nextNumber(connection, "stock_movements", "movement_number", "MOV", 8);
    await connection.execute(
      "CALL sp_record_stock_movement(?, ?, ?, 'RESERVE', ?, NULL, 'REQUEST', ?, ?, ?, ?)",
      [
        reservationNumber,
        item.item_id,
        item.source_location_id,
        quantity,
        request.id,
        item.id,
        `Reserved for issue against ${requestNumber}`,
        userId
      ]
    );
    const movementNumber = await nextNumber(connection, "stock_movements", "movement_number", "MOV", 8);
    await connection.execute(
      "CALL sp_record_stock_movement(?, ?, ?, 'REQUEST_ISSUE', ?, NULL, 'REQUEST', ?, ?, ?, ?)",
      [
        movementNumber,
        item.item_id,
        item.source_location_id,
        quantity,
        request.id,
        item.id,
        input.notes || `Issued against ${requestNumber}`,
        userId
      ]
    );
    const nextIssued = Number(item.quantity_issued) + quantity;
    const nextStatus = nextIssued >= Number(item.quantity_approved) ? "Issued" : "Partially Issued";
    await connection.execute(
      `UPDATE request_items
       SET quantity_issued = ?, line_status = ?
       WHERE id = ?`,
      [nextIssued, nextStatus, item.id]
    );
    await recomputeRequestStatuses(connection, request.id, userId);
    const [movementRows] = await connection.execute("SELECT id FROM stock_movements WHERE movement_number = ?", [movementNumber]);
    await audit("stock_movements", movementRows[0]?.id || 0, "POST", userId, {
      movementNumber,
      requestNumber,
      itemId: item.id,
      quantity,
      issuedBy: input.issuedBy || null
    }, connection);
    await createNotification(connection, {
      key: `stock-issued-${movementNumber}`,
      recipientUserId: request.requesterUserId,
      recipientEmail: request.requesterEmail,
      title: `Stock issued for ${requestNumber}`,
      body: `${quantity} ${item.item_code_snapshot || "item"} issued. Movement ${movementNumber}.`,
      entityType: "stock_movements",
      entityId: movementRows[0]?.id || 0,
      metadata: { type: "stock_issued", requestNumber, movementNumber, itemId: item.id, audience: "direct" },
      createdBy: userId
    });
    await notifyLowStockIfNeeded(connection, item.item_id, item.source_location_id, userId);
    await connection.commit();
    return { requestId: requestNumber, itemId: item.id, movementNumber, status: nextStatus };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listTransportRequests() {
  const [rows] = await pool.execute(
    `SELECT tr.id, tr.request_number AS requestId, tr.created_at AS date,
            COALESCE(u.full_name, '') AS requester, COALESCE(u.email, '') AS requesterEmail,
            COALESCE(d.name, '') AS department, COALESCE(l.name, '') AS location,
            COALESCE(tr.line_manager_email, '') AS managerEmail,
            tr.transport_type AS transportType,
            DATE_FORMAT(COALESCE(gt.required_date, tt.travel_date, lm.visit_date, tr.date_of_travel), '%Y-%m-%d') AS travelDate,
            tr.pickup_location AS pickupLocation, tr.destination, tr.vehicle_type AS vehicleType,
            tr.passengers, tr.approval_status AS approvalStatus, tr.status AS arrangementStatus,
            tr.notes_remarks AS notes,
            TIME_FORMAT(gt.pickup_time, '%H:%i') AS pickupTime, gt.dropoff_location AS dropoffLocation,
            gt.goods_description AS goodsDescription, gt.goods_quantity AS goodsQuantity,
            TIME_FORMAT(tt.departure_time, '%H:%i') AS departureTime,
            DATE_FORMAT(tt.return_date, '%Y-%m-%d') AS returnDate,
            tt.destination_city_area AS destinationCityArea, tt.trip_duration AS tripDuration,
            tt.advance_required AS advanceRequired, tt.travelers,
            TIME_FORMAT(lm.departure_time, '%H:%i') AS localDepartureTime,
            TIME_FORMAT(lm.return_time, '%H:%i') AS returnTime,
            lm.meeting_visit_location AS meetingVisitLocation, lm.expected_duration AS expectedDuration,
            lm.passengers AS localPassengers,
            COALESCE(gt.purpose_notes, tt.purpose_notes, lm.purpose_notes, '') AS purpose
     FROM transport_requests tr
     LEFT JOIN users u ON u.id = tr.requester_user_id
     LEFT JOIN departments d ON d.id = tr.department_id
     LEFT JOIN locations l ON l.id = tr.location_id
     LEFT JOIN goods_transport_requests gt ON gt.transport_request_id = tr.id
     LEFT JOIN travel_transport_requests tt ON tt.transport_request_id = tr.id
     LEFT JOIN local_meeting_transport_requests lm ON lm.transport_request_id = tr.id
     ORDER BY tr.created_at DESC, tr.id DESC`
  );
  return rows.map((row) => ({
    ...row,
    purpose: cleanTransportPurpose(row.purpose),
    approvalStatus: row.approvalStatus === "Pending Approval" ? "Pending" : row.approvalStatus,
    arrangementStatus: row.arrangementStatus || "Pending"
  }));
}

async function createRequest(input, userId) {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) throwBadRequest("At least one request item is required.");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const departmentId = await ensureNamed(connection, "departments", input.department);
    const locationId = await ensureNamed(connection, "locations", input.location);
    const normalizedInput = normalizeRequestIdentity(input);
    const requesterId = await ensureRequesterUser(connection, normalizedInput, departmentId, locationId);
    const requestNumber = await nextNumber(connection, "requests", "request_number", "REQ");
    const hasLegacyRequestId = await tableColumnExists(connection, "requests", "request_id");
    const requestColumns = [
      "request_number",
      ...(hasLegacyRequestId ? ["request_id"] : []),
      "requester_user_id",
      "department_id",
      "location_id",
      "line_manager_email",
      "notes_remarks",
      "created_by",
      "updated_by"
    ];
    const requestValues = [
      requestNumber,
      ...(hasLegacyRequestId ? [requestNumber] : []),
      requesterId || userId,
      departmentId,
      locationId,
      normalizedInput.lineManagerEmail || null,
      input.notes || null,
      userId,
      userId
    ];
    const [requestResult] = await connection.execute(
      `INSERT INTO requests (${requestColumns.join(", ")})
       VALUES (${requestColumns.map(() => "?").join(", ")})`,
      requestValues
    );
    for (const [index, row] of items.entries()) {
      const item = await getItemByCode(connection, row.itemCode, {
        name: row.itemName,
        type: row.itemType,
        category: input.category,
        userId
      });
      await connection.execute(
        `INSERT INTO request_items (request_id, line_no, item_id, item_name_snapshot, item_type_snapshot, item_code_snapshot, quantity_requested, source_location_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [requestResult.insertId, index + 1, item.id, item.item_name, item.item_type, item.item_id, Number(row.quantity), locationId]
      );
    }
    await audit("requests", requestResult.insertId, "INSERT", userId, { requestNumber, items }, connection);
    await createNotification(connection, {
      key: `request-submitted-${requestNumber}-${requestResult.insertId}`,
      recipientUserId: requesterId || userId,
      title: `Request ${requestNumber} submitted`,
      body: `${normalizedInput.requestedBy || "Requester"} submitted ${items.length} item request${items.length === 1 ? "" : "s"}.`,
      entityType: "requests",
      entityId: requestResult.insertId,
      metadata: { type: "request_submitted", requestNumber, audience: "direct" },
      createdBy: userId
    });
    await notifyPermissionUsers(connection, "request.approve", {
      key: `request-approval-${requestNumber}-${requestResult.insertId}`,
      title: `Approval required for ${requestNumber}`,
      body: `${normalizedInput.requestedBy || "Requester"} submitted ${items.length} item request${items.length === 1 ? "" : "s"}.`,
      entityType: "requests",
      entityId: requestResult.insertId,
      metadata: { type: "request_submitted", requestNumber, audience: "direct" },
      createdBy: userId
    });
    await connection.commit();
    return { requestId: requestNumber };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function createTransportRequest(input, userId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const departmentId = await ensureNamed(connection, "departments", input.department);
    const locationId = await ensureNamed(connection, "locations", input.location);
    const normalizedInput = normalizeRequestIdentity(input);
    const requesterId = await ensureRequesterUser(connection, normalizedInput, departmentId, locationId);
    const transportType = required(input.transportType || input.transportRequestType, "Transport request type");
    const requestNumber = await nextNumber(connection, "transport_requests", "request_number", "TRQ");
    const hasLegacyRequestId = await tableColumnExists(connection, "transport_requests", "request_id");
    const hasLineManagerEmail = await tableColumnExists(connection, "transport_requests", "line_manager_email");
    const columns = [
      "request_number",
      ...(hasLegacyRequestId ? ["request_id"] : []),
      "requester_user_id",
      "department_id",
      "location_id",
      ...(hasLineManagerEmail ? ["line_manager_email"] : []),
      "transport_type",
      "date_of_travel",
      "pickup_location",
      "destination",
      "vehicle_type",
      "passengers",
      "notes_remarks",
      "created_by",
      "updated_by"
    ];
    const values = [
      requestNumber,
      ...(hasLegacyRequestId ? [requestNumber] : []),
      requesterId || userId,
      departmentId,
      locationId,
      ...(hasLineManagerEmail ? [normalizedInput.lineManagerEmail || null] : []),
      transportType,
      input.travelDate || input.transportDate || null,
      input.pickupLocation || null,
      input.destination || input.dropoffLocation || null,
      input.vehicleType || null,
      input.passengers ? Number(input.passengers) : null,
      input.purpose || input.notes || null,
      userId,
      userId
    ];
    const [result] = await connection.execute(
      `INSERT INTO transport_requests (${columns.join(", ")})
       VALUES (${columns.map(() => "?").join(", ")})`,
      values
    );
    await insertTransportDetail(connection, result.insertId, transportType, input);
    await audit("transport_requests", result.insertId, "INSERT", userId, { requestNumber, ...input }, connection);
    await connection.commit();
    return { requestId: requestNumber };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateTransportApproval(id, input, authContext) {
  const userId = authContext?.user?.id;
  const status = String(input.status || "").trim();
  if (!["Approved", "Rejected"].includes(status)) throwBadRequest("Transport approval status must be Approved or Rejected.");
  const arrangementStatus = status === "Rejected" ? "Cancelled" : undefined;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const transport = await getTransportForUpdate(connection, id);
    assertLineManagerApprovalAccess(transport, authContext);
    if (arrangementStatus) {
      await connection.execute(
        `UPDATE transport_requests
         SET approval_status = ?, status = ?, updated_by = ?
         WHERE id = ?`,
        [status, arrangementStatus, userId, transport.id]
      );
    } else {
      await connection.execute(
        `UPDATE transport_requests
         SET approval_status = ?, updated_by = ?
         WHERE id = ?`,
        [status, userId, transport.id]
      );
    }
    await audit("transport_requests", transport.id, "UPDATE", userId, {
      requestNumber: transport.request_number,
      field: "approval_status",
      fromStatus: transport.approval_status,
      toStatus: status
    }, connection);
    await createNotification(connection, {
      key: `transport-approval-${transport.request_number}-${status}`,
      recipientUserId: transport.requesterUserId,
      recipientEmail: transport.requesterEmail,
      title: `Transport ${transport.request_number} ${status.toLowerCase()}`,
      body: `Your transport request status changed from ${transport.approval_status} to ${status}.`,
      entityType: "transport_requests",
      entityId: transport.id,
      priority: status === "Rejected" ? "high" : "normal",
      metadata: { type: "transport_status_changed", requestNumber: transport.request_number, fromStatus: transport.approval_status, toStatus: status, audience: "direct" },
      createdBy: userId
    });
    await connection.commit();
    return { id: transport.id, requestId: transport.request_number, approvalStatus: status };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateTransportArrangement(id, input, userId) {
  const status = String(input.status || "").trim();
  if (!["Pending", "Arranged", "Completed", "Cancelled"].includes(status)) throwBadRequest("Transport arrangement status is invalid.");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const transport = await getTransportForUpdate(connection, id);
    if (transport.approval_status !== "Approved" && status === "Arranged") {
      throwBadRequest("Transport must be approved before it can be arranged.");
    }
    await connection.execute(
      `UPDATE transport_requests
       SET status = ?, updated_by = ?
       WHERE id = ?`,
      [status, userId, transport.id]
    );
    await audit("transport_requests", transport.id, "UPDATE", userId, {
      requestNumber: transport.request_number,
      field: "status",
      fromStatus: transport.status,
      toStatus: status
    }, connection);
    await createNotification(connection, {
      key: `transport-arrangement-${transport.request_number}-${status}`,
      recipientUserId: transport.requesterUserId,
      recipientEmail: transport.requesterEmail,
      title: `Transport ${transport.request_number} ${status.toLowerCase()}`,
      body: `Transport arrangement status changed from ${transport.status} to ${status}.`,
      entityType: "transport_requests",
      entityId: transport.id,
      metadata: { type: "transport_status_changed", requestNumber: transport.request_number, fromStatus: transport.status, toStatus: status, audience: "direct" },
      createdBy: userId
    });
    await connection.commit();
    return { id: transport.id, requestId: transport.request_number, arrangementStatus: status };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function insertTransportDetail(connection, transportRequestId, transportType, input) {
  if (transportType === "Goods Transport") {
    await connection.execute(
      `INSERT INTO goods_transport_requests
       (transport_request_id, required_date, pickup_time, pickup_location, dropoff_location, goods_description, goods_quantity, vehicle_type, purpose_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transportRequestId,
        input.transportDate || input.travelDate || null,
        input.departureTime || input.pickupTime || null,
        input.pickupLocation || null,
        input.dropoffLocation || input.destination || null,
        input.goodsDescription || null,
        input.goodsQuantity || null,
        input.vehicleType || null,
      input.purpose || null
      ]
    );
    return;
  }

  if (transportType === "Travel Request") {
    await connection.execute(
      `INSERT INTO travel_transport_requests
       (transport_request_id, travel_date, departure_time, return_date, pickup_location, destination_city_area, trip_duration, advance_required, travelers, vehicle_type, purpose_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transportRequestId,
        input.travelDate || input.transportDate || null,
        input.departureTime || input.travelDepartureTime || null,
        input.returnDate || input.travelReturnDate || null,
        input.pickupLocation || null,
        input.destination || input.travelDestination || null,
        input.duration || input.travelDuration || null,
        input.advanceRequired !== undefined && input.advanceRequired !== "" ? Number(input.advanceRequired) : null,
        input.passengers ? Number(input.passengers) : null,
        input.vehicleType || null,
        input.purpose || null
      ]
    );
    return;
  }

  if (transportType === "Local Visit / Meeting Transport") {
    await connection.execute(
      `INSERT INTO local_meeting_transport_requests
       (transport_request_id, visit_date, departure_time, return_time, pickup_location, meeting_visit_location, expected_duration, passengers, vehicle_type, purpose_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transportRequestId,
        input.travelDate || input.transportDate || input.localVisitDate || null,
        input.departureTime || input.localDepartureTime || null,
        input.returnTime || input.localReturnTime || null,
        input.pickupLocation || null,
        input.destination || input.localDestination || null,
        input.duration || input.localDuration || null,
        input.passengers ? Number(input.passengers) : null,
        input.vehicleType || null,
        input.purpose || null
      ]
    );
    return;
  }

  throwBadRequest(`Unsupported transport request type: ${transportType}`);
}

async function ensureRequesterUser(connection, input, departmentId, locationId) {
  const email = cleanEmail(input.requesterEmail || input.email);
  if (!email) return null;

  const fullName = nameFromEmail(email);
  const [result] = await connection.execute(
    `INSERT INTO users (full_name, email, department_id, location_id, is_active, created_by, updated_by)
     VALUES (?, ?, ?, ?, 1, NULL, NULL)
     ON DUPLICATE KEY UPDATE
       id = LAST_INSERT_ID(id),
       full_name = CASE
         WHEN VALUES(full_name) <> '' THEN VALUES(full_name)
         ELSE full_name
       END,
       department_id = COALESCE(VALUES(department_id), department_id),
       location_id = COALESCE(VALUES(location_id), location_id),
       is_active = 1,
       deleted_at = NULL`,
    [fullName, email, departmentId, locationId]
  );
  return result.insertId;
}

function normalizeRequestIdentity(input) {
  const noteIdentity = parseSubmittedBy(input.notes || input.notes_remarks);
  const requesterEmail = cleanEmail(input.requesterEmail || input.email || noteIdentity.email);
  return {
    ...input,
    requestedBy: requesterEmail ? nameFromEmail(requesterEmail) : String(input.requestedBy || input.requester || noteIdentity.name || "").trim(),
    requesterEmail,
    lineManagerEmail: cleanEmail(input.lineManagerEmail || input.managerEmail || input.line_manager_email || parseLineManagerEmail(input.notes || input.notes_remarks))
  };
}

function parseSubmittedBy(notes) {
  const match = String(notes || "").match(/Submitted by:\s*(.*?)\s*\(([^)@]+@[^)]+)\)/i);
  if (!match) return {};
  return {
    name: match[1].trim(),
    email: match[2].trim()
  };
}

function parseLineManagerEmail(notes) {
  const match = String(notes || "").match(/line\s*manager\s*(?:email)?\s*:\s*([^|\s]+@[^|\s]+)/i);
  return match ? match[1].trim() : "";
}

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function nameFromEmail(email) {
  return email
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function listPurchaseOrders() {
  const [rows] = await pool.execute(
    `SELECT po.id, po.po_number AS poNumber, po.issue_date AS issueDate, po.status,
            po.subtotal_amount AS subtotal, po.tax_amount AS taxAmount, po.total_amount AS poAmount,
            po.expected_date AS arrivedBy, po.notes_remarks AS notesRemarks,
            v.id AS vendorId, v.name AS vendorName,
            CONCAT_WS(' / ', NULLIF(v.contact, ''), NULLIF(v.phone, ''), NULLIF(v.email, '')) AS vendorContact,
            v.address AS vendorAddress, v.bank_name AS bankName, v.account_title AS accountTitle, v.account_no AS accountNo,
            l.name AS location, pol.id AS lineId, pol.line_no AS lineNo,
            pol.description AS specifications, pol.quantity_ordered AS quantityOrdered,
            pol.quantity_received AS quantityReceived, pol.unit_price AS unitPrice, pol.tax_rate AS taxRate,
            i.item_id AS itemCode, i.item_name AS itemName, i.item_type AS itemType, c.name AS category
     FROM purchase_orders po
     JOIN vendors v ON v.id = po.vendor_id
     LEFT JOIN locations l ON l.id = po.delivery_location_id
     LEFT JOIN purchase_order_lines pol ON pol.purchase_order_id = po.id
     LEFT JOIN items i ON i.id = pol.item_id
     LEFT JOIN item_categories c ON c.id = i.category_id
     WHERE po.deleted_at IS NULL
     ORDER BY po.created_at DESC, po.id DESC, pol.line_no ASC`
  );
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.id)) {
      grouped.set(row.id, {
        ...row,
        items: [],
        quantityOrdered: 0,
        quantityReceived: 0,
        unitPrice: 0
      });
    }
    const po = grouped.get(row.id);
    if (!row.lineNo) continue;
    const line = {
      lineNo: row.lineNo,
      lineId: row.lineId,
      category: row.category || "",
      itemName: row.itemName || "",
      itemType: row.itemType || "",
      itemCode: row.itemCode || "",
      specifications: row.specifications || "",
      quantityOrdered: Number(row.quantityOrdered || 0),
      quantityReceived: Number(row.quantityReceived || 0),
      unitPrice: Number(row.unitPrice || 0),
      taxRate: Number(row.taxRate || 0),
      subtotal: Number(row.quantityOrdered || 0) * Number(row.unitPrice || 0)
    };
    po.items.push(line);
    po.quantityOrdered += line.quantityOrdered;
    po.quantityReceived += line.quantityReceived;
    if (po.items.length === 1) {
      po.category = line.category;
      po.itemName = line.itemName;
      po.itemType = line.itemType;
      po.itemCode = line.itemCode;
      po.specifications = line.specifications;
      po.unitPrice = line.unitPrice;
      po.taxRate = line.taxRate;
    }
  }
  return [...grouped.values()];
}

async function createPurchaseOrder(input, userId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const poNumber = input.poNumber || await nextNumber(connection, "purchase_orders", "po_number", "PO");
    const locationId = await ensureNamed(connection, "locations", input.location);
    const lines = Array.isArray(input.items) && input.items.length ? input.items : [input];
    if (lines.length > 20) throwBadRequest("A PO can include up to 20 items.");
    const taxRate = Number(input.taxRate || 0);
    const preparedLines = [];
    for (const [index, line] of lines.entries()) {
      const item = await getItemByCode(connection, line.itemCode || line.productCode, {
        name: line.itemName || line.specifications,
        type: line.itemType,
        category: line.category || input.category || "Procurement",
        userId
      });
      const qty = Number(line.quantityOrdered);
      if (!qty || qty <= 0) throwBadRequest("Quantity ordered must be greater than zero for every item.");
      const unitPrice = Number(line.unitPrice || 0);
      preparedLines.push({
        lineNo: index + 1,
        item,
        description: line.specifications || `${item.item_name} - ${item.item_type}`,
        qty,
        unitPrice,
        taxRate: Number(line.taxRate ?? taxRate)
      });
    }
    const subtotal = preparedLines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
    const tax = subtotal * taxRate / 100;
    const statusMap = { Open: "Draft", Ordered: "Sent", Closed: "Closed" };
    const status = statusMap[input.status] || input.status || "Draft";
    const allowedStatuses = new Set(["Draft", "Pending Approval", "Approved", "Sent", "Partially Received", "Received", "Cancelled", "Closed"]);
    if (!allowedStatuses.has(status)) throwBadRequest(`Unsupported PO status: ${status}.`);
    const vendorId = positive(input.vendorId, "Vendor");
    const [vendorRows] = await connection.execute(
      `SELECT id FROM vendors WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [vendorId]
    );
    if (!vendorRows.length) throwBadRequest("Selected vendor was not found. Refresh vendors and try again.");
    const [poResult] = await connection.execute(
      `INSERT INTO purchase_orders (po_number, issue_date, vendor_id, status, expected_date, delivery_location_id,
        subtotal_amount, tax_amount, total_amount, notes_remarks, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [poNumber, input.issueDate || null, vendorId, status, input.arrivedBy || null, locationId, subtotal, tax, subtotal + tax, input.notesRemarks || null, userId, userId]
    );
    for (const line of preparedLines) {
      await connection.execute(
        `INSERT INTO purchase_order_lines (purchase_order_id, line_no, item_id, description, quantity_ordered, quantity_received, unit_price, tax_rate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [poResult.insertId, line.lineNo, line.item.id, line.description, line.qty, 0, line.unitPrice, line.taxRate]
      );
    }
    await audit("purchase_orders", poResult.insertId, "INSERT", userId, { poNumber }, connection);
    await notifyPermissionUsers(connection, "purchase_order.manage", {
      key: `po-created-${poNumber}-${poResult.insertId}`,
      title: `PO ${poNumber} created`,
      body: `Purchase order ${poNumber} was created with ${preparedLines.length} line${preparedLines.length === 1 ? "" : "s"}.`,
      entityType: "purchase_orders",
      entityId: poResult.insertId,
      metadata: { type: "po_created", poNumber, audience: "direct" },
      createdBy: userId
    });
    await connection.commit();
    return { poNumber };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function cancelPurchaseOrder(poNumber, input, userId) {
  const reason = required(input?.reason, "Cancellation reason");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, status, notes_remarks AS notesRemarks
       FROM purchase_orders
       WHERE po_number = ? AND deleted_at IS NULL
       LIMIT 1`,
      [required(poNumber, "PO number")]
    );
    const po = rows[0];
    if (!po) throwBadRequest("Purchase order not found.");
    if (["Received", "Cancelled", "Closed"].includes(po.status)) {
      throwBadRequest(`Purchase order cannot be cancelled because it is ${po.status}.`);
    }
    const cancellationNote = `Cancellation reason: ${reason}`;
    const notes = [po.notesRemarks, cancellationNote].filter(Boolean).join("\n");
    await connection.execute(
      `UPDATE purchase_orders
       SET status = 'Cancelled', notes_remarks = ?, updated_by = ?
       WHERE id = ?`,
      [notes, userId, po.id]
    );
    await audit("purchase_orders", po.id, "UPDATE", userId, { poNumber, status: "Cancelled", reason }, connection);
    await connection.commit();
    return { poNumber, status: "Cancelled" };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listGrns() {
  const receivedByColumn = await getColumnType(pool, "grns", "received_by");
  const hasLegacyPoId = await tableColumnExists(pool, "grns", "po_id");
  const poJoinExpression = hasLegacyPoId ? "COALESCE(g.purchase_order_id, g.po_id)" : "g.purchase_order_id";
  const receivedBySelect = receivedByColumn.includes("int")
    ? "u.full_name AS receivedBy"
    : "g.received_by AS receivedBy";
  const [rows] = await pool.execute(
    `SELECT g.id, g.grn_number AS grnNumber, po.po_number AS poNumber, g.grn_date AS date,
            l.name AS location, ${receivedBySelect}, gl.quantity_received AS qtyReceived,
            gl.quantity_accepted AS qtyAccepted, i.item_id AS itemCode,
            i.item_name AS itemName, i.item_type AS itemType, gl.stock_movement_id AS stockMovementId
     FROM grns g
     LEFT JOIN purchase_orders po ON po.id = ${poJoinExpression}
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
    const qtyReceived = Number(input.qtyReceived);
    const qtyAccepted = Number(input.qtyAccepted);
    if (!qtyReceived || qtyReceived <= 0) throwBadRequest("Quantity received must be greater than zero.");
    if (qtyAccepted < 0 || qtyAccepted > qtyReceived) throwBadRequest("Accepted quantity must be between zero and received quantity.");
    const po = await getPurchaseOrderForGrn(connection, input.poNumber, item.id, item.item_id, input.poLineId);
    const remainingPoQuantity = Math.max(Number(po.quantityOrdered || 0) - Number(po.quantityReceived || 0), 0);
    if (qtyAccepted > remainingPoQuantity) {
      throwBadRequest(`Accepted quantity cannot exceed remaining PO quantity (${remainingPoQuantity}).`);
    }
    const grnNumber = await nextNumber(connection, "grns", "grn_number", "GRN");
    const hasLegacyGrnId = await tableColumnExists(connection, "grns", "grn_id");
    const hasLegacyPoId = await tableColumnExists(connection, "grns", "po_id");
    const hasLegacyQuantityReceived = await tableColumnExists(connection, "grns", "quantity_received");
    const receivedByColumn = await getColumnType(connection, "grns", "received_by");
    const receivedByValue = receivedByColumn.includes("int") ? userId : String(input.receivedBy || "");
    const grnColumns = [
      ...(hasLegacyGrnId ? ["grn_id"] : []),
      "grn_number",
      ...(hasLegacyPoId ? ["po_id"] : []),
      "purchase_order_id",
      ...(hasLegacyQuantityReceived ? ["quantity_received"] : []),
      "grn_date",
      "received_by",
      "location_id",
      "status",
      "notes_remarks",
      "created_by",
      "updated_by"
    ];
    const grnValues = [
      ...(hasLegacyGrnId ? [grnNumber] : []),
      grnNumber,
      ...(hasLegacyPoId ? [po.id] : []),
      po.id,
      ...(hasLegacyQuantityReceived ? [qtyReceived] : []),
      input.date || new Date().toISOString().slice(0, 10),
      receivedByValue,
      locationId,
      qtyAccepted > 0 ? "Posted" : "Rejected",
      input.notes || null,
      userId,
      userId
    ];
    const [grnResult] = await connection.execute(
      `INSERT INTO grns (${grnColumns.join(", ")})
       VALUES (${grnColumns.map(() => "?").join(", ")})`,
      grnValues
    );
    let stockMovementId = null;
    if (qtyAccepted > 0) {
      const movementNumber = await nextNumber(connection, "stock_movements", "movement_number", "MOV", 8);
      await connection.execute(
        "CALL sp_record_stock_movement(?, ?, ?, 'GRN_IN', ?, NULL, 'GRN', ?, ?, ?, ?)",
        [movementNumber, item.id, locationId, qtyAccepted, grnResult.insertId, po?.lineId || null, `GRN receipt ${grnNumber} for ${item.item_id}`, userId]
      );
      const [movementRows] = await connection.execute("SELECT id FROM stock_movements WHERE movement_number = ?", [movementNumber]);
      stockMovementId = movementRows[0]?.id || null;
      await reconcileInventoryBalance(connection, item.id, locationId);
    }
    await connection.execute(
      `INSERT INTO grn_lines (grn_id, purchase_order_line_id, line_no, item_id, quantity_received, quantity_accepted, quantity_rejected, stock_movement_id)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
      [grnResult.insertId, po?.lineId || null, item.id, qtyReceived, qtyAccepted, Math.max(qtyReceived - qtyAccepted, 0), stockMovementId]
    );
    if (po?.lineId) {
      await connection.execute(
        `UPDATE purchase_order_lines
         SET quantity_received = quantity_received + ?
         WHERE id = ?`,
        [qtyAccepted, po.lineId]
      );
      await refreshPurchaseOrderStatus(connection, po.id);
    }
    await audit("grns", grnResult.insertId, "INSERT", userId, { grnNumber, itemCode: item.item_id, stockMovementId }, connection);
    await notifyPermissionUsers(connection, "grn.manage", {
      key: `grn-created-${grnNumber}-${grnResult.insertId}`,
      title: `GRN ${grnNumber} created`,
      body: `${qtyAccepted} of ${item.item_id} accepted at ${input.location}.`,
      entityType: "grns",
      entityId: grnResult.insertId,
      metadata: { type: "grn_created", grnNumber, itemCode: item.item_id, audience: "direct" },
      createdBy: userId
    });
    await connection.commit();
    return { grnNumber };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getPurchaseOrderForGrn(connection, poNumber, itemId, itemCode, poLineId) {
  const cleanPoNumber = String(poNumber || "").trim();
  if (!cleanPoNumber) throwBadRequest("PO number is required for GRN.");
  if (poLineId) {
    const [lineRows] = await connection.execute(
      `SELECT po.id, pol.id AS lineId, pol.quantity_ordered AS quantityOrdered, pol.quantity_received AS quantityReceived
       FROM purchase_orders po
       JOIN purchase_order_lines pol ON pol.purchase_order_id = po.id
       WHERE po.po_number = ? AND pol.id = ? AND pol.item_id = ?
       LIMIT 1`,
      [cleanPoNumber, positive(poLineId, "PO item"), itemId]
    );
    if (!lineRows[0]) throwBadRequest(`Selected PO item does not match Item ID ${itemCode}.`);
    return lineRows[0];
  }
  const [rows] = await connection.execute(
    `SELECT po.id, pol.id AS lineId, pol.quantity_ordered AS quantityOrdered, pol.quantity_received AS quantityReceived
     FROM purchase_orders po
     JOIN purchase_order_lines pol ON pol.purchase_order_id = po.id
     WHERE po.po_number = ? AND pol.item_id = ?
     ORDER BY pol.line_no
     LIMIT 1`,
    [cleanPoNumber, itemId]
  );
  if (!rows[0]) throwBadRequest(`PO ${cleanPoNumber} does not contain Item ID ${itemCode}.`);
  return rows[0];
}

async function refreshPurchaseOrderStatus(connection, purchaseOrderId) {
  const [rows] = await connection.execute(
    `SELECT SUM(quantity_ordered) AS ordered, SUM(quantity_received) AS received
     FROM purchase_order_lines
     WHERE purchase_order_id = ?`,
    [purchaseOrderId]
  );
  const ordered = Number(rows[0]?.ordered || 0);
  const received = Number(rows[0]?.received || 0);
  const status = received <= 0 ? "Sent" : received < ordered ? "Partially Received" : "Received";
  await connection.execute("UPDATE purchase_orders SET status = ? WHERE id = ?", [status, purchaseOrderId]);
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
    await connection.beginTransaction();
    const item = await getItemByCode(connection, input.itemCode);
    const locationId = await ensureNamed(connection, "locations", input.location);
    const movementNumber = await nextNumber(connection, "stock_movements", "movement_number", "MOV", 8);
    await connection.execute(
      "CALL sp_record_stock_movement(?, ?, ?, ?, ?, NULL, 'MANUAL', NULL, NULL, ?, ?)",
      [movementNumber, item.id, locationId, type, Number(input.quantity), input.notes || null, userId]
    );
    const [rows] = await connection.execute("SELECT id FROM stock_movements WHERE movement_number = ?", [movementNumber]);
    await audit("stock_movements", rows[0]?.id || 0, "POST", userId, { movementNumber, type, ...input }, connection);
    if (type === "MANUAL_OUT") {
      await createNotification(connection, {
        key: `manual-stock-issued-${movementNumber}`,
        title: `Stock issued ${movementNumber}`,
        body: `${Number(input.quantity)} ${item.item_id} issued from ${input.location}.`,
        entityType: "stock_movements",
        entityId: rows[0]?.id || 0,
        metadata: { type: "stock_issued", movementNumber, itemCode: item.item_id, audience: "system" },
        createdBy: userId
      });
      await notifyLowStockIfNeeded(connection, item.id, locationId, userId);
    }
    await connection.commit();
    return { movementNumber };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listInventory() {
  const [rows] = await pool.execute(
    `SELECT v.item_pk AS id, v.item_id AS code, v.item_name AS name, v.item_type AS type, v.category,
            v.location_name AS location,
            COALESCE(m.quantity_on_hand, v.quantity_on_hand, 0) AS stock,
            COALESCE(m.quantity_reserved, v.quantity_reserved, 0) AS reserved,
            GREATEST(COALESCE(m.quantity_on_hand, v.quantity_on_hand, 0) - COALESCE(m.quantity_reserved, v.quantity_reserved, 0), 0) AS available,
            CASE WHEN COALESCE(m.quantity_on_hand, v.quantity_on_hand, 0) <= 0 THEN 'Out of stock' ELSE 'OK' END AS status
     FROM v_inventory_stock
     v
     LEFT JOIN (
       SELECT item_id, location_id,
              SUM(CASE
                    WHEN movement_type IN ('OPENING', 'GRN_IN', 'MANUAL_IN', 'TRANSFER_IN', 'ADJUSTMENT_IN') THEN quantity
                    WHEN movement_type IN ('REQUEST_ISSUE', 'MANUAL_OUT', 'TRANSFER_OUT', 'ADJUSTMENT_OUT') THEN -quantity
                    ELSE 0
                  END) AS quantity_on_hand,
              SUM(CASE
                    WHEN movement_type = 'RESERVE' THEN quantity
                    WHEN movement_type IN ('UNRESERVE', 'REQUEST_ISSUE') THEN -quantity
                    ELSE 0
                  END) AS quantity_reserved
        FROM stock_movements
       GROUP BY item_id, location_id
     ) m ON m.item_id = v.item_pk AND m.location_id = v.location_id
     ORDER BY v.item_name, v.item_type, v.location_name`
  );
  return rows;
}

async function reconcileInventoryBalance(connection, itemId, locationId) {
  const [rows] = await connection.execute(
    `SELECT
       COALESCE(SUM(CASE
         WHEN movement_type IN ('OPENING', 'GRN_IN', 'MANUAL_IN', 'TRANSFER_IN', 'ADJUSTMENT_IN') THEN quantity
         WHEN movement_type IN ('REQUEST_ISSUE', 'MANUAL_OUT', 'TRANSFER_OUT', 'ADJUSTMENT_OUT') THEN -quantity
         ELSE 0
       END), 0) AS quantityOnHand,
       COALESCE(SUM(CASE
         WHEN movement_type = 'RESERVE' THEN quantity
         WHEN movement_type IN ('UNRESERVE', 'REQUEST_ISSUE') THEN -quantity
         ELSE 0
       END), 0) AS quantityReserved
     FROM stock_movements
     WHERE item_id = ? AND location_id = ?`,
    [itemId, locationId]
  );
  const onHand = Math.max(Number(rows[0]?.quantityOnHand || 0), 0);
  const reserved = Math.min(Math.max(Number(rows[0]?.quantityReserved || 0), 0), onHand);
  await connection.execute(
    `INSERT INTO inventory_balances (item_id, location_id, quantity_on_hand, quantity_reserved, last_movement_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       quantity_on_hand = VALUES(quantity_on_hand),
       quantity_reserved = VALUES(quantity_reserved),
       last_movement_at = VALUES(last_movement_at)`,
    [itemId, locationId, onHand, reserved]
  );
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

async function getItemByCode(connection, code, fallback = {}) {
  const itemCode = required(code, "Item ID");
  const [rows] = await connection.execute("SELECT * FROM items WHERE item_id = ? LIMIT 1", [itemCode]);
  if (rows[0]) return rows[0];

  if (!fallback.name) throwBadRequest(`Unknown item ID: ${itemCode}`);

  const categoryId = await ensureNamed(connection, "item_categories", fallback.category || "General");
  const itemName = String(fallback.name).trim().slice(0, 255);
  const itemType = String(fallback.type || "NA").trim().slice(0, 255) || "NA";
  const [result] = await connection.execute(
    `INSERT INTO items (item_id, item_name, item_type, category_id, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [itemCode, itemName, itemType, categoryId, fallback.userId || null, fallback.userId || null]
  );
  return {
    id: result.insertId,
    item_id: itemCode,
    item_name: itemName,
    item_type: itemType
  };
}

async function getRequestLineForUpdate(connection, requestNumber, itemId) {
  const [rows] = await connection.execute(
    `SELECT r.id AS requestId, r.request_number, r.requester_user_id AS requesterUserId,
            u.email AS requesterEmail, r.line_manager_email AS managerEmail, ri.*
     FROM requests r
     LEFT JOIN users u ON u.id = r.requester_user_id
     JOIN request_items ri ON ri.request_id = r.id
     WHERE r.request_number = ? AND ri.id = ?
     FOR UPDATE`,
    [required(requestNumber, "Request ID"), positive(itemId, "Request line")]
  );
  const row = rows[0];
  if (!row) throwBadRequest("Request item not found.");
  return {
    request: { id: row.requestId, request_number: row.request_number, requesterUserId: row.requesterUserId, requesterEmail: row.requesterEmail, managerEmail: row.managerEmail },
    item: row
  };
}

async function getTransportForUpdate(connection, id) {
  const [rows] = await connection.execute(
    `SELECT tr.id, tr.request_number, tr.approval_status, tr.status,
            tr.requester_user_id AS requesterUserId, u.email AS requesterEmail,
            tr.line_manager_email AS managerEmail
     FROM transport_requests tr
     LEFT JOIN users u ON u.id = tr.requester_user_id
     WHERE tr.id = ?
     FOR UPDATE`,
    [positive(id, "Transport request")]
  );
  if (!rows[0]) throwBadRequest("Transport request not found.");
  return rows[0];
}

function assertLineManagerApprovalAccess(record = {}, authContext = {}) {
  const roles = (authContext.roles || []).map((role) => String(role || "").toLowerCase());
  if (roles.includes("admin")) return;

  const userEmail = cleanEmail(authContext.user?.email);
  const managerEmail = cleanEmail(record.managerEmail || record.line_manager_email);
  if (userEmail && managerEmail && userEmail === managerEmail) return;

  const error = new Error("This request is assigned to another line manager.");
  error.statusCode = 403;
  throw error;
}

async function recomputeRequestStatuses(connection, requestId, userId) {
  const [rows] = await connection.execute(
    `SELECT line_status
     FROM request_items
     WHERE request_id = ?
     ORDER BY line_no`,
    [requestId]
  );
  const statuses = rows.map((row) => row.line_status);
  const approvalStatus = statuses.every((status) => status === "Rejected")
    ? "Rejected"
    : statuses.some((status) => status === "Pending Approval")
      ? "Pending Approval"
      : "Approved";
  const issuableStatuses = statuses.filter((status) => status !== "Rejected");
  const issuanceStatus = !issuableStatuses.length
    ? "Closed"
    : issuableStatuses.every((status) => status === "Issued")
      ? "Issued"
      : issuableStatuses.some((status) => ["Issued", "Partially Issued"].includes(status))
        ? "Partially Issued"
        : "Not Issued";
  await connection.execute(
    `UPDATE requests
     SET approval_status = ?, issuance_status = ?, updated_by = ?
     WHERE id = ?`,
    [approvalStatus, issuanceStatus, userId, requestId]
  );
}

async function firstOrExistingItem(connection, code, description, userId) {
  if (code) {
    const [rows] = await connection.execute("SELECT * FROM items WHERE item_id = ? LIMIT 1", [code]);
    if (rows[0]) return rows[0];
  }
  const fallbackCode = code || `PO-SERVICE-${Date.now()}`;
  const categoryId = await ensureNamed(connection, "item_categories", "Procurement");
  const [result] = await connection.execute(
    `INSERT INTO items (item_id, item_name, item_type, category_id, created_by, updated_by)
     VALUES (?, ?, 'Specification', ?, ?, ?)`,
    [fallbackCode, String(description || "Procurement item").slice(0, 255), categoryId, userId, userId]
  );
  return { id: result.insertId, item_id: fallbackCode, item_name: description || fallbackCode };
}

async function nextNumber(connection, table, column, prefix, pad = 3) {
  const [rows] = await connection.execute(`SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM ${table}`);
  return `${prefix}-${String(rows[0].next_id).padStart(pad, "0")}`;
}

async function tableColumnExists(connection, table, column) {
  const [rows] = await connection.execute(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function getColumnType(connection, table, column) {
  const [rows] = await connection.execute(
    `SELECT DATA_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  return String(rows[0]?.DATA_TYPE || "").toLowerCase();
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
      quantityApproved: row.quantityApproved,
      quantityIssued: row.quantityIssued,
      approvalStatus: approvalStatusFromLine(row.lineStatus),
      issuanceStatus: issuanceStatusFromLine(row.lineStatus)
    });
  });
  return [...map.values()];
}

function approvalStatusFromLine(status) {
  if (status === "Pending Approval") return "Pending";
  if (status === "Rejected") return "Rejected";
  if (status === "Cancelled") return "Cancelled";
  return "Approved";
}

function issuanceStatusFromLine(status) {
  if (status === "Issued") return "Issued";
  if (status === "Partially Issued") return "Partially Issued";
  if (status === "Rejected") return "Rejected";
  if (status === "Cancelled") return "Cancelled";
  return "Pending";
}

function cleanTransportPurpose(value) {
  return String(value || "")
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part && !/^Submitted by:/i.test(part) && !/^Line manager email:/i.test(part))
    .join(" | ");
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
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  listInventory,
  postStockMovement,
  listItems,
  syncImportedInventory,
  createItems,
  listVendors,
  createVendor,
  updateVendor,
  listRequests,
  createRequest,
  updateRequestApproval,
  issueRequestStock,
  listTransportRequests,
  createTransportRequest,
  updateTransportApproval,
  updateTransportArrangement,
  listPurchaseOrders,
  createPurchaseOrder,
  cancelPurchaseOrder,
  listGrns,
  createGrn,
  listAudit
};
