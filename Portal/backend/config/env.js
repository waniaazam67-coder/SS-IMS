const path = require("path");
const dotenv = require("dotenv");

const env = process.env.NODE_ENV || "development";
const databaseName = "ims_system";

// Load environment-specific .env file from Portal/.env
dotenv.config({ path: path.resolve(__dirname, `../../.env/.env.${env}`) });

const config = {
  env,
  port: Number(process.env.PORT || 3000),
  database: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    name: databaseName,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  },
  firebase: {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID
  }
};

module.exports = config;
