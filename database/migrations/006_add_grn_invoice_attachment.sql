-- Migration: 006_add_grn_invoice_attachment
-- Purpose:
--   Store one supplier/PO invoice attachment per GRN.
--
-- Production safety:
--   - Does not drop tables.
--   - Does not delete or rewrite existing GRN data.
--   - Adds nullable columns only when they do not already exist.

SET @invoice_file_url_column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'grns'
    AND COLUMN_NAME = 'invoice_file_url'
);

SET @add_invoice_file_url_sql := IF(
  @invoice_file_url_column_exists = 0,
  'ALTER TABLE grns ADD COLUMN invoice_file_url VARCHAR(500) NULL AFTER notes_remarks',
  'SELECT ''grns.invoice_file_url already exists'' AS message'
);

PREPARE add_invoice_file_url_stmt FROM @add_invoice_file_url_sql;
EXECUTE add_invoice_file_url_stmt;
DEALLOCATE PREPARE add_invoice_file_url_stmt;

SET @invoice_file_name_column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'grns'
    AND COLUMN_NAME = 'invoice_file_name'
);

SET @add_invoice_file_name_sql := IF(
  @invoice_file_name_column_exists = 0,
  'ALTER TABLE grns ADD COLUMN invoice_file_name VARCHAR(255) NULL AFTER invoice_file_url',
  'SELECT ''grns.invoice_file_name already exists'' AS message'
);

PREPARE add_invoice_file_name_stmt FROM @add_invoice_file_name_sql;
EXECUTE add_invoice_file_name_stmt;
DEALLOCATE PREPARE add_invoice_file_name_stmt;

SET @invoice_file_type_column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'grns'
    AND COLUMN_NAME = 'invoice_file_type'
);

SET @add_invoice_file_type_sql := IF(
  @invoice_file_type_column_exists = 0,
  'ALTER TABLE grns ADD COLUMN invoice_file_type VARCHAR(100) NULL AFTER invoice_file_name',
  'SELECT ''grns.invoice_file_type already exists'' AS message'
);

PREPARE add_invoice_file_type_stmt FROM @add_invoice_file_type_sql;
EXECUTE add_invoice_file_type_stmt;
DEALLOCATE PREPARE add_invoice_file_type_stmt;

SET @invoice_uploaded_at_column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'grns'
    AND COLUMN_NAME = 'invoice_uploaded_at'
);

SET @add_invoice_uploaded_at_sql := IF(
  @invoice_uploaded_at_column_exists = 0,
  'ALTER TABLE grns ADD COLUMN invoice_uploaded_at DATETIME NULL AFTER invoice_file_type',
  'SELECT ''grns.invoice_uploaded_at already exists'' AS message'
);

PREPARE add_invoice_uploaded_at_stmt FROM @add_invoice_uploaded_at_sql;
EXECUTE add_invoice_uploaded_at_stmt;
DEALLOCATE PREPARE add_invoice_uploaded_at_stmt;
