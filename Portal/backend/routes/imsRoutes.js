const express = require("express");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const multer = require("multer");
const imsService = require("../services/imsService");
const authService = require("../services/authService");
const notificationStream = require("../services/notificationStreamService");
const { PERMISSIONS } = require("../config/permissions");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const { adminWriteLimiter, writeLimiter } = require("../middleware/rateLimitMiddleware");
const { ok } = require("../utils/apiResponse");
const v = require("../utils/validation");

const router = express.Router();
const GRN_INVOICE_UPLOAD_DIR = path.resolve(__dirname, "../../uploads/grn-invoices");
const GRN_INVOICE_PUBLIC_BASE = "/uploads/grn-invoices";
const GRN_INVOICE_MAX_BYTES = 5 * 1024 * 1024;
const GRN_INVOICE_ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
const GRN_INVOICE_ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const grnInvoiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: GRN_INVOICE_MAX_BYTES },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (!GRN_INVOICE_ALLOWED_EXTENSIONS.has(ext) || !GRN_INVOICE_ALLOWED_MIME_TYPES.has(file.mimetype)) {
      const error = new Error("Invoice file must be a JPG, PNG, WEBP, or PDF under 5MB.");
      error.statusCode = 400;
      return cb(error);
    }
    return cb(null, true);
  }
});

router.get("/notifications/stream", async (req, res, next) => {
  try {
    const token = String(req.query.token || "").trim();
    const auth = await authService.resolveAuthContextFromToken(token);
    if (!auth) {
      const error = new Error("Authentication required.");
      error.statusCode = 401;
      throw error;
    }
    notificationStream.registerNotificationStream(auth, req, res);
  } catch (error) {
    next(error);
  }
});

router.use(requireAuth);

router.get("/inventory", requirePermission(PERMISSIONS.VIEW_INVENTORY), async (req, res, next) => {
  try { ok(res, { inventory: await imsService.listInventory() }); } catch (error) { next(error); }
});

router.get("/notifications", v.validateQuery(notificationQuery), async (req, res, next) => {
  try { ok(res, { notifications: await imsService.listNotifications(req.auth, req.query) }); } catch (error) { next(error); }
});

router.get("/audit", requirePermission(PERMISSIONS.VIEW_AUDIT), async (req, res, next) => {
  try { ok(res, { auditLogs: await imsService.listAuditLogs() }); } catch (error) { next(error); }
});

router.get("/reports/:reportKey", requirePermission(PERMISSIONS.VIEW_INVENTORY), async (req, res, next) => {
  try { ok(res, await imsService.getReport(req.params.reportKey, req.query, req.auth)); } catch (error) { next(error); }
});

router.get("/dashboard/summary", requirePermission(PERMISSIONS.VIEW_INVENTORY), async (req, res, next) => {
  try { ok(res, { summary: await imsService.getDashboardSummary(req.query, req.auth) }); } catch (error) { next(error); }
});

router.patch("/notifications/read-all", writeLimiter, async (req, res, next) => {
  try { ok(res, await imsService.markAllNotificationsRead(req.auth)); } catch (error) { next(error); }
});

router.patch("/notifications/:id/read", writeLimiter, v.validateParams(idParam("id")), async (req, res, next) => {
  try { ok(res, await imsService.markNotificationRead(req.params.id, req.auth)); } catch (error) { next(error); }
});

router.post("/stock/adjust", writeLimiter, requirePermission(PERMISSIONS.MANAGE_INVENTORY), v.validateBody(stockAdjustmentSchema), async (req, res, next) => {
  try { ok(res, await imsService.postStockAdjustment(req.body, req.auth.user.id), 201); } catch (error) { next(error); }
});

router.post("/stock/out", writeLimiter, requirePermission(PERMISSIONS.MANAGE_INVENTORY), v.validateBody(stockMovementSchema), async (req, res, next) => {
  try { ok(res, await imsService.postStockMovement(req.body, req.auth.user.id, "MANUAL_OUT"), 201); } catch (error) { next(error); }
});

router.get("/items", requirePermission(PERMISSIONS.VIEW_INVENTORY), async (req, res, next) => {
  try { ok(res, { items: await imsService.listItems() }); } catch (error) { next(error); }
});

router.get("/categories", requirePermission(PERMISSIONS.VIEW_INVENTORY), async (req, res, next) => {
  try { ok(res, { categories: await imsService.listCategories() }); } catch (error) { next(error); }
});

router.get("/locations", requirePermission(PERMISSIONS.VIEW_INVENTORY), async (req, res, next) => {
  try { ok(res, { locations: await imsService.listLocations() }); } catch (error) { next(error); }
});

router.post("/items", adminWriteLimiter, requirePermission(PERMISSIONS.MANAGE_INVENTORY), v.validateBody(itemsSchema), async (req, res, next) => {
  try { ok(res, { items: await imsService.createItems(req.body, req.auth.user.id) }, 201); } catch (error) { next(error); }
});

router.post("/categories", adminWriteLimiter, requirePermission(PERMISSIONS.MANAGE_INVENTORY), v.validateBody(categorySchema), async (req, res, next) => {
  try { ok(res, { category: await imsService.createCategory(req.body, req.auth.user.id) }, 201); } catch (error) { next(error); }
});

router.post("/locations", adminWriteLimiter, requirePermission(PERMISSIONS.MANAGE_INVENTORY), v.validateBody(locationSchema), async (req, res, next) => {
  try { ok(res, { location: await imsService.createLocation(req.body, req.auth.user.id) }, 201); } catch (error) { next(error); }
});

router.delete("/categories/:categoryId", adminWriteLimiter, requirePermission(PERMISSIONS.MANAGE_INVENTORY), v.validateParams(idParam("categoryId")), async (req, res, next) => {
  try { ok(res, { category: await imsService.deleteCategory(req.params.categoryId, req.auth.user.id) }); } catch (error) { next(error); }
});

router.delete("/items/:itemCode", adminWriteLimiter, requirePermission(PERMISSIONS.MANAGE_INVENTORY), v.validateParams(itemCodeParam), async (req, res, next) => {
  try { ok(res, await imsService.deleteItem(req.params.itemCode, req.auth.user.id)); } catch (error) { next(error); }
});

router.post("/items/sync-import", adminWriteLimiter, requirePermission(PERMISSIONS.MANAGE_INVENTORY), v.validateBody(syncImportSchema), async (req, res, next) => {
  try { ok(res, await imsService.syncImportedInventory(req.body, req.auth.user.id)); } catch (error) { next(error); }
});

router.get("/vendors", requirePermission(PERMISSIONS.MANAGE_PURCHASE_ORDERS), async (req, res, next) => {
  try { ok(res, { vendors: await imsService.listVendors() }); } catch (error) { next(error); }
});

router.post("/vendors", writeLimiter, requirePermission(PERMISSIONS.MANAGE_PURCHASE_ORDERS), v.validateBody(vendorSchema), async (req, res, next) => {
  try { ok(res, { vendor: await imsService.createVendor(req.body, req.auth.user.id) }, 201); } catch (error) { next(error); }
});

router.post("/vendors/:vendorId", writeLimiter, requirePermission(PERMISSIONS.MANAGE_PURCHASE_ORDERS), v.validateParams(idParam("vendorId")), v.validateBody(vendorSchema), async (req, res, next) => {
  try { ok(res, { vendor: await imsService.updateVendor(req.params.vendorId, req.body, req.auth.user.id) }); } catch (error) { next(error); }
});

router.put("/vendors/:vendorId", writeLimiter, requirePermission(PERMISSIONS.MANAGE_PURCHASE_ORDERS), v.validateParams(idParam("vendorId")), v.validateBody(vendorSchema), async (req, res, next) => {
  try { ok(res, { vendor: await imsService.updateVendor(req.params.vendorId, req.body, req.auth.user.id) }); } catch (error) { next(error); }
});

router.delete("/vendors/:vendorId", writeLimiter, requirePermission(PERMISSIONS.MANAGE_PURCHASE_ORDERS), v.validateParams(idParam("vendorId")), async (req, res, next) => {
  try { ok(res, { vendor: await imsService.deleteVendor(req.params.vendorId, req.auth.user.id) }); } catch (error) { next(error); }
});

router.get("/requests", requirePermission(PERMISSIONS.CREATE_REQUESTS), async (req, res, next) => {
  try { ok(res, { requests: await imsService.listRequests(req.auth) }); } catch (error) { next(error); }
});

router.post("/requests", writeLimiter, requirePermission(PERMISSIONS.CREATE_REQUESTS), v.validateBody(requestSchema), async (req, res, next) => {
  try { ok(res, await imsService.createRequest(req.body, req.auth.user.id), 201); } catch (error) { next(error); }
});

router.put("/requests/:requestId/items/:itemId/approval", writeLimiter, requirePermission(PERMISSIONS.APPROVE_REQUESTS), v.validateParams(requestItemParams), v.validateBody(approvalSchema), async (req, res, next) => {
  try { ok(res, await imsService.updateRequestApproval(req.params.requestId, req.params.itemId, req.body, req.auth)); } catch (error) { next(error); }
});

router.post("/requests/:requestId/items/:itemId/issue", writeLimiter, requirePermission(PERMISSIONS.ISSUE_STOCK), v.validateParams(requestItemParams), v.validateBody(issueSchema), async (req, res, next) => {
  try { ok(res, await imsService.issueRequestStock(req.params.requestId, req.params.itemId, req.body, req.auth.user.id), 201); } catch (error) { next(error); }
});

router.get("/transport-requests", requirePermission(PERMISSIONS.CREATE_REQUESTS), async (req, res, next) => {
  try { ok(res, { transportRequests: await imsService.listTransportRequests(req.auth) }); } catch (error) { next(error); }
});

router.post("/transport-requests", writeLimiter, requirePermission(PERMISSIONS.CREATE_REQUESTS), v.validateBody(transportRequestSchema), async (req, res, next) => {
  try { ok(res, await imsService.createTransportRequest(req.body, req.auth.user.id), 201); } catch (error) { next(error); }
});

router.put("/transport-requests/:id/approval", writeLimiter, requirePermission(PERMISSIONS.APPROVE_REQUESTS), v.validateParams(idParam("id")), v.validateBody(approvalSchema), async (req, res, next) => {
  try { ok(res, await imsService.updateTransportApproval(req.params.id, req.body, req.auth)); } catch (error) { next(error); }
});

router.put("/transport-requests/:id/arrangement", writeLimiter, requirePermission(PERMISSIONS.MANAGE_INVENTORY), v.validateParams(idParam("id")), v.validateBody(arrangementSchema), async (req, res, next) => {
  try { ok(res, await imsService.updateTransportArrangement(req.params.id, req.body, req.auth.user.id)); } catch (error) { next(error); }
});

router.get("/purchase-orders", requirePermission(PERMISSIONS.MANAGE_PURCHASE_ORDERS), async (req, res, next) => {
  try { ok(res, { purchaseOrders: await imsService.listPurchaseOrders() }); } catch (error) { next(error); }
});

router.post("/purchase-orders", writeLimiter, requirePermission(PERMISSIONS.MANAGE_PURCHASE_ORDERS), v.validateBody(purchaseOrderSchema), async (req, res, next) => {
  try { ok(res, await imsService.createPurchaseOrder(req.body, req.auth.user.id), 201); } catch (error) { next(error); }
});

router.put("/purchase-orders/:poNumber/cancel", writeLimiter, requirePermission(PERMISSIONS.MANAGE_PURCHASE_ORDERS), v.validateParams(poNumberParam), v.validateBody(cancelPoSchema), async (req, res, next) => {
  try { ok(res, await imsService.cancelPurchaseOrder(req.params.poNumber, req.body, req.auth.user.id)); } catch (error) { next(error); }
});

router.get("/grn", requirePermission(PERMISSIONS.MANAGE_GRNS), async (req, res, next) => {
  try { ok(res, { grns: await imsService.listGrns() }); } catch (error) { next(error); }
});

router.post("/grn", writeLimiter, requirePermission(PERMISSIONS.MANAGE_GRNS), v.validateBody(grnSchema), async (req, res, next) => {
  try { ok(res, await imsService.createGrn(req.body, req.auth.user.id), 201); } catch (error) { next(error); }
});

router.post("/grns/:grnNumber/invoice", writeLimiter, requirePermission(PERMISSIONS.MANAGE_GRNS), v.validateParams(grnNumberParam), grnInvoiceUpload.single("invoiceFile"), async (req, res, next) => {
  let savedPath = "";
  try {
    if (!req.file) {
      const error = new Error("Choose an invoice file to upload.");
      error.statusCode = 400;
      throw error;
    }
    const ext = path.extname(req.file.originalname || "").toLowerCase();
    if (!GRN_INVOICE_ALLOWED_EXTENSIONS.has(ext) || !GRN_INVOICE_ALLOWED_MIME_TYPES.has(req.file.mimetype)) {
      const error = new Error("Invoice file must be a JPG, PNG, WEBP, or PDF under 5MB.");
      error.statusCode = 400;
      throw error;
    }
    await fs.mkdir(GRN_INVOICE_UPLOAD_DIR, { recursive: true });
    const safeName = `${req.params.grnNumber}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
    savedPath = path.join(GRN_INVOICE_UPLOAD_DIR, safeName);
    await fs.writeFile(savedPath, req.file.buffer, { flag: "wx" });
    const invoice = await imsService.attachGrnInvoice(req.params.grnNumber, {
      url: `${GRN_INVOICE_PUBLIC_BASE}/${safeName}`,
      originalName: path.basename(req.file.originalname || `invoice${ext}`).slice(0, 255),
      mimeType: req.file.mimetype
    }, req.auth.user.id);
    ok(res, { invoice }, 201);
  } catch (error) {
    if (savedPath) await fs.unlink(savedPath).catch(() => {});
    next(error);
  }
});

module.exports = router;

function notificationQuery(input) {
  return { unreadOnly: ["true", "false", true, false].includes(input.unreadOnly) ? input.unreadOnly : undefined };
}

function idParam(name) {
  return (input) => ({ ...input, [name]: v.positiveInt(input[name], name) });
}

function itemCodeParam(input) {
  return { itemCode: v.code(input.itemCode, "itemCode", { required: true }) };
}

function requestItemParams(input) {
  return {
    requestId: v.code(input.requestId, "requestId", { required: true, max: 40 }),
    itemId: v.positiveInt(input.itemId, "itemId")
  };
}

function poNumberParam(input) {
  return { poNumber: v.code(input.poNumber, "poNumber", { required: true, max: 40 }) };
}

function grnNumberParam(input) {
  return { grnNumber: v.code(input.grnNumber, "grnNumber", { required: true, max: 80 }) };
}

function stockMovementSchema(input) {
  return {
    itemCode: v.code(input.itemCode, "itemCode", { required: true }),
    location: v.requiredText(input.location, "location", 120),
    quantity: v.positiveNumber(input.quantity, "quantity", { max: 1000000 }),
    notes: v.optionalText(input.notes, "notes", 1000)
  };
}

function stockAdjustmentSchema(input) {
  return {
    ...stockMovementSchema(input),
    direction: v.oneOf(input.direction || "in", "direction", ["in", "out"], { required: true })
  };
}

function itemsSchema(input) {
  const types = v.array(input.types, "types", { min: 1, max: 50 }).map((row, index) => ({
    code: v.code(row?.code, `types[${index}].code`, { required: true }),
    type: v.requiredText(row?.type, `types[${index}].type`, 120)
  }));
  return {
    category: v.requiredText(input.category, "category", 120),
    name: v.requiredText(input.name, "name", 180),
    types
  };
}

function categorySchema(input) {
  return { name: v.requiredText(input.name, "name", 120) };
}

function locationSchema(input) {
  return {
    name: v.requiredText(input.name, "name", 120),
    code: input.code ? v.code(input.code, "code", { max: 40 }) : ""
  };
}

function syncImportSchema(input) {
  const locations = Array.isArray(input.locations) ? input.locations.map((location, index) => v.requiredText(location, `locations[${index}]`, 120)) : [];
  const items = v.array(input.items, "items", { min: 1, max: 5000 }).map((row, index) => ({
    code: v.code(row?.code, `items[${index}].code`, { required: true }),
    name: v.requiredText(row?.name, `items[${index}].name`, 180),
    type: v.requiredText(row?.type, `items[${index}].type`, 120),
    category: v.requiredText(row?.category, `items[${index}].category`, 120),
    notes: v.optionalText(row?.notes, `items[${index}].notes`, 500),
    active: row?.active === false ? false : true
  }));
  return { items, locations };
}

function vendorSchema(input) {
  return {
    name: v.requiredText(input.name, "name", 180),
    phone: v.optionalText(input.phone, "phone", 40),
    primaryPhone: v.optionalText(input.primaryPhone || input.primary_phone || input.phone, "primaryPhone", 40),
    secondaryPhone: v.optionalText(input.secondaryPhone || input.secondary_phone, "secondaryPhone", 40),
    contact: v.optionalText(input.contact, "contact", 120),
    email: input.email ? v.email(input.email, "email") : "",
    address: v.optionalText(input.address, "address", 500),
    ntn: v.optionalText(input.ntn, "ntn", 120),
    stn: v.optionalText(input.stn, "stn", 120),
    bankName: v.optionalText(input.bankName || input.bank_name, "bankName", 180),
    accountTitle: v.optionalText(input.accountTitle || input.account_title, "accountTitle", 180),
    accountNo: v.optionalText(input.accountNo || input.account_no, "accountNo", 120)
  };
}

function requestSchema(input) {
  const items = v.array(input.items, "items", { min: 1, max: 50 }).map((row, index) => ({
    itemCode: v.code(row?.itemCode, `items[${index}].itemCode`, { required: true }),
    itemName: v.requiredText(row?.itemName, `items[${index}].itemName`, 180),
    itemType: v.requiredText(row?.itemType || row?.type, `items[${index}].itemType`, 120),
    type: v.requiredText(row?.type || row?.itemType, `items[${index}].type`, 120),
    quantity: v.positiveNumber(row?.quantity, `items[${index}].quantity`, { max: 1000000 })
  }));
  const requestedBy = v.requiredText(input.requestedBy || input.requester, "requestedBy", 180);
  const lineManagerEmail = input.lineManagerEmail || input.managerEmail;
  return {
    requestedBy,
    requester: requestedBy,
    requesterEmail: input.requesterEmail ? v.email(input.requesterEmail, "requesterEmail") : "",
    lineManagerEmail: lineManagerEmail ? v.email(lineManagerEmail, "lineManagerEmail") : "",
    managerEmail: lineManagerEmail ? v.email(lineManagerEmail, "managerEmail") : "",
    department: v.requiredText(input.department, "department", 120),
    location: v.requiredText(input.location, "location", 120),
    category: v.optionalText(input.category, "category", 120),
    notes: v.optionalText(input.notes, "notes", 1000),
    items
  };
}

function approvalSchema(input) {
  return {
    status: v.oneOf(input.status, "status", ["Approved", "Rejected"], { required: true }),
    notes: v.optionalText(input.notes, "notes", 1000)
  };
}

function issueSchema(input) {
  return {
    quantity: v.positiveNumber(input.quantity, "quantity", { max: 1000000 }),
    issuedBy: v.optionalText(input.issuedBy, "issuedBy", 180),
    notes: v.optionalText(input.notes, "notes", 1000)
  };
}

function transportRequestSchema(input) {
  const transportType = v.requiredText(input.transportType || input.transportRequestType, "transportType", 80);
  return {
    ...input,
    requestedBy: v.requiredText(input.requestedBy, "requestedBy", 180),
    requesterEmail: input.requesterEmail ? v.email(input.requesterEmail, "requesterEmail") : "",
    lineManagerEmail: input.lineManagerEmail ? v.email(input.lineManagerEmail, "lineManagerEmail") : "",
    department: v.requiredText(input.department, "department", 120),
    location: v.requiredText(input.location, "location", 120),
    transportType,
    transportRequestType: transportType,
    travelDate: v.date(input.travelDate || input.transportDate, "travelDate"),
    transportDate: v.date(input.transportDate || input.travelDate, "transportDate"),
    pickupLocation: v.optionalText(input.pickupLocation, "pickupLocation", 180),
    destination: v.optionalText(input.destination || input.dropoffLocation, "destination", 180),
    dropoffLocation: v.optionalText(input.dropoffLocation || input.destination, "dropoffLocation", 180),
    vehicleType: v.optionalText(input.vehicleType, "vehicleType", 80),
    passengers: input.passengers ? v.positiveInt(input.passengers, "passengers", { max: 500 }) : "",
    purpose: v.optionalText(input.purpose, "purpose", 1000),
    notes: v.optionalText(input.notes, "notes", 1000)
  };
}

function arrangementSchema(input) {
  return {
    status: v.oneOf(input.status, "status", ["Pending", "Arranged", "Completed", "Cancelled"], { required: true }),
    notes: v.optionalText(input.notes, "notes", 1000)
  };
}

function purchaseOrderSchema(input) {
  const lines = Array.isArray(input.items) && input.items.length ? input.items : [input];
  const items = lines.map((row, index) => ({
    itemCode: v.code(row?.itemCode || row?.productCode, `items[${index}].itemCode`, { required: true }),
    productCode: v.code(row?.productCode || row?.itemCode, `items[${index}].productCode`),
    itemName: v.requiredText(row?.itemName || row?.specifications, `items[${index}].itemName`, 180),
    itemType: v.optionalText(row?.itemType, `items[${index}].itemType`, 120),
    category: v.optionalText(row?.category || input.category, `items[${index}].category`, 120),
    specifications: v.optionalText(row?.specifications, `items[${index}].specifications`, 1000),
    quantityOrdered: v.positiveNumber(row?.quantityOrdered, `items[${index}].quantityOrdered`, { max: 1000000 }),
    unitPrice: v.nonNegativeNumber(row?.unitPrice || 0, `items[${index}].unitPrice`, { max: 100000000 }),
    taxRate: v.nonNegativeNumber(row?.taxRate ?? input.taxRate ?? 0, `items[${index}].taxRate`, { max: 100 })
  }));
  return {
    ...input,
    poNumber: input.poNumber ? v.code(input.poNumber, "poNumber", { max: 40 }) : "",
    vendorId: v.positiveInt(input.vendorId, "vendorId"),
    issueDate: v.date(input.issueDate, "issueDate"),
    arrivedBy: v.date(input.arrivedBy, "arrivedBy"),
    location: v.requiredText(input.location, "location", 120),
    category: v.optionalText(input.category, "category", 120),
    status: input.status ? v.oneOf(input.status, "status", ["Open", "Ordered", "Closed", "Draft", "Pending Approval", "Approved", "Sent", "Partially Received", "Received", "Cancelled"], { required: true }) : "",
    taxRate: v.nonNegativeNumber(input.taxRate || 0, "taxRate", { max: 100 }),
    budgetLine: v.optionalText(input.budgetLine, "budgetLine", 180),
    donor: v.optionalText(input.donor, "donor", 180),
    notesRemarks: v.optionalText(input.notesRemarks, "notesRemarks", 1000),
    items
  };
}

function cancelPoSchema(input) {
  return { reason: v.requiredText(input.reason, "reason", 500) };
}

function grnSchema(input) {
  const qtyReceived = v.positiveNumber(input.qtyReceived, "qtyReceived", { max: 1000000 });
  const qtyAccepted = input.qtyAccepted === undefined || input.qtyAccepted === null || input.qtyAccepted === ""
    ? qtyReceived
    : v.nonNegativeNumber(input.qtyAccepted, "qtyAccepted", { max: 1000000 });
  if (qtyAccepted > qtyReceived) v.badRequest("qtyAccepted cannot exceed qtyReceived.");
  return {
    itemCode: v.code(input.itemCode, "itemCode", { required: true }),
    location: v.requiredText(input.location, "location", 120),
    qtyReceived,
    qtyAccepted,
    poNumber: v.code(input.poNumber, "poNumber", { required: true, max: 40 }),
    poLineId: v.optionalPositiveInt(input.poLineId, "poLineId"),
    date: v.date(input.date, "date"),
    receivedBy: v.optionalText(input.receivedBy, "receivedBy", 180),
    notes: v.optionalText(input.notes, "notes", 1000)
  };
}
