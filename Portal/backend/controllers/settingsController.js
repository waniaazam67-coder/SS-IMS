const settingsService = require("../services/settingsService");
const { ok } = require("../utils/apiResponse");
const { validateSettingKey, validateValueType } = require("../utils/settings");
const { cleanText } = require("../utils/validation");

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
      value: sanitizeSettingValue(req.body.value, valueType, key),
      valueType,
      description: req.body.description ? cleanText(req.body.description, "description", { max: 500 }) : null,
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
    row.value = sanitizeSettingValue(row.value, row.valueType, key);
    row.description = row.description ? cleanText(row.description, `${key}.description`, { max: 500 }) : null;
  }

  return settings;
}

function sanitizeSettingValue(value, valueType, key) {
  if (valueType === "boolean") {
    if (![true, false, "true", "false", "1", "0", 1, 0].includes(value)) {
      const error = new Error(`${key} must be a boolean setting value.`);
      error.statusCode = 400;
      throw error;
    }
    return value;
  }
  if (valueType === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      const error = new Error(`${key} must be a number setting value.`);
      error.statusCode = 400;
      throw error;
    }
    return number;
  }
  return cleanText(value, key, { max: 1000 });
}

module.exports = {
  getSettings,
  getSettingsByGroup,
  updateSettingsGroup,
  updateSetting
};
