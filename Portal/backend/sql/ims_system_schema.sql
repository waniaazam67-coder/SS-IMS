
CREATE TABLE IF NOT EXISTS departments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NULL,
  name VARCHAR(150) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  deleted_at TIMESTAMP NULL,
  created_by INT UNSIGNED NULL,
  updated_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_departments_code (code),
  UNIQUE KEY uq_departments_name (name),
  KEY idx_departments_active (is_active, deleted_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS locations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NULL,
  name VARCHAR(150) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  deleted_at TIMESTAMP NULL,
  created_by INT UNSIGNED NULL,
  updated_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_locations_code (code),
  UNIQUE KEY uq_locations_name (name),
  KEY idx_locations_active (is_active, deleted_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(180) NOT NULL,
  email VARCHAR(255) NOT NULL,
  department_id INT UNSIGNED NULL,
  location_id INT UNSIGNED NULL,
  is_line_manager TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  deleted_at TIMESTAMP NULL,
  created_by INT UNSIGNED NULL,
  updated_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_department_id (department_id),
  KEY idx_users_location_id (location_id),
  KEY idx_users_active (is_active, deleted_at),
  CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES departments (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_users_location FOREIGN KEY (location_id) REFERENCES locations (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS roles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS permissions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  permission_key VARCHAR(120) NOT NULL,
  module VARCHAR(80) NOT NULL,
  description VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_key (permission_key),
  KEY idx_permissions_module (module)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INT UNSIGNED NOT NULL,
  role_id INT UNSIGNED NOT NULL,
  assigned_by INT UNSIGNED NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  KEY idx_user_roles_role_id (role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_assigned_by FOREIGN KEY (assigned_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  granted_by INT UNSIGNED NULL,
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, permission_id),
  KEY idx_role_permissions_permission_id (permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_granted_by FOREIGN KEY (granted_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS item_categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_item_categories_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vendors (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(220) NOT NULL,
  contact VARCHAR(150) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(80) NULL,
  address TEXT NULL,
  notes_remarks TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  deleted_at TIMESTAMP NULL,
  created_by INT UNSIGNED NULL,
  updated_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_vendors_name (name),
  KEY idx_vendors_active (is_active, deleted_at),
  CONSTRAINT fk_vendors_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_vendors_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id VARCHAR(80) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  item_type VARCHAR(255) NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  unit VARCHAR(50) NULL,
  notes_remarks TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  deleted_at TIMESTAMP NULL,
  created_by INT UNSIGNED NULL,
  updated_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_items_item_id (item_id),
  KEY idx_items_category_id (category_id),
  KEY idx_items_name_type (item_name, item_type),
  KEY idx_items_active (is_active, deleted_at),
  CONSTRAINT fk_items_category FOREIGN KEY (category_id) REFERENCES item_categories (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_items_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_items_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS inventory_balances (
  item_id INT UNSIGNED NOT NULL,
  location_id INT UNSIGNED NOT NULL,
  quantity_on_hand DECIMAL(14,4) NOT NULL DEFAULT 0,
  quantity_reserved DECIMAL(14,4) NOT NULL DEFAULT 0,
  quantity_available DECIMAL(14,4) GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
  last_movement_at TIMESTAMP NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (item_id, location_id),
  KEY idx_inventory_balances_location (location_id),
  KEY idx_inventory_balances_available (quantity_available),
  CONSTRAINT fk_inventory_balances_item FOREIGN KEY (item_id) REFERENCES items (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_inventory_balances_location FOREIGN KEY (location_id) REFERENCES locations (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_inventory_balances_on_hand CHECK (quantity_on_hand >= 0),
  CONSTRAINT chk_inventory_balances_reserved CHECK (quantity_reserved >= 0),
  CONSTRAINT chk_inventory_balances_available CHECK (quantity_on_hand >= quantity_reserved)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  movement_number VARCHAR(80) NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  location_id INT UNSIGNED NOT NULL,
  movement_type ENUM('OPENING', 'GRN_IN', 'MANUAL_IN', 'REQUEST_ISSUE', 'MANUAL_OUT', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'RESERVE', 'UNRESERVE') NOT NULL,
  quantity DECIMAL(14,4) NOT NULL,
  unit_cost DECIMAL(14,4) NULL,
  source_type ENUM('OPENING', 'GRN', 'REQUEST', 'PO', 'TRANSFER', 'ADJUSTMENT', 'MANUAL') NOT NULL,
  source_id BIGINT UNSIGNED NULL,
  source_line_id BIGINT UNSIGNED NULL,
  notes_remarks TEXT NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stock_movements_number (movement_number),
  KEY idx_stock_movements_item_location_date (item_id, location_id, created_at),
  KEY idx_stock_movements_source (source_type, source_id, source_line_id),
  KEY idx_stock_movements_type_date (movement_type, created_at),
  CONSTRAINT fk_stock_movements_item FOREIGN KEY (item_id) REFERENCES items (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_stock_movements_location FOREIGN KEY (location_id) REFERENCES locations (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_stock_movements_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_stock_movements_quantity CHECK (quantity > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  po_number VARCHAR(80) NOT NULL,
  issue_date DATE NULL,
  vendor_id INT UNSIGNED NOT NULL,
  status ENUM('Draft', 'Pending Approval', 'Approved', 'Sent', 'Partially Received', 'Received', 'Cancelled', 'Closed') NOT NULL DEFAULT 'Draft',
  expected_date DATE NULL,
  delivery_location_id INT UNSIGNED NULL,
  subtotal_amount DECIMAL(14,4) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(14,4) NOT NULL DEFAULT 0,
  total_amount DECIMAL(14,4) NOT NULL DEFAULT 0,
  notes_remarks TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  deleted_at TIMESTAMP NULL,
  created_by INT UNSIGNED NULL,
  updated_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_purchase_orders_po_number (po_number),
  KEY idx_purchase_orders_vendor_id (vendor_id),
  KEY idx_purchase_orders_status_date (status, issue_date),
  KEY idx_purchase_orders_location_id (delivery_location_id),
  CONSTRAINT fk_purchase_orders_vendor FOREIGN KEY (vendor_id) REFERENCES vendors (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_purchase_orders_location FOREIGN KEY (delivery_location_id) REFERENCES locations (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_purchase_orders_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_purchase_orders_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  purchase_order_id INT UNSIGNED NOT NULL,
  line_no SMALLINT UNSIGNED NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  description TEXT NULL,
  quantity_ordered DECIMAL(14,4) NOT NULL,
  quantity_received DECIMAL(14,4) NOT NULL DEFAULT 0,
  unit_price DECIMAL(14,4) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(7,4) NOT NULL DEFAULT 0,
  line_total DECIMAL(14,4) GENERATED ALWAYS AS ((quantity_ordered * unit_price) + ((quantity_ordered * unit_price) * tax_rate / 100)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_po_lines_po_line (purchase_order_id, line_no),
  KEY idx_po_lines_item_id (item_id),
  CONSTRAINT fk_po_lines_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_po_lines_item FOREIGN KEY (item_id) REFERENCES items (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_po_lines_quantities CHECK (quantity_ordered > 0 AND quantity_received >= 0 AND quantity_received <= quantity_ordered),
  CONSTRAINT chk_po_lines_price CHECK (unit_price >= 0 AND tax_rate >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS grns (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  grn_number VARCHAR(80) NOT NULL,
  purchase_order_id INT UNSIGNED NULL,
  grn_date DATE NOT NULL,
  received_by INT UNSIGNED NULL,
  location_id INT UNSIGNED NOT NULL,
  status ENUM('Draft', 'Pending Inspection', 'Partially Accepted', 'Accepted', 'Rejected', 'Posted', 'Cancelled') NOT NULL DEFAULT 'Draft',
  notes_remarks TEXT NULL,
  created_by INT UNSIGNED NULL,
  updated_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_grns_grn_number (grn_number),
  KEY idx_grns_po_id (purchase_order_id),
  KEY idx_grns_status_date (status, grn_date),
  KEY idx_grns_location_id (location_id),
  CONSTRAINT fk_grns_purchase_order FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_grns_received_by FOREIGN KEY (received_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_grns_location FOREIGN KEY (location_id) REFERENCES locations (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_grns_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_grns_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS grn_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  grn_id INT UNSIGNED NOT NULL,
  purchase_order_line_id BIGINT UNSIGNED NULL,
  line_no SMALLINT UNSIGNED NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  quantity_received DECIMAL(14,4) NOT NULL,
  quantity_accepted DECIMAL(14,4) NOT NULL DEFAULT 0,
  quantity_rejected DECIMAL(14,4) NOT NULL DEFAULT 0,
  rejection_reason VARCHAR(255) NULL,
  stock_movement_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_grn_lines_grn_line (grn_id, line_no),
  KEY idx_grn_lines_item_id (item_id),
  KEY idx_grn_lines_po_line_id (purchase_order_line_id),
  CONSTRAINT fk_grn_lines_grn FOREIGN KEY (grn_id) REFERENCES grns (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_grn_lines_po_line FOREIGN KEY (purchase_order_line_id) REFERENCES purchase_order_lines (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_grn_lines_item FOREIGN KEY (item_id) REFERENCES items (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_grn_lines_movement FOREIGN KEY (stock_movement_id) REFERENCES stock_movements (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_grn_lines_quantities CHECK (
    quantity_received > 0
    AND quantity_accepted >= 0
    AND quantity_rejected >= 0
    AND quantity_accepted + quantity_rejected <= quantity_received
  )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS requests (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_number VARCHAR(80) NOT NULL,
  request_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  requester_user_id INT UNSIGNED NULL,
  department_id INT UNSIGNED NULL,
  location_id INT UNSIGNED NULL,
  line_manager_email VARCHAR(255) NULL,
  approval_status ENUM('Draft', 'Pending Approval', 'Approved', 'Rejected', 'Cancelled') NOT NULL DEFAULT 'Pending Approval',
  issuance_status ENUM('Not Issued', 'Partially Issued', 'Issued', 'Closed') NOT NULL DEFAULT 'Not Issued',
  notes_remarks TEXT NULL,
  deleted_at TIMESTAMP NULL,
  created_by INT UNSIGNED NULL,
  updated_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_requests_request_number (request_number),
  KEY idx_requests_requester_user_id (requester_user_id),
  KEY idx_requests_line_manager_email (line_manager_email),
  KEY idx_requests_department_id (department_id),
  KEY idx_requests_location_id (location_id),
  KEY idx_requests_statuses (approval_status, issuance_status),
  KEY idx_requests_date (request_date),
  CONSTRAINT fk_requests_requester FOREIGN KEY (requester_user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_requests_department FOREIGN KEY (department_id) REFERENCES departments (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_requests_location FOREIGN KEY (location_id) REFERENCES locations (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_requests_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_requests_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS request_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id INT UNSIGNED NOT NULL,
  line_no SMALLINT UNSIGNED NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  item_name_snapshot VARCHAR(255) NULL,
  item_type_snapshot VARCHAR(255) NULL,
  item_code_snapshot VARCHAR(80) NULL,
  quantity_requested DECIMAL(14,4) NOT NULL,
  quantity_approved DECIMAL(14,4) NOT NULL DEFAULT 0,
  quantity_issued DECIMAL(14,4) NOT NULL DEFAULT 0,
  source_location_id INT UNSIGNED NULL,
  line_status ENUM('Pending Approval', 'Approved', 'Rejected', 'Partially Issued', 'Issued', 'Cancelled') NOT NULL DEFAULT 'Pending Approval',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_request_items_request_line (request_id, line_no),
  KEY idx_request_items_item_id (item_id),
  KEY idx_request_items_status (line_status),
  CONSTRAINT fk_request_items_request FOREIGN KEY (request_id) REFERENCES requests (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_request_items_item FOREIGN KEY (item_id) REFERENCES items (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_request_items_source_location FOREIGN KEY (source_location_id) REFERENCES locations (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_request_items_quantities CHECK (
    quantity_requested > 0
    AND quantity_approved >= 0
    AND quantity_issued >= 0
    AND quantity_approved <= quantity_requested
    AND quantity_issued <= quantity_approved
  )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS approval_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type ENUM('REQUEST', 'REQUEST_LINE', 'PURCHASE_ORDER', 'GRN') NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  action ENUM('SUBMITTED', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED', 'POSTED') NOT NULL,
  from_status VARCHAR(80) NULL,
  to_status VARCHAR(80) NULL,
  comments TEXT NULL,
  acted_by INT UNSIGNED NULL,
  acted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_approval_logs_entity (entity_type, entity_id, acted_at),
  KEY idx_approval_logs_acted_by (acted_by),
  CONSTRAINT fk_approval_logs_acted_by FOREIGN KEY (acted_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attachments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type ENUM('REQUEST', 'PURCHASE_ORDER', 'GRN', 'VENDOR', 'ITEM') NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size BIGINT UNSIGNED NULL,
  uploaded_by INT UNSIGNED NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_attachments_entity (entity_type, entity_id),
  CONSTRAINT fk_attachments_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  table_name VARCHAR(120) NOT NULL,
  record_id BIGINT UNSIGNED NOT NULL,
  action ENUM('INSERT', 'UPDATE', 'SOFT_DELETE', 'DELETE', 'POST') NOT NULL,
  changed_by INT UNSIGNED NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  old_values JSON NULL,
  new_values JSON NULL,
  PRIMARY KEY (id),
  KEY idx_audit_logs_table_record (table_name, record_id),
  KEY idx_audit_logs_changed_by (changed_by),
  KEY idx_audit_logs_changed_at (changed_at),
  CONSTRAINT fk_audit_logs_changed_by FOREIGN KEY (changed_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS transport_requests (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_number VARCHAR(80) NOT NULL,
  requester_user_id INT UNSIGNED NULL,
  department_id INT UNSIGNED NULL,
  location_id INT UNSIGNED NULL,
  line_manager_email VARCHAR(255) NULL,
  transport_type VARCHAR(120) NOT NULL,
  date_of_travel DATE NULL,
  pickup_location VARCHAR(255) NULL,
  destination VARCHAR(255) NULL,
  vehicle_type VARCHAR(120) NULL,
  passengers TINYINT UNSIGNED NULL,
  approval_status ENUM('Draft', 'Pending Approval', 'Approved', 'Rejected', 'Cancelled') NOT NULL DEFAULT 'Pending Approval',
  status ENUM('Pending', 'Arranged', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Pending',
  notes_remarks TEXT NULL,
  created_by INT UNSIGNED NULL,
  updated_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_transport_requests_request_number (request_number),
  KEY idx_transport_requests_requester_user_id (requester_user_id),
  KEY idx_transport_requests_line_manager_email (line_manager_email),
  KEY idx_transport_requests_department_id (department_id),
  KEY idx_transport_requests_location_id (location_id),
  KEY idx_transport_requests_status (approval_status, status),
  CONSTRAINT fk_transport_requests_requester FOREIGN KEY (requester_user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_transport_requests_department FOREIGN KEY (department_id) REFERENCES departments (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_transport_requests_location FOREIGN KEY (location_id) REFERENCES locations (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_transport_requests_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_transport_requests_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS goods_transport_requests (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  transport_request_id INT UNSIGNED NOT NULL,
  required_date DATE NULL,
  pickup_time TIME NULL,
  pickup_location VARCHAR(255) NULL,
  dropoff_location VARCHAR(255) NULL,
  goods_description TEXT NULL,
  goods_quantity VARCHAR(120) NULL,
  vehicle_type VARCHAR(120) NULL,
  purpose_notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_goods_transport_parent (transport_request_id),
  KEY idx_goods_transport_required_date (required_date),
  CONSTRAINT fk_goods_transport_parent FOREIGN KEY (transport_request_id) REFERENCES transport_requests (id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS travel_transport_requests (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  transport_request_id INT UNSIGNED NOT NULL,
  travel_date DATE NULL,
  departure_time TIME NULL,
  return_date DATE NULL,
  pickup_location VARCHAR(255) NULL,
  destination_city_area VARCHAR(255) NULL,
  trip_duration VARCHAR(120) NULL,
  advance_required DECIMAL(14,2) NULL,
  travelers TINYINT UNSIGNED NULL,
  vehicle_type VARCHAR(120) NULL,
  purpose_notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_travel_transport_parent (transport_request_id),
  KEY idx_travel_transport_travel_date (travel_date),
  CONSTRAINT fk_travel_transport_parent FOREIGN KEY (transport_request_id) REFERENCES transport_requests (id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS local_meeting_transport_requests (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  transport_request_id INT UNSIGNED NOT NULL,
  visit_date DATE NULL,
  departure_time TIME NULL,
  return_time TIME NULL,
  pickup_location VARCHAR(255) NULL,
  meeting_visit_location VARCHAR(255) NULL,
  expected_duration VARCHAR(120) NULL,
  passengers TINYINT UNSIGNED NULL,
  vehicle_type VARCHAR(120) NULL,
  purpose_notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_local_meeting_transport_parent (transport_request_id),
  KEY idx_local_meeting_transport_visit_date (visit_date),
  CONSTRAINT fk_local_meeting_transport_parent FOREIGN KEY (transport_request_id) REFERENCES transport_requests (id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS system_settings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  setting_group VARCHAR(80) NOT NULL,
  setting_key VARCHAR(120) NOT NULL,
  setting_value LONGTEXT NULL,
  value_type ENUM('string', 'number', 'boolean', 'json') NOT NULL DEFAULT 'string',
  description VARCHAR(255) NULL,
  updated_by VARCHAR(180) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_system_settings_group_key (setting_group, setting_key),
  KEY idx_system_settings_group (setting_group),
  KEY idx_system_settings_updated_at (updated_at)
) ENGINE=InnoDB;

DROP PROCEDURE IF EXISTS sp_add_column_if_missing;

DELIMITER $$

CREATE PROCEDURE sp_add_column_if_missing(
  IN p_table_name VARCHAR(64),
  IN p_column_name VARCHAR(64),
  IN p_column_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table_name
      AND COLUMN_NAME = p_column_name
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `', p_table_name, '` ADD COLUMN ', p_column_definition);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DELIMITER ;

DROP PROCEDURE IF EXISTS sp_drop_column_if_exists;

DELIMITER $$

CREATE PROCEDURE sp_drop_column_if_exists(
  IN p_table_name VARCHAR(64),
  IN p_column_name VARCHAR(64)
)
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = p_table_name
      AND column_name = p_column_name
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `', p_table_name, '` DROP COLUMN `', p_column_name, '`');
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DELIMITER ;

CALL sp_drop_column_if_exists('items', 'reorder_level');
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
CALL sp_drop_column_if_exists('users', 'role');
CALL sp_add_column_if_missing('vendors', 'deleted_at', 'deleted_at TIMESTAMP NULL');
CALL sp_add_column_if_missing('vendors', 'created_by', 'created_by INT UNSIGNED NULL');
CALL sp_add_column_if_missing('vendors', 'updated_by', 'updated_by INT UNSIGNED NULL');
CALL sp_add_column_if_missing('purchase_orders', 'expected_date', 'expected_date DATE NULL');
CALL sp_add_column_if_missing('purchase_orders', 'delivery_location_id', 'delivery_location_id INT UNSIGNED NULL');
CALL sp_add_column_if_missing('purchase_orders', 'subtotal_amount', 'subtotal_amount DECIMAL(14,4) NOT NULL DEFAULT 0');
CALL sp_add_column_if_missing('purchase_orders', 'tax_amount', 'tax_amount DECIMAL(14,4) NOT NULL DEFAULT 0');
CALL sp_add_column_if_missing('purchase_orders', 'total_amount', 'total_amount DECIMAL(14,4) NOT NULL DEFAULT 0');
CALL sp_add_column_if_missing('purchase_orders', 'deleted_at', 'deleted_at TIMESTAMP NULL');
CALL sp_add_column_if_missing('purchase_orders', 'created_by', 'created_by INT UNSIGNED NULL');
CALL sp_add_column_if_missing('purchase_orders', 'updated_by', 'updated_by INT UNSIGNED NULL');
CALL sp_add_column_if_missing('grns', 'grn_number', 'grn_number VARCHAR(80) NULL');
CALL sp_add_column_if_missing('grns', 'purchase_order_id', 'purchase_order_id INT UNSIGNED NULL');
CALL sp_add_column_if_missing('grns', 'status', 'status VARCHAR(80) NOT NULL DEFAULT ''Draft''');
CALL sp_add_column_if_missing('grns', 'created_by', 'created_by INT UNSIGNED NULL');
CALL sp_add_column_if_missing('grns', 'updated_by', 'updated_by INT UNSIGNED NULL');
CALL sp_add_column_if_missing('requests', 'request_number', 'request_number VARCHAR(80) NULL');
CALL sp_add_column_if_missing('requests', 'line_manager_email', 'line_manager_email VARCHAR(255) NULL');
CALL sp_add_column_if_missing('requests', 'deleted_at', 'deleted_at TIMESTAMP NULL');
CALL sp_add_column_if_missing('requests', 'created_by', 'created_by INT UNSIGNED NULL');
CALL sp_add_column_if_missing('requests', 'updated_by', 'updated_by INT UNSIGNED NULL');
CALL sp_add_column_if_missing('request_items', 'line_no', 'line_no SMALLINT UNSIGNED NOT NULL DEFAULT 1');
CALL sp_add_column_if_missing('request_items', 'quantity_approved', 'quantity_approved DECIMAL(14,4) NOT NULL DEFAULT 0');
CALL sp_add_column_if_missing('request_items', 'source_location_id', 'source_location_id INT UNSIGNED NULL');
CALL sp_add_column_if_missing('request_items', 'line_status', 'line_status VARCHAR(80) NOT NULL DEFAULT ''Pending Approval''');
CALL sp_add_column_if_missing('transport_requests', 'request_number', 'request_number VARCHAR(80) NULL');
CALL sp_add_column_if_missing('transport_requests', 'line_manager_email', 'line_manager_email VARCHAR(255) NULL');
CALL sp_add_column_if_missing('transport_requests', 'created_by', 'created_by INT UNSIGNED NULL');
CALL sp_add_column_if_missing('transport_requests', 'updated_by', 'updated_by INT UNSIGNED NULL');

INSERT IGNORE INTO goods_transport_requests
  (transport_request_id, required_date, pickup_location, dropoff_location, vehicle_type, purpose_notes)
SELECT id, date_of_travel, pickup_location, destination, vehicle_type, notes_remarks
FROM transport_requests
WHERE transport_type = 'Goods Transport';

INSERT IGNORE INTO travel_transport_requests
  (transport_request_id, travel_date, pickup_location, destination_city_area, travelers, vehicle_type, purpose_notes)
SELECT id, date_of_travel, pickup_location, destination, passengers, vehicle_type, notes_remarks
FROM transport_requests
WHERE transport_type = 'Travel Request';

INSERT IGNORE INTO local_meeting_transport_requests
  (transport_request_id, visit_date, pickup_location, meeting_visit_location, passengers, vehicle_type, purpose_notes)
SELECT id, date_of_travel, pickup_location, destination, passengers, vehicle_type, notes_remarks
FROM transport_requests
WHERE transport_type = 'Local Visit / Meeting Transport';

UPDATE transport_requests tr
JOIN audit_logs al ON al.table_name = 'transport_requests' AND al.record_id = tr.id
SET
  tr.line_manager_email = COALESCE(tr.line_manager_email, NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.lineManagerEmail')), 'null')),
  tr.notes_remarks = CASE
    WHEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.purpose')), 'null') IS NOT NULL
      THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.purpose')), 'null')
    WHEN tr.notes_remarks LIKE '%| Submitted by:%'
      THEN TRIM(SUBSTRING_INDEX(tr.notes_remarks, '| Submitted by:', 1))
    WHEN tr.notes_remarks LIKE 'Submitted by:%' OR tr.notes_remarks LIKE 'Line manager email:%'
      THEN NULL
    ELSE tr.notes_remarks
  END
WHERE al.new_values IS NOT NULL;

UPDATE goods_transport_requests gt
JOIN audit_logs al ON al.table_name = 'transport_requests' AND al.record_id = gt.transport_request_id
SET
  gt.required_date = COALESCE(gt.required_date, STR_TO_DATE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.transportDate')), 'null'), '%Y-%m-%d'), STR_TO_DATE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.travelDate')), 'null'), '%Y-%m-%d')),
  gt.pickup_time = COALESCE(gt.pickup_time, STR_TO_DATE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.departureTime')), 'null'), '%H:%i')),
  gt.pickup_location = COALESCE(gt.pickup_location, NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.pickupLocation')), 'null')),
  gt.dropoff_location = COALESCE(gt.dropoff_location, NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.dropoffLocation')), 'null'), NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.destination')), 'null')),
  gt.goods_description = COALESCE(gt.goods_description, NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.goodsDescription')), 'null')),
  gt.goods_quantity = COALESCE(gt.goods_quantity, NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.goodsQuantity')), 'null')),
  gt.vehicle_type = COALESCE(gt.vehicle_type, NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.vehicleType')), 'null')),
  gt.purpose_notes = CASE
    WHEN gt.purpose_notes IS NULL OR gt.purpose_notes = '' OR gt.purpose_notes LIKE 'Submitted by:%'
      THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.purpose')), 'null')
    ELSE gt.purpose_notes
  END
WHERE al.new_values IS NOT NULL;

UPDATE travel_transport_requests tt
JOIN audit_logs al ON al.table_name = 'transport_requests' AND al.record_id = tt.transport_request_id
SET
  tt.travel_date = COALESCE(tt.travel_date, STR_TO_DATE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.travelDate')), 'null'), '%Y-%m-%d')),
  tt.departure_time = COALESCE(tt.departure_time, STR_TO_DATE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.departureTime')), 'null'), '%H:%i')),
  tt.return_date = COALESCE(tt.return_date, STR_TO_DATE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.returnDate')), 'null'), '%Y-%m-%d')),
  tt.pickup_location = COALESCE(tt.pickup_location, NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.pickupLocation')), 'null')),
  tt.destination_city_area = COALESCE(tt.destination_city_area, NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.destination')), 'null')),
  tt.trip_duration = COALESCE(tt.trip_duration, NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.duration')), 'null')),
  tt.advance_required = COALESCE(tt.advance_required, CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.advanceRequired')), 'null') AS DECIMAL(14,2))),
  tt.travelers = COALESCE(tt.travelers, CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.passengers')), 'null') AS UNSIGNED)),
  tt.vehicle_type = COALESCE(tt.vehicle_type, NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.vehicleType')), 'null')),
  tt.purpose_notes = CASE
    WHEN tt.purpose_notes IS NULL OR tt.purpose_notes = '' OR tt.purpose_notes LIKE 'Submitted by:%'
      THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.purpose')), 'null')
    ELSE tt.purpose_notes
  END
WHERE al.new_values IS NOT NULL;

UPDATE local_meeting_transport_requests lm
JOIN audit_logs al ON al.table_name = 'transport_requests' AND al.record_id = lm.transport_request_id
SET
  lm.visit_date = COALESCE(lm.visit_date, STR_TO_DATE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.transportDate')), 'null'), '%Y-%m-%d'), STR_TO_DATE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.travelDate')), 'null'), '%Y-%m-%d'), STR_TO_DATE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.localVisitDate')), 'null'), '%Y-%m-%d')),
  lm.departure_time = COALESCE(lm.departure_time, STR_TO_DATE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.departureTime')), 'null'), '%H:%i'), STR_TO_DATE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.localDepartureTime')), 'null'), '%H:%i')),
  lm.return_time = COALESCE(lm.return_time, STR_TO_DATE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.returnTime')), 'null'), '%H:%i'), STR_TO_DATE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.localReturnTime')), 'null'), '%H:%i')),
  lm.pickup_location = COALESCE(lm.pickup_location, NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.pickupLocation')), 'null')),
  lm.meeting_visit_location = COALESCE(lm.meeting_visit_location, NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.destination')), 'null'), NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.localDestination')), 'null')),
  lm.expected_duration = COALESCE(lm.expected_duration, NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.duration')), 'null'), NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.localDuration')), 'null')),
  lm.passengers = COALESCE(lm.passengers, CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.passengers')), 'null') AS UNSIGNED)),
  lm.vehicle_type = COALESCE(lm.vehicle_type, NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.vehicleType')), 'null')),
  lm.purpose_notes = CASE
    WHEN lm.purpose_notes IS NULL OR lm.purpose_notes = '' OR lm.purpose_notes LIKE 'Submitted by:%'
      THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(al.new_values, '$.purpose')), 'null')
    ELSE lm.purpose_notes
  END
WHERE al.new_values IS NOT NULL;

UPDATE goods_transport_requests
SET purpose_notes = TRIM(SUBSTRING_INDEX(purpose_notes, '| Submitted by:', 1))
WHERE purpose_notes LIKE '%| Submitted by:%';

UPDATE travel_transport_requests
SET purpose_notes = TRIM(SUBSTRING_INDEX(purpose_notes, '| Submitted by:', 1))
WHERE purpose_notes LIKE '%| Submitted by:%';

UPDATE local_meeting_transport_requests
SET purpose_notes = TRIM(SUBSTRING_INDEX(purpose_notes, '| Submitted by:', 1))
WHERE purpose_notes LIKE '%| Submitted by:%';

UPDATE goods_transport_requests
SET purpose_notes = NULL
WHERE purpose_notes LIKE 'Submitted by:%' OR purpose_notes LIKE 'Line manager email:%';

UPDATE travel_transport_requests
SET purpose_notes = NULL
WHERE purpose_notes LIKE 'Submitted by:%' OR purpose_notes LIKE 'Line manager email:%';

UPDATE local_meeting_transport_requests
SET purpose_notes = NULL
WHERE purpose_notes LIKE 'Submitted by:%' OR purpose_notes LIKE 'Line manager email:%';

DROP PROCEDURE IF EXISTS sp_add_column_if_missing;

CREATE OR REPLACE VIEW v_inventory_stock AS
SELECT
  i.id AS item_pk,
  i.item_id,
  i.item_name,
  i.item_type,
  c.name AS category,
  l.id AS location_id,
  l.name AS location_name,
  COALESCE(b.quantity_on_hand, 0) AS quantity_on_hand,
  COALESCE(b.quantity_reserved, 0) AS quantity_reserved,
  COALESCE(b.quantity_available, 0) AS quantity_available,
  CASE
    WHEN COALESCE(b.quantity_on_hand, 0) <= 0 THEN 'Out of stock'
    ELSE 'OK'
  END AS stock_status
FROM items i
JOIN item_categories c ON c.id = i.category_id
CROSS JOIN locations l
LEFT JOIN inventory_balances b ON b.item_id = i.id AND b.location_id = l.id
WHERE i.deleted_at IS NULL AND l.deleted_at IS NULL;

DROP PROCEDURE IF EXISTS sp_record_stock_movement;

DELIMITER $$

CREATE PROCEDURE sp_record_stock_movement(
  IN p_movement_number VARCHAR(80),
  IN p_item_id INT UNSIGNED,
  IN p_location_id INT UNSIGNED,
  IN p_movement_type VARCHAR(40),
  IN p_quantity DECIMAL(14,4),
  IN p_unit_cost DECIMAL(14,4),
  IN p_source_type VARCHAR(40),
  IN p_source_id BIGINT UNSIGNED,
  IN p_source_line_id BIGINT UNSIGNED,
  IN p_notes TEXT,
  IN p_created_by INT UNSIGNED
)
BEGIN
  DECLARE v_delta_on_hand DECIMAL(14,4) DEFAULT 0;
  DECLARE v_delta_reserved DECIMAL(14,4) DEFAULT 0;
  DECLARE v_locked_quantity DECIMAL(14,4) DEFAULT 0;

  IF p_quantity <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Movement quantity must be greater than zero.';
  END IF;

  SET v_delta_on_hand = CASE
    WHEN p_movement_type IN ('OPENING', 'GRN_IN', 'MANUAL_IN', 'TRANSFER_IN', 'ADJUSTMENT_IN') THEN p_quantity
    WHEN p_movement_type IN ('REQUEST_ISSUE', 'MANUAL_OUT', 'TRANSFER_OUT', 'ADJUSTMENT_OUT') THEN -p_quantity
    ELSE 0
  END;

  SET v_delta_reserved = CASE
    WHEN p_movement_type = 'RESERVE' THEN p_quantity
    WHEN p_movement_type IN ('UNRESERVE', 'REQUEST_ISSUE') THEN -p_quantity
    ELSE 0
  END;

  INSERT INTO inventory_balances (item_id, location_id, quantity_on_hand, quantity_reserved, last_movement_at)
  VALUES (p_item_id, p_location_id, 0, 0, CURRENT_TIMESTAMP)
  ON DUPLICATE KEY UPDATE item_id = item_id;

  SELECT quantity_on_hand
  INTO v_locked_quantity
  FROM inventory_balances
  WHERE item_id = p_item_id AND location_id = p_location_id
  FOR UPDATE;

  UPDATE inventory_balances
  SET
    quantity_on_hand = quantity_on_hand + v_delta_on_hand,
    quantity_reserved = quantity_reserved + v_delta_reserved,
    last_movement_at = CURRENT_TIMESTAMP
  WHERE item_id = p_item_id AND location_id = p_location_id;

  INSERT INTO stock_movements (
    movement_number, item_id, location_id, movement_type, quantity, unit_cost,
    source_type, source_id, source_line_id, notes_remarks, created_by
  )
  VALUES (
    p_movement_number, p_item_id, p_location_id, p_movement_type, p_quantity, p_unit_cost,
    p_source_type, p_source_id, p_source_line_id, p_notes, p_created_by
  );
END$$

DELIMITER ;

INSERT INTO item_categories (name)
VALUES ('RWHU'), ('Stationary'), ('Progressive')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO departments (id, code, name, is_active)
VALUES (1, 'ADMIN', 'Administration', 1)
ON DUPLICATE KEY UPDATE code = VALUES(code), name = VALUES(name), is_active = VALUES(is_active), deleted_at = NULL;

INSERT INTO locations (id, code, name, is_active)
VALUES (1, 'MAIN', 'Main Store', 1)
ON DUPLICATE KEY UPDATE code = VALUES(code), name = VALUES(name), is_active = VALUES(is_active), deleted_at = NULL;

INSERT INTO users (id, full_name, email, department_id, location_id, is_line_manager, is_active)
VALUES (1, 'Inventory Manager', 'admin@shehersaaz.local', 1, 1, 1, 1)
ON DUPLICATE KEY UPDATE
  full_name = VALUES(full_name),
  department_id = VALUES(department_id),
  location_id = VALUES(location_id),
  is_line_manager = VALUES(is_line_manager),
  is_active = VALUES(is_active),
  deleted_at = NULL;

INSERT INTO roles (name, description, is_system)
VALUES
  ('Admin', 'Full administrative access.', 1),
  ('Inventory Manager', 'Manage inventory, stock movements, GRNs, and issuance.', 1),
  ('Procurement Officer', 'Manage vendors and purchase orders.', 1),
  ('Approver', 'Approve or reject requests and purchase orders.', 1),
  ('Requester', 'Create and track own requests.', 1),
  ('Viewer', 'Read-only dashboard and reports access.', 1)
ON DUPLICATE KEY UPDATE description = VALUES(description), is_system = VALUES(is_system);

INSERT INTO permissions (permission_key, module, description)
VALUES
  ('setting.manage', 'settings', 'Create and update system settings.'),
  ('user.manage', 'users', 'Create, update, and deactivate users.'),
  ('role.manage', 'users', 'Assign roles and permissions.'),
  ('inventory.manage', 'inventory', 'Create items and post stock movements.'),
  ('inventory.view', 'inventory', 'View inventory balances and movement history.'),
  ('request.create', 'requests', 'Create inventory requests.'),
  ('request.approve', 'requests', 'Approve or reject inventory requests.'),
  ('inventory.issue', 'inventory', 'Issue approved stock to requesters.'),
  ('purchase_order.manage', 'procurement', 'Create and update purchase orders.'),
  ('purchase_order.approve', 'procurement', 'Approve purchase orders.'),
  ('grn.manage', 'procurement', 'Create GRNs and post accepted quantities.'),
  ('audit.view', 'audit', 'View audit and approval history.')
ON DUPLICATE KEY UPDATE module = VALUES(module), description = VALUES(description);

DELETE FROM permissions
WHERE permission_key IN (
  'manage_settings',
  'manage_users',
  'manage_roles',
  'manage_inventory',
  'view_inventory',
  'create_requests',
  'approve_requests',
  'issue_stock',
  'manage_purchase_orders',
  'approve_purchase_orders',
  'manage_grns',
  'view_audit_logs'
);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
  r.name = 'Admin'
  OR (r.name = 'Requester' AND p.permission_key IN ('request.create', 'inventory.view'))
  OR (r.name = 'Inventory Manager' AND p.permission_key IN ('inventory.view', 'inventory.manage', 'inventory.issue', 'grn.manage', 'audit.view'))
  OR (r.name = 'Procurement Officer' AND p.permission_key IN ('inventory.view', 'purchase_order.manage', 'grn.manage'))
  OR (r.name = 'Approver' AND p.permission_key IN ('request.create', 'request.approve', 'inventory.view'))
  OR (r.name = 'Viewer' AND p.permission_key IN ('inventory.view', 'audit.view'))
);

INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by)
SELECT 1, id, 1
FROM roles
WHERE name = 'Admin';

INSERT INTO users (full_name, email, is_line_manager, is_active)
VALUES ('Wania Azam', 'wania.azam@shehersaaz.org.pk', 1, 1)
ON DUPLICATE KEY UPDATE
  full_name = VALUES(full_name),
  is_line_manager = VALUES(is_line_manager),
  is_active = VALUES(is_active),
  deleted_at = NULL;

INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by)
SELECT u.id, r.id, 1
FROM users u
JOIN roles r ON r.name = 'Admin'
WHERE LOWER(u.email) = 'wania.azam@shehersaaz.org.pk';
