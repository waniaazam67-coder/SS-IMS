const allowedValueTypes = new Set(["string", "number", "boolean"]);

function normalizeSettingValue(value, valueType) {
  if (valueType === "boolean") return value === true || value === "true" ? "true" : "false";
  if (valueType === "number") return String(Number(value || 0));
  return String(value ?? "");
}

function validateSettingKey(value, label = "setting key") {
  const normalized = String(value || "").trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(normalized)) {
    const error = new Error(`Invalid ${label}.`);
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function validateValueType(valueType) {
  const normalized = String(valueType || "string").trim().toLowerCase();
  if (!allowedValueTypes.has(normalized)) {
    const error = new Error("Invalid setting value type.");
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

module.exports = {
  normalizeSettingValue,
  validateSettingKey,
  validateValueType
};
