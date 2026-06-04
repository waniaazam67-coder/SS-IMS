CREATE DATABASE IF NOT EXISTS ims_system
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ims_system;

DROP PROCEDURE IF EXISTS sp_add_column_if_missing;
DROP PROCEDURE IF EXISTS sp_add_index_if_missing;
DROP PROCEDURE IF EXISTS sp_add_fk_if_missing;
DROP PROCEDURE IF EXISTS sp_modify_column_if_not_type;

DELIMITER $$

CREATE PROCEDURE sp_add_column_if_missing(
  IN p_table_name VARCHAR(64),
  IN p_column_name VARCHAR(64),
  IN p_column_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = p_table_name
      AND column_name = p_column_name
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `', p_table_name, '` ADD COLUMN ', p_column_definition);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

CREATE PROCEDURE sp_add_index_if_missing(
  IN p_table_name VARCHAR(64),
  IN p_index_name VARCHAR(64),
  IN p_index_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = p_table_name
      AND index_name = p_index_name
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `', p_table_name, '` ADD ', p_index_definition);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

CREATE PROCEDURE sp_add_fk_if_missing(
  IN p_table_name VARCHAR(64),
  IN p_constraint_name VARCHAR(64),
  IN p_constraint_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = DATABASE()
      AND table_name = p_table_name
      AND constraint_name = p_constraint_name
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `', p_table_name, '` ADD CONSTRAINT `', p_constraint_name, '` ', p_constraint_definition);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

CREATE PROCEDURE sp_modify_column_if_not_type(
  IN p_table_name VARCHAR(64),
  IN p_column_name VARCHAR(64),
  IN p_expected_data_type VARCHAR(64),
  IN p_column_definition TEXT
)
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = p_table_name
      AND column_name = p_column_name
      AND data_type <> p_expected_data_type
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `', p_table_name, '` MODIFY ', p_column_definition);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DELIMITER ;

CREATE TABLE IF NOT EXISTS item_types (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id INT UNSIGNED NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  deleted_at TIMESTAMP NULL,
  created_by INT UNSIGNED NULL,
  updated_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_item_types_category_name (category_id, name),
  KEY idx_item_types_name (name),
  KEY idx_item_types_active (is_active, deleted_at),
  KEY idx_item_types_created_by (created_by),
  KEY idx_item_types_updated_by (updated_by)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  notification_key VARCHAR(120) NULL,
  recipient_user_id INT UNSIGNED NULL,
  recipient_email VARCHAR(255) NULL,
  channel ENUM('in_app', 'email', 'sms', 'system') NOT NULL DEFAULT 'in_app',
  title VARCHAR(180) NOT NULL,
  body TEXT NULL,
  entity_type VARCHAR(80) NULL,
  entity_id BIGINT UNSIGNED NULL,
  status ENUM('pending', 'sent', 'read', 'dismissed', 'failed') NOT NULL DEFAULT 'pending',
  priority ENUM('low', 'normal', 'high') NOT NULL DEFAULT 'normal',
  scheduled_at TIMESTAMP NULL,
  sent_at TIMESTAMP NULL,
  read_at TIMESTAMP NULL,
  dismissed_at TIMESTAMP NULL,
  failure_reason TEXT NULL,
  metadata JSON NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_recipient_status (recipient_user_id, status, created_at),
  KEY idx_notifications_email_status (recipient_email, status, created_at),
  KEY idx_notifications_entity (entity_type, entity_id),
  KEY idx_notifications_status_schedule (status, scheduled_at),
  KEY idx_notifications_created_by (created_by)
) ENGINE=InnoDB;

CALL sp_add_column_if_missing('items', 'item_type_id', 'item_type_id INT UNSIGNED NULL AFTER item_type');
CALL sp_add_column_if_missing('items', 'deleted_at', 'deleted_at TIMESTAMP NULL');
CALL sp_add_column_if_missing('items', 'created_by', 'created_by INT UNSIGNED NULL');
CALL sp_add_column_if_missing('items', 'updated_by', 'updated_by INT UNSIGNED NULL');
CALL sp_add_column_if_missing('departments', 'code', 'code VARCHAR(40) NULL');
CALL sp_add_column_if_missing('departments', 'is_active', 'is_active TINYINT(1) NOT NULL DEFAULT 1');
CALL sp_add_column_if_missing('departments', 'deleted_at', 'deleted_at TIMESTAMP NULL');
CALL sp_add_column_if_missing('departments', 'created_by', 'created_by INT UNSIGNED NULL');
CALL sp_add_column_if_missing('departments', 'updated_by', 'updated_by INT UNSIGNED NULL');
CALL sp_add_column_if_missing('locations', 'code', 'code VARCHAR(40) NULL');
CALL sp_add_column_if_missing('locations', 'is_active', 'is_active TINYINT(1) NOT NULL DEFAULT 1');
CALL sp_add_column_if_missing('locations', 'deleted_at', 'deleted_at TIMESTAMP NULL');
CALL sp_add_column_if_missing('locations', 'created_by', 'created_by INT UNSIGNED NULL');
CALL sp_add_column_if_missing('locations', 'updated_by', 'updated_by INT UNSIGNED NULL');
CALL sp_add_column_if_missing('users', 'deleted_at', 'deleted_at TIMESTAMP NULL');
CALL sp_add_column_if_missing('users', 'created_by', 'created_by INT UNSIGNED NULL');
CALL sp_add_column_if_missing('users', 'updated_by', 'updated_by INT UNSIGNED NULL');
CALL sp_add_column_if_missing('permissions', 'created_at', 'created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
CALL sp_add_column_if_missing('permissions', 'updated_at', 'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
CALL sp_add_column_if_missing('item_categories', 'is_active', 'is_active TINYINT(1) NOT NULL DEFAULT 1');
CALL sp_add_column_if_missing('item_categories', 'deleted_at', 'deleted_at TIMESTAMP NULL');
CALL sp_add_column_if_missing('item_categories', 'created_by', 'created_by INT UNSIGNED NULL');
CALL sp_add_column_if_missing('item_categories', 'updated_by', 'updated_by INT UNSIGNED NULL');
CALL sp_add_column_if_missing('vendors', 'deleted_at', 'deleted_at TIMESTAMP NULL');
CALL sp_add_column_if_missing('vendors', 'created_by', 'created_by INT UNSIGNED NULL');
CALL sp_add_column_if_missing('vendors', 'updated_by', 'updated_by INT UNSIGNED NULL');
CALL sp_add_column_if_missing('vendors', 'bank_name', 'bank_name VARCHAR(150) NULL');
CALL sp_add_column_if_missing('vendors', 'account_title', 'account_title VARCHAR(220) NULL');
CALL sp_add_column_if_missing('vendors', 'account_no', 'account_no VARCHAR(120) NULL');
CALL sp_add_column_if_missing('purchase_order_lines', 'created_at', 'created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
CALL sp_add_column_if_missing('purchase_order_lines', 'updated_at', 'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
CALL sp_add_column_if_missing('purchase_orders', 'is_active', 'is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER notes_remarks');
CALL sp_add_column_if_missing('grn_lines', 'created_at', 'created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
CALL sp_add_column_if_missing('grn_lines', 'updated_at', 'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
CALL sp_add_column_if_missing('approval_logs', 'created_at', 'created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
CALL sp_add_column_if_missing('approval_logs', 'updated_at', 'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
CALL sp_add_column_if_missing('attachments', 'updated_at', 'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
CALL sp_add_column_if_missing('audit_logs', 'request_id', 'request_id VARCHAR(80) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(new_values, ''$.requestNumber''))) STORED');
CALL sp_add_column_if_missing('audit_logs', 'po_number', 'po_number VARCHAR(80) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(new_values, ''$.poNumber''))) STORED');
CALL sp_add_column_if_missing('system_settings', 'created_at', 'created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');

UPDATE system_settings
SET updated_by = NULL
WHERE updated_by IS NOT NULL AND updated_by REGEXP '[^0-9]';

CALL sp_modify_column_if_not_type('system_settings', 'updated_by', 'int', 'updated_by INT UNSIGNED NULL');
CALL sp_modify_column_if_not_type('purchase_orders', 'status', 'enum', 'status ENUM(''Draft'', ''Pending Approval'', ''Approved'', ''Sent'', ''Partially Received'', ''Received'', ''Cancelled'', ''Closed'') NOT NULL DEFAULT ''Draft''');
CALL sp_modify_column_if_not_type('request_items', 'quantity_requested', 'decimal', 'quantity_requested DECIMAL(14,4) NOT NULL');
CALL sp_modify_column_if_not_type('request_items', 'quantity_issued', 'decimal', 'quantity_issued DECIMAL(14,4) NOT NULL DEFAULT 0');
CALL sp_modify_column_if_not_type('request_items', 'line_status', 'enum', 'line_status ENUM(''Pending Approval'', ''Approved'', ''Rejected'', ''Partially Issued'', ''Issued'', ''Cancelled'') NOT NULL DEFAULT ''Pending Approval''');

CALL sp_add_index_if_missing('departments', 'idx_departments_created_by', 'INDEX idx_departments_created_by (created_by)');
CALL sp_add_index_if_missing('departments', 'idx_departments_updated_by', 'INDEX idx_departments_updated_by (updated_by)');
CALL sp_add_index_if_missing('locations', 'idx_locations_created_by', 'INDEX idx_locations_created_by (created_by)');
CALL sp_add_index_if_missing('locations', 'idx_locations_updated_by', 'INDEX idx_locations_updated_by (updated_by)');
CALL sp_add_index_if_missing('users', 'idx_users_created_by', 'INDEX idx_users_created_by (created_by)');
CALL sp_add_index_if_missing('users', 'idx_users_updated_by', 'INDEX idx_users_updated_by (updated_by)');
CALL sp_add_index_if_missing('items', 'idx_items_item_type_id', 'INDEX idx_items_item_type_id (item_type_id)');
CALL sp_add_index_if_missing('item_categories', 'idx_item_categories_active', 'INDEX idx_item_categories_active (is_active, deleted_at)');
CALL sp_add_index_if_missing('item_categories', 'idx_item_categories_created_by', 'INDEX idx_item_categories_created_by (created_by)');
CALL sp_add_index_if_missing('item_categories', 'idx_item_categories_updated_by', 'INDEX idx_item_categories_updated_by (updated_by)');
CALL sp_add_index_if_missing('audit_logs', 'idx_audit_logs_request_id', 'INDEX idx_audit_logs_request_id (request_id)');
CALL sp_add_index_if_missing('audit_logs', 'idx_audit_logs_po_number', 'INDEX idx_audit_logs_po_number (po_number)');
CALL sp_add_index_if_missing('system_settings', 'idx_system_settings_updated_by', 'INDEX idx_system_settings_updated_by (updated_by)');

CALL sp_add_fk_if_missing('departments', 'fk_departments_created_by', 'FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL sp_add_fk_if_missing('departments', 'fk_departments_updated_by', 'FOREIGN KEY (updated_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL sp_add_fk_if_missing('locations', 'fk_locations_created_by', 'FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL sp_add_fk_if_missing('locations', 'fk_locations_updated_by', 'FOREIGN KEY (updated_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL sp_add_fk_if_missing('users', 'fk_users_created_by', 'FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL sp_add_fk_if_missing('users', 'fk_users_updated_by', 'FOREIGN KEY (updated_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL sp_add_fk_if_missing('item_categories', 'fk_item_categories_created_by', 'FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL sp_add_fk_if_missing('item_categories', 'fk_item_categories_updated_by', 'FOREIGN KEY (updated_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL sp_add_fk_if_missing('item_types', 'fk_item_types_category', 'FOREIGN KEY (category_id) REFERENCES item_categories (id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL sp_add_fk_if_missing('item_types', 'fk_item_types_created_by', 'FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL sp_add_fk_if_missing('item_types', 'fk_item_types_updated_by', 'FOREIGN KEY (updated_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL sp_add_fk_if_missing('items', 'fk_items_item_type', 'FOREIGN KEY (item_type_id) REFERENCES item_types (id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL sp_add_fk_if_missing('notifications', 'fk_notifications_recipient', 'FOREIGN KEY (recipient_user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL sp_add_fk_if_missing('notifications', 'fk_notifications_created_by', 'FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL sp_add_fk_if_missing('system_settings', 'fk_system_settings_updated_by', 'FOREIGN KEY (updated_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL');

INSERT INTO item_types (category_id, name)
SELECT DISTINCT i.category_id, i.item_type
FROM items i
WHERE i.item_type IS NOT NULL AND i.item_type <> ''
ON DUPLICATE KEY UPDATE name = VALUES(name);

UPDATE items i
JOIN item_types it ON it.category_id <=> i.category_id AND it.name = i.item_type
SET i.item_type_id = it.id
WHERE i.item_type_id IS NULL;

DROP PROCEDURE IF EXISTS sp_add_column_if_missing;
DROP PROCEDURE IF EXISTS sp_add_index_if_missing;
DROP PROCEDURE IF EXISTS sp_add_fk_if_missing;
DROP PROCEDURE IF EXISTS sp_modify_column_if_not_type;
