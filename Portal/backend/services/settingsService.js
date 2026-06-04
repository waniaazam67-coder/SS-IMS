const { pool } = require("../config/database");
const { normalizeSettingValue } = require("../utils/settings");

const selectSettingsSql = `
  SELECT id, setting_group, setting_key, setting_value, value_type, description, updated_by, updated_at
  FROM system_settings
`;
const removedSettingGroups = new Set(["purchase_orders", "grn"]);

function assertSettingGroupEnabled(group) {
  if (removedSettingGroups.has(String(group || "").trim())) {
    const error = new Error("This settings section is no longer available.");
    error.statusCode = 404;
    throw error;
  }
}

async function listSettings() {
  const [settings] = await pool.query(
    `${selectSettingsSql}
     WHERE setting_group NOT IN ('purchase_orders', 'grn')
     ORDER BY setting_group, setting_key`
  );
  return settings;
}

async function listSettingsByGroup(group) {
  assertSettingGroupEnabled(group);
  const [settings] = await pool.execute(
    `${selectSettingsSql} WHERE setting_group = ? ORDER BY setting_key`,
    [group]
  );
  return settings;
}

async function upsertGroupSettings(group, settings, updatedBy) {
  assertSettingGroupEnabled(group);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    for (const [key, row] of Object.entries(settings)) {
      await upsertSetting(connection, {
        group,
        key,
        value: row.value,
        valueType: row.valueType || "string",
        description: row.description || null,
        updatedBy
      });
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function upsertSingleSetting(setting) {
  assertSettingGroupEnabled(setting.group);
  await upsertSetting(pool, setting);
}

async function upsertSetting(db, setting) {
  const value = normalizeSettingValue(setting.value, setting.valueType);

  await db.execute(
    `INSERT INTO system_settings (setting_group, setting_key, setting_value, value_type, description, updated_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       setting_value = VALUES(setting_value),
       value_type = VALUES(value_type),
       description = VALUES(description),
       updated_by = VALUES(updated_by),
       updated_at = CURRENT_TIMESTAMP`,
    [
      setting.group,
      setting.key,
      value,
      setting.valueType,
      setting.description,
      setting.updatedBy
    ]
  );
}

module.exports = {
  listSettings,
  listSettingsByGroup,
  upsertGroupSettings,
  upsertSingleSetting
};
