const { pool } = require("../config/database");
const config = require("../config/env");

const DEFAULT_ROLE = "requestor";
const ROLE_DEFINITIONS = Object.freeze([
  { key: "admin", dbName: "Admin", label: "Admin" },
  { key: "requestor", dbName: "Requester", label: "Requestor" },
  { key: "approver", dbName: "Approver", label: "Approver" },
  { key: "inventory_manager", dbName: "Inventory Manager", label: "Inventory Manager" }
]);
const ROLE_BY_KEY = new Map(ROLE_DEFINITIONS.map((role) => [role.key, role]));
const ROLE_KEY_BY_DB_NAME = new Map(ROLE_DEFINITIONS.map((role) => [role.dbName.toLowerCase(), role.key]));
let firebaseAdminAuth = null;

function getFirebaseAdminAuth() {
  if (firebaseAdminAuth) return firebaseAdminAuth;
  try {
    const admin = require("firebase-admin");
    if (!admin.apps.length) {
      admin.initializeApp({ projectId: config.firebase.projectId });
    }
    firebaseAdminAuth = admin.auth();
    return firebaseAdminAuth;
  } catch (error) {
    return null;
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeRoleKey(role) {
  return String(role || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function toRoleKey(dbName) {
  const normalized = String(dbName || "").trim().toLowerCase();
  return ROLE_KEY_BY_DB_NAME.get(normalized) || normalizeRoleKey(dbName);
}

function toDbRoleName(roleKey) {
  const role = ROLE_BY_KEY.get(normalizeRoleKey(roleKey));
  if (!role) {
    const error = new Error(`Unsupported role: ${roleKey}`);
    error.statusCode = 400;
    throw error;
  }
  return role.dbName;
}

async function getUserAuthContextByEmail(email, fallbackName = "") {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return null;

  await ensureUserExists(cleanEmail, fallbackName);

  const [users] = await pool.execute(
    `SELECT u.id, u.full_name AS fullName, u.email, u.department_id AS departmentId,
            u.location_id AS locationId, u.is_line_manager AS isLineManager,
            u.is_active AS isActive
       FROM users u
      WHERE LOWER(u.email) = ? AND u.deleted_at IS NULL
      LIMIT 1`,
    [cleanEmail]
  );

  const user = users[0];
  if (!user || !Number(user.isActive)) return null;

  const [roleRows] = await pool.execute(
    `SELECT r.name
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ?
      ORDER BY r.name`,
    [user.id]
  );

  const [permissionRows] = await pool.execute(
    `SELECT DISTINCT p.permission_key AS permission
       FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = ?
      ORDER BY p.permission_key`,
    [user.id]
  );

  return {
    user: {
      id: user.id,
      name: user.fullName,
      email: user.email,
      departmentId: user.departmentId,
      locationId: user.locationId,
      isLineManager: Boolean(user.isLineManager),
      status: "active"
    },
    roles: roleRows.map((row) => toRoleKey(row.name)),
    permissions: permissionRows.map((row) => row.permission)
  };
}

async function ensureUserExists(email, fallbackName) {
  const name = String(fallbackName || email.split("@")[0] || "IMS User").trim();

  await pool.execute(
    `INSERT INTO users (full_name, email, is_active)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE deleted_at = NULL`,
    [name, email]
  );

  await pool.execute(
    `INSERT IGNORE INTO user_roles (user_id, role_id)
     SELECT u.id, r.id
       FROM users u
       JOIN roles r ON r.name = ?
      WHERE LOWER(u.email) = ?`,
    [toDbRoleName(DEFAULT_ROLE), email]
  );
}

async function resolveAuthContextFromToken(token) {
  if (!token) return null;
  const adminAuth = getFirebaseAdminAuth();
  const payload = adminAuth ? await adminAuth.verifyIdToken(token) : null;
  if (!payload) return null;
  return getUserAuthContextByEmail(payload.email, payload.name || payload.displayName);
}

async function listUsers() {
  const [rows] = await pool.execute(
    `SELECT u.id, u.full_name AS name, u.email, u.is_active AS isActive,
            GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ',') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.deleted_at IS NULL
      GROUP BY u.id, u.full_name, u.email, u.is_active
      ORDER BY u.full_name`
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    isActive: Boolean(row.isActive),
    status: Number(row.isActive) ? "active" : "inactive",
    roles: row.roles ? row.roles.split(",").map(toRoleKey) : []
  }));
}

async function listRoles() {
  const [rows] = await pool.execute(
    `SELECT id, name, description, is_system AS isSystem
       FROM roles
      ORDER BY name`
  );
  return rows
    .map((row) => ({
      id: row.id,
      name: toRoleKey(row.name),
      label: ROLE_BY_KEY.get(toRoleKey(row.name))?.label || row.name,
      description: row.description,
      isSystem: Boolean(row.isSystem)
    }))
    .filter((row) => ROLE_BY_KEY.has(row.name));
}

async function createUser(input = {}, createdBy) {
  const email = normalizeEmail(input.email);
  const name = String(input.name || input.fullName || "").trim();
  const roles = Array.isArray(input.roles) && input.roles.length ? input.roles : [DEFAULT_ROLE];
  if (!name) {
    const error = new Error("User name is required.");
    error.statusCode = 400;
    throw error;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    const error = new Error("A valid email is required.");
    error.statusCode = 400;
    throw error;
  }

  const normalizedRoles = [...new Set(roles.map(normalizeRoleKey))];
  const dbRoleNames = normalizedRoles.map(toDbRoleName);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `INSERT INTO users (full_name, email, is_active, created_by, updated_by)
       VALUES (?, ?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE
         id = LAST_INSERT_ID(id),
         full_name = VALUES(full_name),
         is_active = 1,
         deleted_at = NULL,
         updated_by = VALUES(updated_by)`,
      [name, email, createdBy || null, createdBy || null]
    );
    const userId = result.insertId;
    await connection.execute(`DELETE FROM user_roles WHERE user_id = ?`, [userId]);
    for (const dbRoleName of dbRoleNames) {
      await connection.execute(
        `INSERT INTO user_roles (user_id, role_id, assigned_by)
         SELECT ?, id, ? FROM roles WHERE name = ?`,
        [userId, createdBy || null, dbRoleName]
      );
    }
    await connection.commit();
    return getUserById(userId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function assignRoleToUser(userId, roleName, assignedBy) {
  const dbRoleName = toDbRoleName(roleName);
  const [result] = await pool.execute(
    `INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by)
     SELECT u.id, r.id, ?
       FROM users u
       JOIN roles r ON r.name = ?
      WHERE u.id = ? AND u.deleted_at IS NULL`,
    [assignedBy || null, dbRoleName, userId]
  );

  if (!result.affectedRows) await assertUserAndRole(userId, dbRoleName);
}

async function removeRoleFromUser(userId, roleName) {
  const dbRoleName = toDbRoleName(roleName);
  const [result] = await pool.execute(
    `DELETE ur
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND r.name = ?`,
    [userId, dbRoleName]
  );

  if (!result.affectedRows) await assertUserAndRole(userId, dbRoleName);
}

async function setUserRoles(userId, roles, assignedBy) {
  if (!Array.isArray(roles)) {
    const error = new Error("roles must be an array.");
    error.statusCode = 400;
    throw error;
  }

  const normalizedRoles = [...new Set(roles.map(normalizeRoleKey))];
  if (!normalizedRoles.length) {
    const error = new Error("A user must have at least one role.");
    error.statusCode = 400;
    throw error;
  }

  const dbRoleNames = normalizedRoles.map(toDbRoleName);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [users] = await connection.execute(
      `SELECT id FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [userId]
    );
    if (!users.length) {
      const error = new Error("User not found.");
      error.statusCode = 404;
      throw error;
    }

    await connection.execute(`DELETE FROM user_roles WHERE user_id = ?`, [userId]);
    for (const dbRoleName of dbRoleNames) {
      await connection.execute(
        `INSERT INTO user_roles (user_id, role_id, assigned_by)
         SELECT ?, id, ? FROM roles WHERE name = ?`,
        [userId, assignedBy || null, dbRoleName]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return getUserById(userId);
}

async function getUserById(userId) {
  const users = await listUsers();
  return users.find((user) => Number(user.id) === Number(userId)) || null;
}

async function setUserActiveStatus(userId, isActive, updatedBy) {
  const activeValue = isActive ? 1 : 0;
  const [result] = await pool.execute(
    `UPDATE users
        SET is_active = ?, updated_by = ?
      WHERE id = ? AND deleted_at IS NULL`,
    [activeValue, updatedBy || null, userId]
  );

  if (!result.affectedRows) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  return getUserById(userId);
}

async function deleteUser(userId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [users] = await connection.execute(
      `SELECT id FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );

    if (!users.length) {
      const error = new Error("User not found.");
      error.statusCode = 404;
      throw error;
    }

    await connection.execute(`DELETE FROM user_roles WHERE user_id = ?`, [userId]);
    const [result] = await connection.execute(`DELETE FROM users WHERE id = ?`, [userId]);

    if (!result.affectedRows) {
      const error = new Error("User not found.");
      error.statusCode = 404;
      throw error;
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function assertUserAndRole(userId, roleName) {
  const [rows] = await pool.execute(
    `SELECT
       EXISTS(SELECT 1 FROM users WHERE id = ? AND deleted_at IS NULL) AS userExists,
       EXISTS(SELECT 1 FROM roles WHERE name = ?) AS roleExists`,
    [userId, roleName]
  );

  if (!Number(rows[0].userExists)) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  if (!Number(rows[0].roleExists)) {
    const error = new Error("Role not found.");
    error.statusCode = 404;
    throw error;
  }
}

module.exports = {
  assignRoleToUser,
  createUser,
  deleteUser,
  getUserById,
  listRoles,
  listUsers,
  removeRoleFromUser,
  setUserActiveStatus,
  setUserRoles,
  resolveAuthContextFromToken
};
