const express = require("express");
const imsService = require("../services/imsService");
const { PERMISSIONS } = require("../config/permissions");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const { ok } = require("../utils/apiResponse");

const router = express.Router();

router.use(requireAuth);

router.get("/inventory", requirePermission(PERMISSIONS.VIEW_INVENTORY), async (req, res, next) => {
  try { ok(res, { inventory: await imsService.listInventory() }); } catch (error) { next(error); }
});

router.get("/notifications", async (req, res, next) => {
  try { ok(res, { notifications: await imsService.listNotifications(req.auth, req.query) }); } catch (error) { next(error); }
});

router.patch("/notifications/read-all", async (req, res, next) => {
  try { ok(res, await imsService.markAllNotificationsRead(req.auth)); } catch (error) { next(error); }
});

router.patch("/notifications/:id/read", async (req, res, next) => {
  try { ok(res, await imsService.markNotificationRead(req.params.id, req.auth)); } catch (error) { next(error); }
});

router.post("/stock/adjust", requirePermission(PERMISSIONS.MANAGE_INVENTORY), async (req, res, next) => {
  try { ok(res, await imsService.postStockAdjustment(req.body, req.auth.user.id), 201); } catch (error) { next(error); }
});

router.post("/stock/out", requirePermission(PERMISSIONS.MANAGE_INVENTORY), async (req, res, next) => {
  try { ok(res, await imsService.postStockMovement(req.body, req.auth.user.id, "MANUAL_OUT"), 201); } catch (error) { next(error); }
});

router.get("/items", requirePermission(PERMISSIONS.VIEW_INVENTORY), async (req, res, next) => {
  try { ok(res, { items: await imsService.listItems() }); } catch (error) { next(error); }
});

router.get("/categories", requirePermission(PERMISSIONS.VIEW_INVENTORY), async (req, res, next) => {
  try { ok(res, { categories: await imsService.listCategories() }); } catch (error) { next(error); }
});

router.post("/items", requirePermission(PERMISSIONS.MANAGE_INVENTORY), async (req, res, next) => {
  try { ok(res, { items: await imsService.createItems(req.body, req.auth.user.id) }, 201); } catch (error) { next(error); }
});

router.post("/categories", requirePermission(PERMISSIONS.MANAGE_INVENTORY), async (req, res, next) => {
  try { ok(res, { category: await imsService.createCategory(req.body, req.auth.user.id) }, 201); } catch (error) { next(error); }
});

router.delete("/items/:itemCode", requirePermission(PERMISSIONS.MANAGE_INVENTORY), async (req, res, next) => {
  try { ok(res, await imsService.deleteItem(req.params.itemCode, req.auth.user.id)); } catch (error) { next(error); }
});

router.post("/items/sync-import", requirePermission(PERMISSIONS.MANAGE_INVENTORY), async (req, res, next) => {
  try { ok(res, await imsService.syncImportedInventory(req.body, req.auth.user.id)); } catch (error) { next(error); }
});

router.get("/vendors", requirePermission(PERMISSIONS.MANAGE_PURCHASE_ORDERS), async (req, res, next) => {
  try { ok(res, { vendors: await imsService.listVendors() }); } catch (error) { next(error); }
});

router.post("/vendors", requirePermission(PERMISSIONS.MANAGE_PURCHASE_ORDERS), async (req, res, next) => {
  try { ok(res, { vendor: await imsService.createVendor(req.body, req.auth.user.id) }, 201); } catch (error) { next(error); }
});

router.post("/vendors/:vendorId", requirePermission(PERMISSIONS.MANAGE_PURCHASE_ORDERS), async (req, res, next) => {
  try { ok(res, { vendor: await imsService.updateVendor(req.params.vendorId, req.body, req.auth.user.id) }); } catch (error) { next(error); }
});

router.put("/vendors/:vendorId", requirePermission(PERMISSIONS.MANAGE_PURCHASE_ORDERS), async (req, res, next) => {
  try { ok(res, { vendor: await imsService.updateVendor(req.params.vendorId, req.body, req.auth.user.id) }); } catch (error) { next(error); }
});

router.get("/requests", requirePermission(PERMISSIONS.CREATE_REQUESTS), async (req, res, next) => {
  try { ok(res, { requests: await imsService.listRequests() }); } catch (error) { next(error); }
});

router.post("/requests", requirePermission(PERMISSIONS.CREATE_REQUESTS), async (req, res, next) => {
  try { ok(res, await imsService.createRequest(req.body, req.auth.user.id), 201); } catch (error) { next(error); }
});

router.put("/requests/:requestId/items/:itemId/approval", requirePermission(PERMISSIONS.APPROVE_REQUESTS), async (req, res, next) => {
  try { ok(res, await imsService.updateRequestApproval(req.params.requestId, req.params.itemId, req.body, req.auth)); } catch (error) { next(error); }
});

router.post("/requests/:requestId/items/:itemId/issue", requirePermission(PERMISSIONS.ISSUE_STOCK), async (req, res, next) => {
  try { ok(res, await imsService.issueRequestStock(req.params.requestId, req.params.itemId, req.body, req.auth.user.id), 201); } catch (error) { next(error); }
});

router.get("/transport-requests", requirePermission(PERMISSIONS.CREATE_REQUESTS), async (req, res, next) => {
  try { ok(res, { transportRequests: await imsService.listTransportRequests() }); } catch (error) { next(error); }
});

router.post("/transport-requests", requirePermission(PERMISSIONS.CREATE_REQUESTS), async (req, res, next) => {
  try { ok(res, await imsService.createTransportRequest(req.body, req.auth.user.id), 201); } catch (error) { next(error); }
});

router.put("/transport-requests/:id/approval", requirePermission(PERMISSIONS.APPROVE_REQUESTS), async (req, res, next) => {
  try { ok(res, await imsService.updateTransportApproval(req.params.id, req.body, req.auth)); } catch (error) { next(error); }
});

router.put("/transport-requests/:id/arrangement", requirePermission(PERMISSIONS.MANAGE_INVENTORY), async (req, res, next) => {
  try { ok(res, await imsService.updateTransportArrangement(req.params.id, req.body, req.auth.user.id)); } catch (error) { next(error); }
});

router.get("/purchase-orders", requirePermission(PERMISSIONS.MANAGE_PURCHASE_ORDERS), async (req, res, next) => {
  try { ok(res, { purchaseOrders: await imsService.listPurchaseOrders() }); } catch (error) { next(error); }
});

router.post("/purchase-orders", requirePermission(PERMISSIONS.MANAGE_PURCHASE_ORDERS), async (req, res, next) => {
  try { ok(res, await imsService.createPurchaseOrder(req.body, req.auth.user.id), 201); } catch (error) { next(error); }
});

router.put("/purchase-orders/:poNumber/cancel", requirePermission(PERMISSIONS.MANAGE_PURCHASE_ORDERS), async (req, res, next) => {
  try { ok(res, await imsService.cancelPurchaseOrder(req.params.poNumber, req.body, req.auth.user.id)); } catch (error) { next(error); }
});

router.get("/grn", requirePermission(PERMISSIONS.MANAGE_GRNS), async (req, res, next) => {
  try { ok(res, { grns: await imsService.listGrns() }); } catch (error) { next(error); }
});

router.post("/grn", requirePermission(PERMISSIONS.MANAGE_GRNS), async (req, res, next) => {
  try { ok(res, await imsService.createGrn(req.body, req.auth.user.id), 201); } catch (error) { next(error); }
});

module.exports = router;
