CREATE DATABASE IF NOT EXISTS ims_system
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ims_system;

CREATE TABLE IF NOT EXISTS departments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_departments_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS locations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_locations_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(180) NOT NULL,
  email VARCHAR(255) NOT NULL,
  department_id INT UNSIGNED NULL,
  location_id INT UNSIGNED NULL,
  is_line_manager TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_department_id (department_id),
  KEY idx_users_location_id (location_id),
  CONSTRAINT fk_users_department
    FOREIGN KEY (department_id) REFERENCES departments (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_users_location
    FOREIGN KEY (location_id) REFERENCES locations (id)
    ON UPDATE CASCADE ON DELETE SET NULL
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
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_vendors_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id VARCHAR(80) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  item_type VARCHAR(255) NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  location_id INT UNSIGNED NULL,
  stock DECIMAL(14,2) NOT NULL DEFAULT 0,
  status ENUM('OK', 'Restock needed', 'Out of stock') NOT NULL DEFAULT 'Out of stock',
  unit VARCHAR(50) NULL,
  notes_remarks TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_items_item_id (item_id),
  KEY idx_items_category_id (category_id),
  KEY idx_items_location_id (location_id),
  KEY idx_items_name_type (item_name, item_type),
  CONSTRAINT fk_items_category
    FOREIGN KEY (category_id) REFERENCES item_categories (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_items_location
    FOREIGN KEY (location_id) REFERENCES locations (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  po_number VARCHAR(80) NOT NULL,
  issue_date DATE NULL,
  vendor_id INT UNSIGNED NOT NULL,
  specifications TEXT NULL,
  quantity_ordered DECIMAL(14,2) NOT NULL DEFAULT 0,
  unit_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  po_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(80) NOT NULL DEFAULT 'Open',
  arrived_by DATE NULL,
  location_id INT UNSIGNED NULL,
  quantity_received DECIMAL(14,2) NOT NULL DEFAULT 0,
  notes_remarks TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_purchase_orders_po_number (po_number),
  KEY idx_purchase_orders_vendor_id (vendor_id),
  KEY idx_purchase_orders_location_id (location_id),
  CONSTRAINT fk_purchase_orders_vendor
    FOREIGN KEY (vendor_id) REFERENCES vendors (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_purchase_orders_location
    FOREIGN KEY (location_id) REFERENCES locations (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS grns (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  grn_id VARCHAR(80) NOT NULL,
  po_id INT UNSIGNED NULL,
  quantity_received DECIMAL(14,2) NOT NULL DEFAULT 0,
  grn_date DATE NULL,
  received_by VARCHAR(180) NULL,
  location_id INT UNSIGNED NULL,
  notes_remarks TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_grns_grn_id (grn_id),
  KEY idx_grns_po_id (po_id),
  KEY idx_grns_location_id (location_id),
  CONSTRAINT fk_grns_purchase_order
    FOREIGN KEY (po_id) REFERENCES purchase_orders (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_grns_location
    FOREIGN KEY (location_id) REFERENCES locations (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_in (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_date DATE NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  quantity DECIMAL(14,2) NOT NULL,
  vendor_id INT UNSIGNED NULL,
  location_id INT UNSIGNED NOT NULL,
  received_by VARCHAR(180) NULL,
  source_type VARCHAR(60) NOT NULL DEFAULT 'MANUAL',
  source_id VARCHAR(80) NULL,
  notes_remarks TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_stock_in_item_id (item_id),
  KEY idx_stock_in_vendor_id (vendor_id),
  KEY idx_stock_in_location_id (location_id),
  KEY idx_stock_in_order_date (order_date),
  CONSTRAINT fk_stock_in_item
    FOREIGN KEY (item_id) REFERENCES items (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_stock_in_vendor
    FOREIGN KEY (vendor_id) REFERENCES vendors (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_stock_in_location
    FOREIGN KEY (location_id) REFERENCES locations (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_stock_in_quantity CHECK (quantity > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_out (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  issue_date DATE NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  quantity_issued DECIMAL(14,2) NOT NULL,
  from_location_id INT UNSIGNED NOT NULL,
  to_location_id INT UNSIGNED NULL,
  issued_by VARCHAR(180) NULL,
  source_type VARCHAR(60) NOT NULL DEFAULT 'MANUAL',
  source_id VARCHAR(80) NULL,
  notes_remarks TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_stock_out_item_id (item_id),
  KEY idx_stock_out_from_location_id (from_location_id),
  KEY idx_stock_out_to_location_id (to_location_id),
  KEY idx_stock_out_issue_date (issue_date),
  CONSTRAINT fk_stock_out_item
    FOREIGN KEY (item_id) REFERENCES items (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_stock_out_from_location
    FOREIGN KEY (from_location_id) REFERENCES locations (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_stock_out_to_location
    FOREIGN KEY (to_location_id) REFERENCES locations (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_stock_out_quantity CHECK (quantity_issued > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS requests (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id VARCHAR(80) NOT NULL,
  request_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  requester_user_id INT UNSIGNED NULL,
  department_id INT UNSIGNED NULL,
  location_id INT UNSIGNED NULL,
  line_manager_email VARCHAR(255) NULL,
  approval_status ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
  issuance_status ENUM('Pending', 'Issued', 'Partial') NOT NULL DEFAULT 'Pending',
  issue_date DATE NULL,
  issued_to_location_id INT UNSIGNED NULL,
  issued_by VARCHAR(180) NULL,
  notes_remarks TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_requests_request_id (request_id),
  KEY idx_requests_requester_user_id (requester_user_id),
  KEY idx_requests_department_id (department_id),
  KEY idx_requests_location_id (location_id),
  KEY idx_requests_issued_to_location_id (issued_to_location_id),
  KEY idx_requests_statuses (approval_status, issuance_status),
  CONSTRAINT fk_requests_requester
    FOREIGN KEY (requester_user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_requests_department
    FOREIGN KEY (department_id) REFERENCES departments (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_requests_location
    FOREIGN KEY (location_id) REFERENCES locations (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_requests_issued_to_location
    FOREIGN KEY (issued_to_location_id) REFERENCES locations (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS request_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id INT UNSIGNED NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  item_name_snapshot VARCHAR(255) NULL,
  item_type_snapshot VARCHAR(255) NULL,
  item_code_snapshot VARCHAR(80) NULL,
  quantity_requested INT UNSIGNED NOT NULL,
  quantity_issued DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_request_items_request_id (request_id),
  KEY idx_request_items_item_id (item_id),
  CONSTRAINT fk_request_items_request
    FOREIGN KEY (request_id) REFERENCES requests (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_request_items_item
    FOREIGN KEY (item_id) REFERENCES items (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_request_items_quantity_requested CHECK (quantity_requested > 0),
  CONSTRAINT chk_request_items_quantity_issued CHECK (quantity_issued >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS transport_requests (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id VARCHAR(80) NOT NULL,
  requester_user_id INT UNSIGNED NULL,
  department_id INT UNSIGNED NULL,
  location_id INT UNSIGNED NULL,
  transport_type VARCHAR(120) NOT NULL,
  date_of_travel DATE NULL,
  pickup_location VARCHAR(255) NULL,
  destination VARCHAR(255) NULL,
  vehicle_type VARCHAR(120) NULL,
  passengers TINYINT UNSIGNED NULL,
  approval_status ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
  status VARCHAR(80) NOT NULL DEFAULT 'Pending',
  notes_remarks TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_transport_requests_request_id (request_id),
  KEY idx_transport_requests_requester_user_id (requester_user_id),
  KEY idx_transport_requests_department_id (department_id),
  KEY idx_transport_requests_location_id (location_id),
  KEY idx_transport_requests_status (approval_status, status),
  CONSTRAINT fk_transport_requests_requester
    FOREIGN KEY (requester_user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_transport_requests_department
    FOREIGN KEY (department_id) REFERENCES departments (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_transport_requests_location
    FOREIGN KEY (location_id) REFERENCES locations (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS activity_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  table_name VARCHAR(120) NOT NULL,
  record_id INT UNSIGNED NOT NULL,
  action ENUM('INSERT', 'UPDATE', 'DELETE') NOT NULL,
  changed_by INT UNSIGNED NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  old_values JSON NULL,
  new_values JSON NULL,
  PRIMARY KEY (id),
  KEY idx_activity_log_table_record (table_name, record_id),
  KEY idx_activity_log_changed_by (changed_by),
  KEY idx_activity_log_changed_at (changed_at),
  CONSTRAINT fk_activity_log_changed_by
    FOREIGN KEY (changed_by) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO item_categories (name)
VALUES ('RWHU'), ('Stationary'), ('Progressive')
ON DUPLICATE KEY UPDATE name = VALUES(name);
