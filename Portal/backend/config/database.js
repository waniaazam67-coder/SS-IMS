const fs = require("fs/promises");
const path = require("path");
const mysql = require("mysql2/promise");
const config = require("./env");

const pool = mysql.createPool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  namedPlaceholders: true
});

async function initializeDatabase() {
  assertDatabaseConfig();

  const connection = await mysql.createConnection({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
    multipleStatements: false
  });

  try {
    const schemaSql = await fs.readFile(path.resolve(__dirname, "../sql/ims_system_schema.sql"), "utf8");
    const statements = splitSqlStatements(schemaSql);

    for (const statement of statements) {
      await connection.query(statement);
    }

    await seedAdminUserIfEnabled(connection);
  } finally {
    await connection.end();
  }
}

async function seedAdminUserIfEnabled(connection) {
  const shouldSeed = !config.isProduction || config.enableAdminSeed;
  const adminEmail = "wania.azam@shehersaaz.org.pk";
  if (!shouldSeed) {
    console.log("Admin seed skipped. Set ENABLE_ADMIN_SEED=true to apply it in production.");
    return;
  }

  const [existing] = await connection.execute(
    "SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1",
    [adminEmail]
  );

  await connection.execute(
    `INSERT INTO users (full_name, email, is_line_manager, is_active)
     VALUES ('Wania Azam', ?, 1, 1)
     ON DUPLICATE KEY UPDATE
       full_name = VALUES(full_name),
       is_line_manager = VALUES(is_line_manager),
       is_active = VALUES(is_active),
       deleted_at = NULL`,
    [adminEmail]
  );

  await connection.execute(
    `INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by)
     SELECT u.id, r.id, 1
       FROM users u
       JOIN roles r ON r.name = 'Admin'
      WHERE LOWER(u.email) = ?`,
    [adminEmail]
  );

  console.log(existing.length ? `Admin seed verified for ${adminEmail}.` : `Admin seed created ${adminEmail}.`);
}

async function testDatabaseConnection() {
  assertDatabaseConfig();

  const connection = await pool.getConnection();
  try {
    await connection.ping();
    console.log(`Connected to database: ${config.database.name}`);
  } finally {
    connection.release();
  }
}

function assertDatabaseConfig() {
  if (!config.database.name) {
    const error = new Error("Missing database name. Set DB_NAME in your environment file.");
    error.statusCode = 500;
    throw error;
  }
}

function splitSqlStatements(sql) {
  const statements = [];
  const lines = sql.replace(/^\uFEFF/, "").split(/\r?\n/);
  let delimiter = ";";
  let buffer = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^DELIMITER\s+/i.test(trimmed)) {
      flushStatement();
      delimiter = trimmed.replace(/^DELIMITER\s+/i, "");
      continue;
    }

    buffer.push(line);

    if (trimmed.endsWith(delimiter)) {
      flushStatement();
    }
  }

  flushStatement();
  return statements;

  function flushStatement() {
    const statement = buffer.join("\n").trim();
    buffer = [];

    if (!statement) return;
    if (/^USE\s+/i.test(statement)) return;

    const withoutDelimiter = statement.endsWith(delimiter)
      ? statement.slice(0, -delimiter.length).trim()
      : statement;

    if (withoutDelimiter) statements.push(withoutDelimiter);
  }
}

module.exports = {
  pool,
  initializeDatabase,
  testDatabaseConnection
};
