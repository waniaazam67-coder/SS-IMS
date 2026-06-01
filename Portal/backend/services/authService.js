const { pool } = require("../config/database");
const config = require("../config/env");

const DEFAULT_ROLE = "Requester";
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
    roles: roleRows.map((row) => row.name),
    permissions: permissionRows.map((row) => row.permission)
  };
}

async function ensureUserExists(email, fallbackName) {
  const name = String(fallbackName || email.split("@")[0] || "IMS User").trim();

  await pool.execute(
    `INSERT INTO users (full_name, email, is_active)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE deleted_at = NULL, is_active = 1`,
    [name, email]
  );

  await pool.execute(
    `INSERT IGNORE INTO user_roles (user_id, role_id)
     SELECT u.id, r.id
       FROM users u
       JOIN roles r ON r.name = ?
      WHERE LOWER(u.email) = ?`,
    [DEFAULT_ROLE, email]
  );
}

async function resolveAuthContextFromToken(token) {
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
    roles: row.roles ? row.roles.split(",") : []
  }));
}

async function listRoles() {
  const [rows] = await pool.execute(
    `SELECT id, name, description, is_system AS isSystem
       FROM roles
      ORDER BY name`
  );
  return rows.map((row) => ({ ...row, isSystem: Boolean(row.isSystem) }));
}

async function assignRoleToUser(userId, roleName, assignedBy) {
  const [result] = await pool.execute(
    `INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by)
     SELECT u.id, r.id, ?
       FROM users u
       JOIN roles r ON r.name = ?
      WHERE u.id = ? AND u.deleted_at IS NULL`,
    [assignedBy || null, roleName, userId]
  );

  if (!result.affectedRows) await assertUserAndRole(userId, roleName);
}

async function removeRoleFromUser(userId, roleName) {
  const [result] = await pool.execute(
    `DELETE ur
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND r.name = ?`,
    [userId, roleName]
  );

  if (!result.affectedRows) await assertUserAndRole(userId, roleName);
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
  listRoles,
  listUsers,
  removeRoleFromUser,
  resolveAuthContextFromToken
};
