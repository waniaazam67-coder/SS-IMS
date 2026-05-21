const fs = require("fs/promises");
const path = require("path");
const mysql = require("mysql2/promise");
const config = require("./env");

const requiredDatabaseVars = ["DB_HOST", "DB_NAME", "DB_USER"];
const missingDatabaseVars = requiredDatabaseVars.filter((key) => !process.env[key]);

if (missingDatabaseVars.length) {
  console.warn(`Missing database environment variables: ${missingDatabaseVars.join(", ")}`);
}

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
  } finally {
    await connection.end();
  }
}

async function testDatabaseConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

function assertDatabaseConfig() {
  if (missingDatabaseVars.length) {
    const error = new Error(`Missing database environment variables: ${missingDatabaseVars.join(", ")}`);
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
