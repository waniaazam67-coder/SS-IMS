-- Migration: 004_add_po_budget_line_and_donor
-- Purpose:
--   Store Budget line and Donor as separate Purchase Order fields instead of
--   keeping them combined in the UI or notes.
--
-- Production safety:
--   - Does not drop tables.
--   - Does not delete or rewrite existing purchase order data.
--   - Adds nullable columns only when they do not already exist.
--   - Adds indexes only when they do not already exist.

SET @budget_line_column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'purchase_orders'
    AND COLUMN_NAME = 'budget_line'
);

SET @add_budget_line_sql := IF(
  @budget_line_column_exists = 0,
  'ALTER TABLE purchase_orders ADD COLUMN budget_line VARCHAR(180) NULL AFTER delivery_location_id',
  'SELECT ''purchase_orders.budget_line already exists'' AS message'
);

PREPARE add_budget_line_stmt FROM @add_budget_line_sql;
EXECUTE add_budget_line_stmt;
DEALLOCATE PREPARE add_budget_line_stmt;

SET @donor_column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'purchase_orders'
    AND COLUMN_NAME = 'donor'
);

SET @add_donor_sql := IF(
  @donor_column_exists = 0,
  'ALTER TABLE purchase_orders ADD COLUMN donor VARCHAR(180) NULL AFTER budget_line',
  'SELECT ''purchase_orders.donor already exists'' AS message'
);

PREPARE add_donor_stmt FROM @add_donor_sql;
EXECUTE add_donor_stmt;
DEALLOCATE PREPARE add_donor_stmt;

SET @budget_line_index_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'purchase_orders'
    AND INDEX_NAME = 'idx_purchase_orders_budget_line'
);

SET @add_budget_line_index_sql := IF(
  @budget_line_index_exists = 0,
  'CREATE INDEX idx_purchase_orders_budget_line ON purchase_orders (budget_line)',
  'SELECT ''idx_purchase_orders_budget_line already exists'' AS message'
);

PREPARE add_budget_line_index_stmt FROM @add_budget_line_index_sql;
EXECUTE add_budget_line_index_stmt;
DEALLOCATE PREPARE add_budget_line_index_stmt;

SET @donor_index_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'purchase_orders'
    AND INDEX_NAME = 'idx_purchase_orders_donor'
);

SET @add_donor_index_sql := IF(
  @donor_index_exists = 0,
  'CREATE INDEX idx_purchase_orders_donor ON purchase_orders (donor)',
  'SELECT ''idx_purchase_orders_donor already exists'' AS message'
);

PREPARE add_donor_index_stmt FROM @add_donor_index_sql;
EXECUTE add_donor_index_stmt;
DEALLOCATE PREPARE add_donor_index_stmt;
