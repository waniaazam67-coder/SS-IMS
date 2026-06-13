-- Migration: 005_add_vendor_phone_and_stn_fields
-- Purpose:
--   Split vendor phone into Primary Phone and Secondary Phone, and add STN
--   after NTN for vendor tax details.
--
-- Production safety:
--   - Does not drop tables.
--   - Does not delete or rewrite existing vendor data.
--   - Adds nullable columns only when they do not already exist.
--   - Backfills primary_phone from the existing phone column only where
--     primary_phone is currently empty.

SET @primary_phone_column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'vendors'
    AND COLUMN_NAME = 'primary_phone'
);

SET @add_primary_phone_sql := IF(
  @primary_phone_column_exists = 0,
  'ALTER TABLE vendors ADD COLUMN primary_phone VARCHAR(80) NULL AFTER phone',
  'SELECT ''vendors.primary_phone already exists'' AS message'
);

PREPARE add_primary_phone_stmt FROM @add_primary_phone_sql;
EXECUTE add_primary_phone_stmt;
DEALLOCATE PREPARE add_primary_phone_stmt;

SET @secondary_phone_column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'vendors'
    AND COLUMN_NAME = 'secondary_phone'
);

SET @add_secondary_phone_sql := IF(
  @secondary_phone_column_exists = 0,
  'ALTER TABLE vendors ADD COLUMN secondary_phone VARCHAR(80) NULL AFTER primary_phone',
  'SELECT ''vendors.secondary_phone already exists'' AS message'
);

PREPARE add_secondary_phone_stmt FROM @add_secondary_phone_sql;
EXECUTE add_secondary_phone_stmt;
DEALLOCATE PREPARE add_secondary_phone_stmt;

SET @stn_column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'vendors'
    AND COLUMN_NAME = 'stn'
);

SET @add_stn_sql := IF(
  @stn_column_exists = 0,
  'ALTER TABLE vendors ADD COLUMN stn VARCHAR(120) NULL AFTER ntn',
  'SELECT ''vendors.stn already exists'' AS message'
);

PREPARE add_stn_stmt FROM @add_stn_sql;
EXECUTE add_stn_stmt;
DEALLOCATE PREPARE add_stn_stmt;

-- Preserve existing phone data in the new primary_phone field.
UPDATE vendors
SET primary_phone = phone
WHERE (primary_phone IS NULL OR primary_phone = '')
  AND phone IS NOT NULL
  AND phone <> '';
