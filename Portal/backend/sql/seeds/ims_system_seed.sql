USE ims_system;

INSERT INTO departments (id, code, name, is_active)
VALUES
  (1, 'OPS', 'Operations', 1),
  (2, 'PROC', 'Procurement', 1),
  (3, 'ADMIN', 'Administration', 1),
  (4, 'FIN', 'Finance', 1),
  (5, 'IT', 'IT', 1)
ON DUPLICATE KEY UPDATE
  code = VALUES(code),
  name = VALUES(name),
  is_active = VALUES(is_active);

INSERT INTO locations (id, code, name, is_active)
VALUES
  (1, 'MAIN', 'Main Store', 1),
  (2, 'RWHU', 'RWHU Store', 1),
  (3, 'PROG', 'Progressive Store', 1),
  (4, 'STAT', 'Stationary Store', 1)
ON DUPLICATE KEY UPDATE
  code = VALUES(code),
  name = VALUES(name),
  is_active = VALUES(is_active);

INSERT INTO item_categories (name, is_active)
VALUES
  ('Stationary', 1),
  ('RWHU', 1),
  ('Progressive', 1),
  ('General', 1)
ON DUPLICATE KEY UPDATE
  is_active = VALUES(is_active),
  deleted_at = NULL;

INSERT INTO roles (name, description, is_system)
VALUES
  ('Admin', 'Full system administration access.', 1),
  ('Requester', 'Can create and track own inventory and transport requests.', 1),
  ('Approver', 'Can approve or reject assigned requests.', 1),
  ('Inventory Manager', 'Can manage inventory, stock movement, issue stock, and GRNs.', 1),
  ('Procurement Officer', 'Can manage vendors and purchase orders.', 1),
  ('Viewer', 'Read-only dashboard and reports access.', 1)
ON DUPLICATE KEY UPDATE
  description = VALUES(description),
  is_system = VALUES(is_system);

INSERT INTO permissions (permission_key, module, description)
VALUES
  ('setting.manage', 'settings', 'Create and update system settings.'),
  ('user.manage', 'users', 'Create, update, and deactivate users.'),
  ('role.manage', 'users', 'Assign roles and permissions.'),
  ('inventory.manage', 'inventory', 'Create items and manual stock movements.'),
  ('inventory.view', 'inventory', 'View inventory balances and item masters.'),
  ('request.create', 'requests', 'Create and view inventory and transport requests.'),
  ('request.approve', 'requests', 'Approve or reject inventory and transport requests.'),
  ('inventory.issue', 'inventory', 'Issue stock against approved requests.'),
  ('purchase_order.manage', 'procurement', 'Manage vendors and purchase orders.'),
  ('purchase_order.approve', 'procurement', 'Approve purchase orders.'),
  ('grn.manage', 'procurement', 'Create goods received notes and post accepted stock.'),
  ('audit.view', 'audit', 'View audit and movement reports.')
ON DUPLICATE KEY UPDATE
  module = VALUES(module),
  description = VALUES(description);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name = 'Admin';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_key IN ('inventory.view', 'request.create')
WHERE r.name = 'Requester';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_key IN ('inventory.view', 'request.create', 'request.approve')
WHERE r.name = 'Approver';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_key IN ('inventory.view', 'inventory.manage', 'inventory.issue', 'grn.manage', 'audit.view')
WHERE r.name = 'Inventory Manager';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_key IN ('inventory.view', 'purchase_order.manage', 'grn.manage')
WHERE r.name = 'Procurement Officer';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_key IN ('inventory.view', 'audit.view')
WHERE r.name = 'Viewer';

INSERT INTO users (full_name, email, department_id, location_id, is_line_manager, is_active)
VALUES ('IMS Admin Placeholder', 'admin@example.com', 5, 1, 1, 1)
ON DUPLICATE KEY UPDATE
  full_name = VALUES(full_name),
  department_id = VALUES(department_id),
  location_id = VALUES(location_id),
  is_line_manager = VALUES(is_line_manager),
  is_active = VALUES(is_active),
  deleted_at = NULL;

INSERT IGNORE INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.name = 'Admin'
WHERE u.email = 'admin@example.com';

INSERT INTO item_types (category_id, name)
SELECT DISTINCT i.category_id, i.item_type
FROM items i
WHERE i.item_type IS NOT NULL AND i.item_type <> ''
ON DUPLICATE KEY UPDATE name = VALUES(name);

UPDATE items i
JOIN item_types it ON it.category_id <=> i.category_id AND it.name = i.item_type
SET i.item_type_id = it.id
WHERE i.item_type_id IS NULL;
