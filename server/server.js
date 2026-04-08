/**
 * ============================================================================
 * LILYCREST DORMITORY MANAGEMENT SYSTEM - SERVER
 * ============================================================================
 *
 * Production-grade Express.js server with:
 * - Security headers
 * - Rate limiting
 * - Request ID tracing
 * - Structured logging
 * - Compression
 * - Standardized error handling
 * - Deep health checks
 * - Graceful shutdown
 *
 * ============================================================================
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import compression from "compression";
import mongoose from "mongoose";

import connectDB from "./config/database.js";
import validateStartupConfig from "./config/startupValidation.js";
import requestId from "./middleware/requestId.js";
import { requestLogger } from "./middleware/logger.js";
import logger from "./middleware/logger.js";
import {
  globalLimiter,
  authLimiter,
  publicLimiter,
} from "./middleware/rateLimiter.js";
import { globalErrorHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/usersRoutes.js";
import roomRoutes from "./routes/roomsRoutes.js";
import reservationRoutes from "./routes/reservationsRoutes.js";
import inquiryRoutes from "./routes/inquiriesRoutes.js";
import auditRoutes from "./routes/auditRoutes.js";
import billingRoutes from "./routes/billingRoutes.js";
import announcementRoutes from "./routes/announcementRoutes.js";
import maintenanceRoutes from "./routes/maintenanceRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import digitalTwinRoutes from "./routes/digitalTwinRoutes.js";
import utilityBillingRoutes from "./routes/utilityBillingRoutes.js";
import financialRoutes from "./routes/financialRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import { startScheduler, stopScheduler } from "./utils/scheduler.js";
import { initSocket } from "./utils/socket.js";
import { backfillBranchAdminPermissions } from "./utils/backfillAdminPermissions.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
let server = null;

app.use(requestId);

const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  process.env.FRONTEND_URL ||
  "http://localhost:3000,http://localhost:3001"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.options("*", (req, res) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type,Authorization,X-Request-Id",
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.sendStatus(204);
});

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    exposedHeaders: ["X-Request-Id"],
  }),
);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: [
          "'self'",
          "https://identitytoolkit.googleapis.com",
          "https://securetoken.googleapis.com",
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

app.use("/api/webhooks", webhookRoutes);
app.use(globalLimiter);
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(requestLogger);

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/reservations", reservationRoutes);
app.use("/api/inquiries", publicLimiter, inquiryRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/maintenance", maintenanceRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/digital-twin", digitalTwinRoutes);
app.use("/api/utilities", utilityBillingRoutes);
app.use("/api/financial", financialRoutes);
app.use("/api/settings", settingsRoutes);

app.get("/api/health", async (req, res) => {
  const checks = {};
  let healthy = true;

  try {
    const state = mongoose.connection.readyState;
    if (state === 1) {
      const start = Date.now();
      await mongoose.connection.db.admin().ping();
      checks.mongodb = { status: "ok", latency: `${Date.now() - start}ms` };
    } else {
      checks.mongodb = { status: "degraded", state };
      healthy = false;
    }
  } catch (err) {
    checks.mongodb = { status: "error", error: err.message };
    healthy = false;
  }

  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  checks.memory = {
    status: heapUsedMB < 512 ? "ok" : "warning",
    heapUsed: `${heapUsedMB}MB`,
    heapTotal: `${heapTotalMB}MB`,
  };

  checks.uptime = `${Math.round(process.uptime())}s`;

  res.status(healthy ? 200 : 503).json({
    success: true,
    data: {
      status: healthy ? "healthy" : "degraded",
      checks,
      environment: process.env.NODE_ENV || "development",
    },
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

app.use(globalErrorHandler);

const gracefulShutdown = (signal) => {
  logger.info({ signal }, "Shutting down gracefully");

  const finalizeShutdown = () => {
    stopScheduler();
    mongoose.connection.close(false).then(() => {
      logger.info("MongoDB connection closed");
      process.exit(0);
    });
  };

  if (!server) {
    finalizeShutdown();
    return;
  }

  server.close(() => {
    logger.info("HTTP server closed");
    finalizeShutdown();
  });

  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught Exception");
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "Unhandled Rejection");
  gracefulShutdown("unhandledRejection");
});

const bootstrap = async () => {
  validateStartupConfig();

  const mongoConnected = await connectDB();
  if (mongoConnected) {
    await backfillBranchAdminPermissions();
  } else {
    logger.warn(
      "Skipping branch-admin permission backfill because MongoDB is unavailable",
    );
  }

  server = app.listen(PORT, () => {
    logger.info(
      {
        port: PORT,
        env: process.env.NODE_ENV || "development",
        node: process.version,
      },
      "LILYCREST DORMITORY MANAGEMENT SYSTEM started",
    );
    logger.info(`API available at http://localhost:${PORT}/api`);
    logger.info(`Health check: http://localhost:${PORT}/api/health`);

    initSocket(server, allowedOrigins);
    startScheduler();
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      logger.fatal({ port: PORT }, "Port already in use");
      process.exit(1);
    }

    logger.fatal({ err: error }, "Server error");
    process.exit(1);
  });
};

bootstrap().catch((error) => {
  logger.fatal({ err: error }, "Server bootstrap failed");
  process.exit(1);
});
