const express = require("express");
const settingsController = require("../controllers/settingsController");
const { PERMISSIONS } = require("../config/permissions");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(requireAuth);
router.use(requirePermission(PERMISSIONS.MANAGE_SETTINGS));

router.get("/", settingsController.getSettings);
router.get("/:group", settingsController.getSettingsByGroup);
router.put("/:group", settingsController.updateSettingsGroup);
router.put("/:group/:key", settingsController.updateSetting);

module.exports = router;
