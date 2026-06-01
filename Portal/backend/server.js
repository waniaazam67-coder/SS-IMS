const path = require("path");
const express = require("express");
const settingsRoutes = require("./routes/settingsRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const imsRoutes = require("./routes/imsRoutes");
const authRoutes = require("./routes/authRoutes");
const { errorHandler, notFoundHandler } = require("./middleware/errorMiddleware");
const { corsMiddleware } = require("./middleware/corsMiddleware");
const config = require("./config/env");
const { initializeDatabase, testDatabaseConnection } = require("./config/database");

const app = express();
const PORT = config.port;
const frontendPath = path.resolve(__dirname, "../frontend");
const requisitionFormPath = path.resolve(__dirname, "../../Requisition-From");

app.use(corsMiddleware);
app.use(express.json({ limit: "1mb" }));
app.use(express.static(frontendPath, {
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-store");
    }
  }
}));
app.get("/requisition-form", (req, res, next) => {
  return res.sendFile(path.join(requisitionFormPath, "Form.html"), next);
});

app.get("/requisition-form/", (req, res, next) => {
  return res.sendFile(path.join(requisitionFormPath, "Form.html"), next);
});
app.use("/requisition-form", express.static(requisitionFormPath, {
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-store");
    }
  }
}));

app.get("/api/health", async (req, res, next) => {
  try {
    await testDatabaseConnection();
    res.json({ success: true, data: { status: "ok" } });
  } catch (error) {
    next(error);
  }
});

app.get("/api/firebase-config", (req, res) => {
  res.json({ success: true, firebase: config.firebase });
});

app.use("/api", imsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/inventory", inventoryRoutes);

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return notFoundHandler(req, res);
  return res.sendFile(path.join(frontendPath, "index.html"), next);
});

app.use(errorHandler);

async function startServer() {
  try {
    await initializeDatabase();
    await testDatabaseConnection();
    app.listen(PORT, () => {
      console.log(`IMS server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to initialize IMS database connection.");
    console.error(error.message);
    process.exit(1);
  }
}

startServer();
