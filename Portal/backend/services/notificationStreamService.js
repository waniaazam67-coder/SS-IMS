const { pool } = require("../config/database");

const clients = new Map();

function isAdminContext(auth = {}) {
  const roles = (auth.roles || []).map((role) => String(role || "").toLowerCase());
  const permissions = new Set(auth.permissions || []);
  return roles.includes("superadmin") || roles.includes("admin") || permissions.has("setting.manage") || permissions.has("user.manage");
}

function notificationVisibilityWhere(auth = {}, alias = "n") {
  const email = String(auth.user?.email || "").trim().toLowerCase();
  const clauses = [`${alias}.recipient_user_id = ?`];
  const params = [auth.user?.id || 0];
  if (email) {
    clauses.push(`LOWER(${alias}.recipient_email) = ?`);
    params.push(email);
  }
  if (isAdminContext(auth)) clauses.push(`(${alias}.recipient_user_id IS NULL AND ${alias}.recipient_email IS NULL)`);
  return { sql: `(${clauses.join(" OR ")})`, params };
}

function notificationType(row = {}) {
  const metadata = parseJson(row.metadata);
  if (metadata.type) return metadata.type;
  return String(row.entityType || row.entity_type || "system").replace(/_/g, " ");
}

function parseJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function formatNotification(row = {}) {
  return {
    id: row.id,
    notificationKey: row.notificationKey,
    title: row.title,
    message: row.message,
    entityType: row.entityType,
    entityId: row.entityId,
    status: row.status,
    priority: row.priority,
    createdAt: row.createdAt,
    readAt: row.readAt,
    recipientUserId: row.recipientUserId,
    recipientEmail: row.recipientEmail,
    type: notificationType(row),
    unread: row.status !== "read",
    metadata: parseJson(row.metadata)
  };
}

async function getVisibleNotification(notificationId, auth) {
  const visibility = notificationVisibilityWhere(auth, "n");
  const [rows] = await pool.execute(
    `SELECT n.id, n.notification_key AS notificationKey, n.title, n.body AS message,
            n.entity_type AS entityType, n.entity_id AS entityId, n.status, n.priority,
            n.metadata, n.created_at AS createdAt, n.read_at AS readAt,
            n.recipient_user_id AS recipientUserId, n.recipient_email AS recipientEmail
       FROM notifications n
      WHERE n.id = ? AND n.channel IN ('in_app', 'system') AND n.status <> 'dismissed' AND ${visibility.sql}
      LIMIT 1`,
    [notificationId, ...visibility.params]
  );
  return rows[0] ? formatNotification(rows[0]) : null;
}

function writeEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function registerNotificationStream(auth, req, res) {
  const clientId = `${auth.user?.id || "user"}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  writeEvent(res, "ready", { ok: true });

  const heartbeat = setInterval(() => writeEvent(res, "heartbeat", { at: Date.now() }), 25000);
  clients.set(clientId, { auth, res, heartbeat });

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(clientId);
  });
}

function publishNotification(notificationId) {
  setTimeout(async () => {
    const entries = Array.from(clients.values());
    await Promise.all(entries.map(async (client) => {
      try {
        const notification = await getVisibleNotification(notificationId, client.auth);
        if (notification) writeEvent(client.res, "notification", notification);
      } catch {
        writeEvent(client.res, "error", { message: "Unable to stream notification." });
      }
    }));
  }, 750);
}

module.exports = {
  publishNotification,
  registerNotificationStream
};
