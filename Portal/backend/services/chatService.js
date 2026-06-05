const { pool } = require("../config/database");

function userPair(userId, otherUserId) {
  const current = Number(userId);
  const other = Number(otherUserId);
  if (!Number.isInteger(current) || current <= 0 || !Number.isInteger(other) || other <= 0) {
    const error = new Error("A valid user is required.");
    error.statusCode = 400;
    throw error;
  }
  if (current === other) {
    const error = new Error("You cannot chat with yourself.");
    error.statusCode = 400;
    throw error;
  }
  return [Math.min(current, other), Math.max(current, other)];
}

async function assertChatUser(userId) {
  const [rows] = await pool.execute(
    `SELECT id FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [userId]
  );
  if (!rows.length) {
    const error = new Error("Chat user was not found.");
    error.statusCode = 404;
    throw error;
  }
}

async function listChatUsers(auth) {
  const currentUserId = Number(auth.user.id);
  const [rows] = await pool.execute(
    `SELECT
        u.id,
        u.full_name AS name,
        u.email,
        u.is_active AS isActive,
        u.updated_at AS lastActiveAt,
        d.name AS department,
        GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ', ') AS roles,
        COALESCE(unread.unread_count, 0) AS unreadCount,
        latest.last_message_at AS lastMessageAt
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       LEFT JOIN (
         SELECT m.sender_id AS other_user_id, COUNT(*) AS unread_count
           FROM chat_messages m
           JOIN chat_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = ?
          WHERE m.receiver_id = ? AND m.sender_id <> ? AND m.read_at IS NULL
          GROUP BY m.sender_id
       ) unread ON unread.other_user_id = u.id
       LEFT JOIN (
         SELECT CASE WHEN c.user_one_id = ? THEN c.user_two_id ELSE c.user_one_id END AS other_user_id,
                MAX(m.created_at) AS last_message_at
           FROM chat_conversations c
           JOIN chat_messages m ON m.conversation_id = c.id
          WHERE c.user_one_id = ? OR c.user_two_id = ?
          GROUP BY other_user_id
       ) latest ON latest.other_user_id = u.id
      WHERE u.deleted_at IS NULL AND u.id <> ?
      GROUP BY u.id, u.full_name, u.email, u.is_active, u.updated_at, d.name, unread.unread_count, latest.last_message_at
      ORDER BY latest.last_message_at DESC, u.full_name ASC`,
    [currentUserId, currentUserId, currentUserId, currentUserId, currentUserId, currentUserId, currentUserId]
  );

  return rows.map(formatUser);
}

async function listConversations(auth) {
  const currentUserId = Number(auth.user.id);
  const [rows] = await pool.execute(
    `SELECT
        c.id,
        other_user.id AS otherUserId,
        other_user.full_name AS otherUserName,
        other_user.email AS otherUserEmail,
        d.name AS department,
        roles.roles,
        m.message_text AS lastMessage,
        m.created_at AS lastMessageAt,
        COALESCE(unread.unread_count, 0) AS unreadCount
       FROM chat_conversations c
       JOIN users other_user ON other_user.id = CASE WHEN c.user_one_id = ? THEN c.user_two_id ELSE c.user_one_id END
       LEFT JOIN departments d ON d.id = other_user.department_id
       LEFT JOIN (
         SELECT ur.user_id, GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ', ') AS roles
           FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
          GROUP BY ur.user_id
       ) roles ON roles.user_id = other_user.id
       LEFT JOIN chat_messages m ON m.id = c.last_message_id
       LEFT JOIN (
         SELECT conversation_id, COUNT(*) AS unread_count
           FROM chat_messages
          WHERE receiver_id = ? AND sender_id <> ? AND read_at IS NULL
          GROUP BY conversation_id
       ) unread ON unread.conversation_id = c.id
      WHERE c.user_one_id = ? OR c.user_two_id = ?
      ORDER BY COALESCE(m.created_at, c.updated_at) DESC`,
    [currentUserId, currentUserId, currentUserId, currentUserId, currentUserId]
  );

  return rows.map((row) => ({
    id: row.id,
    otherUserId: row.otherUserId,
    otherUserName: row.otherUserName,
    otherUserEmail: row.otherUserEmail,
    role: row.roles || "",
    department: row.department || "",
    lastMessage: row.lastMessage || "",
    lastMessageAt: row.lastMessageAt,
    unreadCount: Number(row.unreadCount || 0)
  }));
}

async function getMessages(auth, otherUserId) {
  const currentUserId = Number(auth.user.id);
  const [userOneId, userTwoId] = userPair(currentUserId, otherUserId);
  await assertChatUser(Number(otherUserId));
  const [rows] = await pool.execute(
    `SELECT
        m.id,
        m.conversation_id AS conversationId,
        m.sender_id AS senderId,
        m.receiver_id AS receiverId,
        m.message_text AS messageText,
        m.read_at AS readAt,
        m.created_at AS createdAt
       FROM chat_conversations c
       JOIN chat_messages m ON m.conversation_id = c.id
      WHERE c.user_one_id = ? AND c.user_two_id = ?
      ORDER BY m.created_at ASC, m.id ASC`,
    [userOneId, userTwoId]
  );
  return rows.map(formatMessage);
}

async function sendMessage(auth, input = {}) {
  const currentUserId = Number(auth.user.id);
  const receiverId = Number(input.receiverId || input.otherUserId || input.toUserId);
  const messageText = String(input.messageText || input.message || "").trim();
  if (!messageText) {
    const error = new Error("Message text is required.");
    error.statusCode = 400;
    throw error;
  }
  if (messageText.length > 2000) {
    const error = new Error("Message text is too long.");
    error.statusCode = 400;
    throw error;
  }
  const [userOneId, userTwoId] = userPair(currentUserId, receiverId);
  await assertChatUser(receiverId);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO chat_conversations (user_one_id, user_two_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
      [userOneId, userTwoId]
    );
    const [conversationRows] = await connection.execute(
      `SELECT id FROM chat_conversations WHERE user_one_id = ? AND user_two_id = ? LIMIT 1`,
      [userOneId, userTwoId]
    );
    const conversationId = conversationRows[0].id;
    await connection.execute(
      `INSERT IGNORE INTO chat_participants (conversation_id, user_id) VALUES (?, ?), (?, ?)`,
      [conversationId, currentUserId, conversationId, receiverId]
    );
    const [result] = await connection.execute(
      `INSERT INTO chat_messages (conversation_id, sender_id, receiver_id, message_text)
       VALUES (?, ?, ?, ?)`,
      [conversationId, currentUserId, receiverId, messageText]
    );
    await connection.execute(
      `UPDATE chat_conversations SET last_message_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [result.insertId, conversationId]
    );
    await connection.commit();
    const [messages] = await pool.execute(
      `SELECT id, conversation_id AS conversationId, sender_id AS senderId, receiver_id AS receiverId,
              message_text AS messageText, read_at AS readAt, created_at AS createdAt
         FROM chat_messages
        WHERE id = ?`,
      [result.insertId]
    );
    return formatMessage(messages[0]);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function markMessagesRead(auth, otherUserId) {
  const currentUserId = Number(auth.user.id);
  const senderId = Number(otherUserId);
  const [userOneId, userTwoId] = userPair(currentUserId, senderId);
  const [result] = await pool.execute(
    `UPDATE chat_messages m
       JOIN chat_conversations c ON c.id = m.conversation_id
        SET m.read_at = CURRENT_TIMESTAMP
      WHERE c.user_one_id = ? AND c.user_two_id = ?
        AND m.sender_id = ? AND m.receiver_id = ? AND m.read_at IS NULL`,
    [userOneId, userTwoId, senderId, currentUserId]
  );
  return { markedRead: result.affectedRows };
}

function formatUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.roles || "",
    department: row.department || "",
    isActive: Boolean(row.isActive),
    status: Number(row.isActive) ? "online" : "offline",
    lastActiveAt: row.lastActiveAt,
    lastMessageAt: row.lastMessageAt,
    unreadCount: Number(row.unreadCount || 0)
  };
}

function formatMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    receiverId: row.receiverId,
    messageText: row.messageText,
    readAt: row.readAt,
    createdAt: row.createdAt
  };
}

module.exports = {
  listChatUsers,
  listConversations,
  getMessages,
  sendMessage,
  markMessagesRead
};
