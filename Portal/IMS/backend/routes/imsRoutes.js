const express = require("express");
const imsService = require("../services/imsService");
const { ok } = require("../utils/apiResponse");

const router = express.Router();
const LOCAL_ADMIN_ID = 1;

router.get("/inventory", async (req, res, next) => {
  try { ok(res, { inventory: await imsService.listInventory() }); } catch (error) { next(error); }
});

router.post("/stock/in/manual", async (req, res, next) => {
  try { ok(res, await imsService.postStockMovement(req.body, LOCAL_ADMIN_ID, "MANUAL_IN"), 201); } catch (error) { next(error); }
});

router.post("/stock/out", async (req, res, next) => {
  try { ok(res, await imsService.postStockMovement(req.body, LOCAL_ADMIN_ID, "MANUAL_OUT"), 201); } catch (error) { next(error); }
});

router.get("/items", async (req, res, next) => {
  try { ok(res, { items: await imsService.listItems() }); } catch (error) { next(error); }
});

router.post("/items", async (req, res, next) => {
  try { ok(res, { items: await imsService.createItems(req.body, LOCAL_ADMIN_ID) }, 201); } catch (error) { next(error); }
});

router.get("/vendors", async (req, res, next) => {
  try { ok(res, { vendors: await imsService.listVendors() }); } catch (error) { next(error); }
});

router.post("/vendors", async (req, res, next) => {
  try { ok(res, { vendor: await imsService.createVendor(req.body, LOCAL_ADMIN_ID) }, 201); } catch (error) { next(error); }
});

router.get("/requests", async (req, res, next) => {
  try { ok(res, { requests: await imsService.listRequests() }); } catch (error) { next(error); }
});

router.post("/requests", async (req, res, next) => {
  try { ok(res, await imsService.createRequest(req.body, LOCAL_ADMIN_ID), 201); } catch (error) { next(error); }
});

router.get("/purchase-orders", async (req, res, next) => {
  try { ok(res, { purchaseOrders: await imsService.listPurchaseOrders() }); } catch (error) { next(error); }
});

router.post("/purchase-orders", async (req, res, next) => {
  try { ok(res, await imsService.createPurchaseOrder(req.body, LOCAL_ADMIN_ID), 201); } catch (error) { next(error); }
});

router.get("/grn", async (req, res, next) => {
  try { ok(res, { grns: await imsService.listGrns() }); } catch (error) { next(error); }
});

router.post("/grn", async (req, res, next) => {
  try { ok(res, await imsService.createGrn(req.body, LOCAL_ADMIN_ID), 201); } catch (error) { next(error); }
});

router.get("/audit", async (req, res, next) => {
  try { ok(res, { auditLogs: await imsService.listAudit() }); } catch (error) { next(error); }
});

module.exports = router;
