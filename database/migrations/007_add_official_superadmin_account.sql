-- Migration: 007_add_official_superadmin_account
-- Purpose:
--   Add the official Shehersaaz Super Admin account without deleting or
--   deactivating the existing legacy Super Admin account.
--
-- Production safety:
--   - Does not drop tables.
--   - Does not delete users.
--   - Does not remove roles from any existing account.
--   - Ensures Super Admin role keeps all current permission mappings.

START TRANSACTION;

-- Ensure the system Super Admin role exists.
INSERT INTO roles (name, description, is_system)
VALUES ('Super Admin', 'System owner role with full administrative access.', 1)
ON DUPLICATE KEY UPDATE
  description = VALUES(description),
  is_system = 1;

-- Ensure the Super Admin role has every permission currently defined.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name = 'Super Admin';

-- Create or re-enable the official Super Admin user.
SET @superadmin_department_id := (
  SELECT id
  FROM departments
  WHERE code = 'IT' OR name = 'IT'
  ORDER BY id
  LIMIT 1
);

SET @superadmin_location_id := (
  SELECT id
  FROM locations
  WHERE code = 'I-9' OR name = 'I-9 warehouse'
  ORDER BY id
  LIMIT 1
);

INSERT INTO users (full_name, email, department_id, location_id, is_line_manager, is_active)
VALUES ('Super Admin', 'superadmin@shehersaaz.org.pk', @superadmin_department_id, @superadmin_location_id, 1, 1)
ON DUPLICATE KEY UPDATE
  full_name = VALUES(full_name),
  department_id = COALESCE(department_id, VALUES(department_id)),
  location_id = COALESCE(location_id, VALUES(location_id)),
  is_line_manager = 1,
  is_active = 1,
  deleted_at = NULL,
  updated_at = CURRENT_TIMESTAMP;

-- Assign the existing Super Admin role to the official account.
INSERT IGNORE INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.name = 'Super Admin'
WHERE LOWER(u.email) = 'superadmin@shehersaaz.org.pk';

COMMIT;

-- Verification query: should return the official account with Super Admin role
-- and every permission assigned to that role.
SELECT
  u.id,
  u.email,
  u.is_active,
  GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ', ') AS roles,
  COUNT(DISTINCT p.permission_key) AS permission_count
FROM users u
LEFT JOIN user_roles ur ON ur.user_id = u.id
LEFT JOIN roles r ON r.id = ur.role_id
LEFT JOIN role_permissions rp ON rp.role_id = r.id
LEFT JOIN permissions p ON p.id = rp.permission_id
WHERE LOWER(u.email) = 'superadmin@shehersaaz.org.pk'
GROUP BY u.id, u.email, u.is_active;
