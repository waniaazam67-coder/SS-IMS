const path = require("path");
const dotenv = require("dotenv");

const env = process.env.NODE_ENV || "development";

// Load environment-specific .env file from Portal/.env, then fall back to .env.
const envDir = path.resolve(__dirname, "../../.env");
dotenv.config({ path: path.join(envDir, `.env.${env}`) });
dotenv.config({ path: path.join(envDir, ".env") });

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function isDefined(value) {
  return value !== undefined && value !== null;
}

const firebaseWebConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

if (hasValue(process.env.FIREBASE_MEASUREMENT_ID)) {
  firebaseWebConfig.measurementId = process.env.FIREBASE_MEASUREMENT_ID;
}
if (hasValue(process.env.FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY)) {
  firebaseWebConfig.appCheckRecaptchaSiteKey = process.env.FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY;
}

const config = {
  env,
  isProduction: env === "production",
  port: Number(process.env.PORT || 3000),
  database: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    name: process.env.DB_NAME || "ims_system",
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  },
  firebase: {
    web: firebaseWebConfig,
    admin: {
      projectId: process.env.FIREBASE_PROJECT_ID,
      serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    }
  },
  corsOrigins: normalizeOrigins(process.env.CORS_ORIGIN),
  enableAdminSeed: String(process.env.ENABLE_ADMIN_SEED || "").trim().toLowerCase() === "true"
};

function normalizeOrigins(value) {
  return String(value || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function validateEnvironmentConfig() {
  const missing = [];
  const requiredWithValue = [
    "NODE_ENV",
    "DB_HOST",
    "DB_NAME",
    "DB_USER",
    "FIREBASE_API_KEY",
    "FIREBASE_AUTH_DOMAIN",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_STORAGE_BUCKET",
    "FIREBASE_MESSAGING_SENDER_ID",
    "FIREBASE_APP_ID",
    "FIREBASE_SERVICE_ACCOUNT_PATH",
    "CORS_ORIGIN"
  ];
  const requiredDefinedOnly = ["DB_PASSWORD"];

  requiredWithValue.forEach((key) => {
    if (!hasValue(process.env[key])) missing.push(key);
  });
  requiredDefinedOnly.forEach((key) => {
    if (!isDefined(process.env[key])) missing.push(key);
  });

  const errors = [];
  if (missing.length) {
    errors.push(`Missing required environment variables: ${missing.join(", ")}`);
  }

  if (env === "production" && !config.corsOrigins.length) {
    errors.push("CORS_ORIGIN must be set to one or more explicit origins in production.");
  }

  if (config.corsOrigins.some((origin) => origin === "*")) {
    errors.push("CORS_ORIGIN must not contain '*'. Use explicit origins such as https://ims.example.com.");
  }

  if (errors.length) {
    const error = new Error(errors.join("\n"));
    error.code = "ENV_VALIDATION_FAILED";
    throw error;
  }
}

module.exports = {
  ...config,
  validateEnvironmentConfig
};
