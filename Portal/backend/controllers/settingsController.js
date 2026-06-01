const settingsService = require("../services/settingsService");
const { ok } = require("../utils/apiResponse");
const { validateSettingKey, validateValueType } = require("../utils/settings");

async function getSettings(req, res, next) {
  try {
    const settings = await settingsService.listSettings();
    return ok(res, { settings });
  } catch (error) {
    return next(error);
  }
}

async function getSettingsByGroup(req, res, next) {
  try {
    const group = validateSettingKey(req.params.group, "setting group");
    const settings = await settingsService.listSettingsByGroup(group);
    return ok(res, { settings });
  } catch (error) {
    return next(error);
  }
}

async function updateSettingsGroup(req, res, next) {
  try {
    const group = validateSettingKey(req.params.group, "setting group");
    const settings = validateSettingsPayload(req.body.settings);
    const updatedBy = req.auth?.user?.email || req.auth?.user?.name || "System";

    await settingsService.upsertGroupSettings(group, settings, updatedBy);
    return ok(res);
  } catch (error) {
    return next(error);
  }
}

async function updateSetting(req, res, next) {
  try {
    const group = validateSettingKey(req.params.group, "setting group");
    const key = validateSettingKey(req.params.key);
    const valueType = validateValueType(req.body.valueType);
    const updatedBy = req.auth?.user?.email || req.auth?.user?.name || "System";

    await settingsService.upsertSingleSetting({
      group,
      key,
      value: req.body.value,
      valueType,
      description: req.body.description || null,
      updatedBy
    });

    return ok(res);
  } catch (error) {
    return next(error);
  }
}

function validateSettingsPayload(settings) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    const error = new Error("settings must be an object.");
    error.statusCode = 400;
    throw error;
  }

  for (const [key, row] of Object.entries(settings)) {
    validateSettingKey(key);
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      const error = new Error(`Invalid payload for setting ${key}.`);
      error.statusCode = 400;
      throw error;
    }
    row.valueType = validateValueType(row.valueType);
  }

  return settings;
}

module.exports = {
  getSettings,
  getSettingsByGroup,
  updateSettingsGroup,
  updateSetting
};
