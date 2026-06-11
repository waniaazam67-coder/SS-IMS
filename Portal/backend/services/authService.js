const fs = require("fs");
const path = require("path");
const { pool } = require("../config/database");
const config = require("../config/env");

const DEFAULT_ROLE = "requestor";
const ALLOWED_EMAIL_DOMAIN = "@shehersaaz.org.pk";
const OFFICIAL_EMAIL_MESSAGE = "Only Shehersaaz official email addresses are allowed.";
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
    const { cert, getApps, initializeApp } = require("firebase-admin/app");
    const { getAuth } = require("firebase-admin/auth");
    if (!getApps().length) {
      const credentialConfig = getFirebaseCredentialConfig();
      if (!credentialConfig) {
        if (config.isProduction) {
          throw new Error("Missing Firebase Admin service account configuration.");
        }
        console.warn("Firebase Admin Auth is not configured; user management and token verification are limited.");
        return null;
      }
      initializeApp({
        credential: cert(credentialConfig),
        projectId: credentialConfig.projectId
      });
    }
    firebaseAdminAuth = getAuth();
    return firebaseAdminAuth;
  } catch (error) {
    console.error("Firebase Admin Auth initialization failed:", error.message);
    if (config.isProduction) throw error;
    return null;
  }
}

function getFirebaseCredentialConfig() {
  const serviceAccountPath = String(config.firebase.admin.serviceAccountPath || "").trim();
  if (serviceAccountPath) {
    const resolvedPath = resolveServiceAccountPath(serviceAccountPath);
    if (fs.existsSync(resolvedPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
      return {
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key
      };
    }
    console.error(`Firebase service account file not found: ${resolvedPath}`);
  }

  const projectId = String(config.firebase.admin.projectId || "").trim();
  const clientEmail = String(config.firebase.admin.clientEmail || "").trim();
  const privateKey = String(config.firebase.admin.privateKey || "").replace(/^"|"$/g, "").replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

function resolveServiceAccountPath(serviceAccountPath) {
  if (path.isAbsolute(serviceAccountPath)) return serviceAccountPath;
  const candidates = [
    path.resolve(process.cwd(), serviceAccountPath),
    path.resolve(__dirname, "..", serviceAccountPath),
    path.resolve(__dirname, "../..", serviceAccountPath)
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function firebaseAuthUnavailableError() {
  const error = new Error("Firebase Admin Auth is not configured. Configure Firebase service credentials before managing portal users.");
  error.statusCode = 503;
  return error;
}

function isFirebaseUserNotFound(error) {
  return error?.code === "auth/user-not-found";
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isAllowedOfficialEmail(email) {
  return normalizeEmail(email).endsWith(ALLOWED_EMAIL_DOMAIN);
}

function assertAllowedOfficialEmail(email) {
  if (isAllowedOfficialEmail(email)) return;
  const error = new Error(OFFICIAL_EMAIL_MESSAGE);
  error.statusCode = 403;
  throw error;
}

function normalizeRoleKey(role) {
  return String(role || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function toRoleKey(dbName) {
  const normalized = String(dbName || "").trim().toLowerCase();
  return ROLE_KEY_BY_DB_NAME.get(normalized) || normalizeRoleKey(dbName);
}

function toTitleCaseWords(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function toDbRoleName(roleKey) {
  const role = ROLE_BY_KEY.get(normalizeRoleKey(roleKey));
  if (role) return role.dbName;
  const normalized = normalizeRoleKey(roleKey);
  if (!normalized) {
    const error = new Error("Role name is required.");
    error.statusCode = 400;
    throw error;
  }
  return toTitleCaseWords(normalized.replace(/_/g, " "));
}

async function getUserAuthContextByEmail(email, fallbackName = "") {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return null;
  assertAllowedOfficialEmail(cleanEmail);

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
  assertAllowedOfficialEmail(email);
  const name = String(fallbackName || email.split("@")[0] || "IMS User").trim();

  await pool.execute(
    `INSERT INTO users (full_name, email, is_active)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE
       full_name = VALUES(full_name),
       is_active = 1,
       deleted_at = NULL`,
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
  if (!adminAuth) throw firebaseAuthUnavailableError();
  const payload = await adminAuth.verifyIdToken(token);
  if (!payload) return null;
  assertAllowedOfficialEmail(payload.email);
  if (!payload.email_verified) {
    const error = new Error("Verify your email address before signing in to the portal.");
    error.statusCode = 403;
    throw error;
  }
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
    }));
}

async function createRole(input = {}, createdBy) {
  const label = toTitleCaseWords(String(input.label || input.name || "").replace(/[_-]+/g, " "));
  const description = String(input.description || "").trim();
  if (!label) {
    const error = new Error("Role name is required.");
    error.statusCode = 400;
    throw error;
  }

  const normalizedKey = normalizeRoleKey(label);
  if (normalizedKey === "admin") {
    const error = new Error("Admin role already exists.");
    error.statusCode = 400;
    throw error;
  }

  const [existing] = await pool.execute(
    `SELECT id
       FROM roles
      WHERE LOWER(REPLACE(name, ' ', '_')) = ?
      LIMIT 1`,
    [normalizedKey]
  );
  if (existing.length) {
    const error = new Error("Role already exists.");
    error.statusCode = 409;
    throw error;
  }

  const [result] = await pool.execute(
    `INSERT INTO roles (name, description, is_system)
     VALUES (?, ?, 0)`,
    [label, description || null]
  );

  return {
    id: result.insertId,
    name: normalizedKey,
    label,
    description,
    isSystem: false
  };
}

async function deleteRole(roleName) {
  const normalizedKey = normalizeRoleKey(roleName);
  if (!normalizedKey) {
    const error = new Error("Role not found.");
    error.statusCode = 404;
    throw error;
  }

  const [roles] = await pool.execute(
    `SELECT id, name, is_system AS isSystem
       FROM roles
      WHERE LOWER(REPLACE(name, ' ', '_')) = ?
      LIMIT 1`,
    [normalizedKey]
  );

  const role = roles[0];
  if (!role) {
    const error = new Error("Role not found.");
    error.statusCode = 404;
    throw error;
  }

  if (Boolean(role.isSystem) || ROLE_BY_KEY.has(normalizedKey)) {
    const error = new Error("System roles cannot be deleted.");
    error.statusCode = 400;
    throw error;
  }

  const [usageRows] = await pool.execute(
    `SELECT COUNT(*) AS memberCount
       FROM user_roles
      WHERE role_id = ?`,
    [role.id]
  );

  if (Number(usageRows[0]?.memberCount || 0) > 0) {
    const error = new Error("Remove this role from all users before deleting it.");
    error.statusCode = 409;
    throw error;
  }

  const [result] = await pool.execute(
    `DELETE FROM roles
      WHERE id = ? AND is_system = 0`,
    [role.id]
  );

  if (!result.affectedRows) {
    const error = new Error("Role not found.");
    error.statusCode = 404;
    throw error;
  }
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
  assertAllowedOfficialEmail(email);

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
    const inviteLink = await createPasswordSetupLink(email, input.inviteBaseUrl);
    await connection.commit();
    const user = await getUserById(userId);
    return { ...user, inviteLink };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function createPasswordSetupLink(email, inviteBaseUrl = "") {
  const cleanEmail = normalizeEmail(email);
  assertAllowedOfficialEmail(cleanEmail);
  const adminAuth = getFirebaseAdminAuth();
  if (!adminAuth) throw firebaseAuthUnavailableError();

  let userRecord = null;
  try {
    userRecord = await adminAuth.getUserByEmail(cleanEmail);
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    userRecord = await adminAuth.createUser({
      email: cleanEmail,
      emailVerified: true,
      disabled: false
    });
  }

  const cleanBaseUrl = String(inviteBaseUrl || "").trim().replace(/\/+$/, "");
  if (!cleanBaseUrl) {
    return adminAuth.generatePasswordResetLink(cleanEmail);
  }

  const setupUrl = new URL(`${cleanBaseUrl}/setup-password.html`);
  const actionCodeSettings = {
    url: setupUrl.toString(),
    handleCodeInApp: false
  };
  const firebaseResetLink = await adminAuth.generatePasswordResetLink(cleanEmail, actionCodeSettings);
  const firebaseResetUrl = new URL(firebaseResetLink);
  const oobCode = firebaseResetUrl.searchParams.get("oobCode");
  if (!oobCode) return firebaseResetLink;

  setupUrl.searchParams.set("mode", "resetPassword");
  setupUrl.searchParams.set("oobCode", oobCode);
  setupUrl.searchParams.set("continueUrl", `${cleanBaseUrl}/index.html`);
  return setupUrl.toString();
}

function assertFirebaseAdminReady() {
  const adminAuth = getFirebaseAdminAuth();
  if (!adminAuth) throw firebaseAuthUnavailableError();
  return true;
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
  const [users] = await pool.execute(
    `SELECT id, email
       FROM users
      WHERE id = ?
      LIMIT 1`,
    [userId]
  );

  if (!users.length) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  const email = normalizeEmail(users[0].email);
  if (email) {
    const adminAuth = getFirebaseAdminAuth();
    if (!adminAuth) throw firebaseAuthUnavailableError();
    try {
      const userRecord = await adminAuth.getUserByEmail(email);
      await adminAuth.deleteUser(userRecord.uid);
    } catch (error) {
      if (!isFirebaseUserNotFound(error)) throw error;
    }
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
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
  createRole,
  createUser,
  createPasswordSetupLink,
  assertFirebaseAdminReady,
  deleteRole,
  deleteUser,
  getUserById,
  listRoles,
  listUsers,
  removeRoleFromUser,
  setUserActiveStatus,
  setUserRoles,
  resolveAuthContextFromToken
};
