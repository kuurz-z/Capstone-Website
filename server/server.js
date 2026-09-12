import { mobileStayExtensionRoutes, adminStayExtensionRoutes } from './routes/stayExtensionRoutes.js';
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
import "./utils/dateUtils.js";
process.env.TZ = process.env.APP_TIMEZONE || "Asia/Manila";
import compression from "compression";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

import securityHeaders from "./middleware/securityHeaders.js";

import connectDB from "./config/database.js";
import { createCorsOriginPolicy } from "./config/corsPolicy.js";
import validateStartupConfig from "./config/startupValidation.js";
import { logDocumentPrecheckStartupStatus } from "./services/reservationDocumentPrecheckService.js";
import { logContractPdfRendererStartupStatus } from "./services/contractChromiumService.js";
import requestId from "./middleware/requestId.js";
import { requestLogger } from "./middleware/logger.js";
import logger from "./middleware/logger.js";
import {
  globalLimiter,
  authLimiter,
  publicLimiter,
} from "./middleware/rateLimiter.js";
import { globalErrorHandler } from "./middleware/errorHandler.js";
import mongoSanitize from "./middleware/mongoSanitize.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/usersRoutes.js";
import tenantRoutes from "./routes/tenantRoutes.js";
import tenantTransferRequestRoutes from "./routes/tenantTransferRequestRoutes.js";
import roomRoutes from "./routes/roomsRoutes.js";
import reservationRoutes from "./routes/reservationsRoutes.js";
import inquiryRoutes from "./routes/inquiriesRoutes.js";
import auditRoutes from "./routes/auditRoutes.js";
import billingRoutes from "./routes/billingRoutes.js";
import moveOutClearanceRoutes from "./routes/moveOutClearanceRoutes.js";
import announcementRoutes from "./routes/announcementRoutes.js";
import maintenanceRoutes from "./routes/maintenanceContractRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import attachmentRoutes from "./routes/attachmentRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import utilityBillingRoutes from "./routes/utilityBillingRoutes.js";
import financialRoutes from "./routes/financialRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import applianceRoutes from "./routes/applianceRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import branchSummaryRoutes from "./routes/branchSummaryRoutes.js";
import backupRoutes from "./routes/backupRoutes.js";
import serviceProviderRoutes from "./routes/serviceProviderRoutes.js";
import contractRoutes from "./routes/contractRoutes.js";
import mobileContractRoutes from "./routes/mobileContractRoutes.js";
import mobileBillingRoutes from "./routes/mobileBillingRoutes.js";
import mobilePaymongoRoutes from "./routes/mobilePaymongoRoutes.js";
import mobileDocumentRoutes from "./routes/mobileDocumentRoutes.js";
import mobileAuthRoutes from "./routes/mobileAuthRoutes.js";
import mobileNotificationRoutes from "./routes/mobileNotificationRoutes.js";
import mobileUploadRoutes from "./routes/mobileUploadRoutes.js";
import mobileChatRoutes from "./routes/mobileChatRoutes.js";
import mobileTenantTransferRequestRoutes from "./routes/mobileTenantTransferRequestRoutes.js";
import mobileMaintenanceRoutes from "./routes/mobileMaintenanceRoutes.js";
import chatbotRoutes from "./routes/chatbotRoutes.js";
import searchRoutes from "./routes/adminSearchRoutes.js";
import { initSocket } from "./utils/socket.js";
import mobileRoutes from "./mobile/mobileRoutes.mjs";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let server = null;
let stopBackgroundJobs = () => {};

const resolveTrustProxy = () => {
  const configured = String(process.env.TRUST_PROXY || "").trim().toLowerCase();
  if (!configured) {
    return process.env.NODE_ENV === "production" ? 1 : false;
  }

  if (configured === "true") return true;
  if (configured === "false") return false;

  const asNumber = Number(configured);
  return Number.isNaN(asNumber) ? configured : asNumber;
};

app.set("trust proxy", resolveTrustProxy());
app.use(requestId);

const { allowedOriginRules, isOriginAllowed } = createCorsOriginPolicy();

const isTruthyEnv = (value, fallback = false) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }

  return !["0", "false", "no", "off"].includes(
    String(value).trim().toLowerCase(),
  );
};

const shouldStartScheduler = () => isTruthyEnv(process.env.ENABLE_SCHEDULER, true);

const setUploadStaticHeaders = (res) => {
  // Uploaded files are intentionally consumed by the frontend on a separate
  // origin/subdomain, so override Helmet's default same-origin resource policy
  // only for this public static file surface.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  if (!res.getHeader("Access-Control-Allow-Origin")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
};

const uploadStaticHeaders = (_req, res, next) => {
  setUploadStaticHeaders(res);
  next();
};

const runPermissionBackfill = async () => {
  try {
    const { backfillBranchAdminPermissions } = await import(
      "./utils/backfillAdminPermissions.js"
    );
    const updatedCount = await backfillBranchAdminPermissions();

    if (updatedCount > 0) {
      logger.info(
        { count: updatedCount },
        "Startup permission backfill completed",
      );
    }
  } catch (error) {
    logger.error({ err: error }, "Startup permission backfill failed");
  }
};

const runSchedulerStartup = async () => {
  if (!shouldStartScheduler()) {
    logger.info("Scheduler startup skipped because ENABLE_SCHEDULER is disabled");
    return;
  }

  try {
    const { startScheduler, stopScheduler } = await import("./utils/scheduler.js");
    stopBackgroundJobs = stopScheduler;
    startScheduler({
      runWarmup: isTruthyEnv(process.env.RUN_SCHEDULER_WARMUP, false),
    });
    logger.info("Scheduler started");
  } catch (error) {
    logger.error({ err: error }, "Scheduler startup failed");
  }
};

const runBackupSchedulerStartup = async () => {
  try {
    const { checkAndRunAutoBackup } = await import("./controllers/backupController.js");
    const cron = await import("node-cron");
    // Check every hour if an auto-backup is due
    cron.default.schedule("0 * * * *", () => {
      checkAndRunAutoBackup().catch((err) =>
        logger.error({ err }, "Auto-backup scheduler tick failed"),
      );
    });
    logger.info("Backup scheduler started (hourly check)");
  } catch (error) {
    logger.error({ err: error }, "Backup scheduler startup failed");
  }
};

const runCancellationMoveInSelfHealStartup = async () => {
  try {
    const { healDanglingMovedInCancellations } = await import(
      "./services/cancellationMoveInSelfHealService.js"
    );
    const result = await healDanglingMovedInCancellations();

    if (result?.healedCount > 0) {
      logger.info(
        { count: result.healedCount },
        "Startup cancellation move-in self-heal completed",
      );
    }
  } catch (error) {
    logger.error({ err: error }, "Startup cancellation move-in self-heal failed");
  }
};

// Heap cap from --max-old-space-size (384 MB). Warn at 78% (~300 MB) so
// there is time to investigate before an OOM crash terminates the process.
const HEAP_CAP_MB = Number(process.env.HEAP_CAP_MB ?? 384);
const HEAP_WARN_THRESHOLD = Math.round(HEAP_CAP_MB * 0.78);
const HEAP_CRIT_THRESHOLD = Math.round(HEAP_CAP_MB * 0.92);

const startMemoryMonitor = () => {
  setInterval(() => {
    const { heapUsed, heapTotal, rss, external } = process.memoryUsage();
    const usedMB = Math.round(heapUsed / 1024 / 1024);
    const totalMB = Math.round(heapTotal / 1024 / 1024);
    const rssMB = Math.round(rss / 1024 / 1024);
    const extMB = Math.round(external / 1024 / 1024);

    if (usedMB >= HEAP_CRIT_THRESHOLD) {
      logger.error(
        { heapUsedMB: usedMB, heapTotalMB: totalMB, rssMB, externalMB: extMB, capMB: HEAP_CAP_MB },
        "CRITICAL: Heap usage near OOM limit — consider restarting or scaling",
      );
    } else if (usedMB >= HEAP_WARN_THRESHOLD) {
      logger.warn(
        { heapUsedMB: usedMB, heapTotalMB: totalMB, rssMB, externalMB: extMB, capMB: HEAP_CAP_MB },
        "Memory warning: heap usage approaching limit",
      );
    }
  }, 30_000); // check every 30 seconds
};

const startBackgroundServices = (mongoConnected) => {
  if (!mongoConnected) {
    logger.warn(
      "Skipping background startup tasks because MongoDB is unavailable",
    );
    return;
  }

  startMemoryMonitor();

  setImmediate(() => {
    void Promise.allSettled([
      runPermissionBackfill(),
      runSchedulerStartup(),
      runBackupSchedulerStartup(),
      runCancellationMoveInSelfHealStartup(),
      import("./utils/roomIndexMaintenance.js").then((m) => m.ensureRoomIndexes()),
    ]);
  });
};

app.options("*", (req, res) => {
  const { origin } = req.headers;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type,Authorization,X-Request-Id,X-Device-Id,X-Session-Id,X-Email-Verification-CSRF",
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.sendStatus(204);
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    exposedHeaders: ["X-Request-Id"],
  }),
);

app.use(securityHeaders);

app.use("/api/paymongo", webhookRoutes);  // payment.paid, payment.failed, source.chargeable
app.use("/api/webhooks", webhookRoutes);  // checkout_session.payment.paid
app.use(globalLimiter);
app.use(compression());
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));
app.use(mongoSanitize);
app.use(
  "/uploads",
  uploadStaticHeaders,
  express.static(path.join(__dirname, "uploads"), {
    maxAge: "1d",
    fallthrough: true,
    setHeaders: setUploadStaticHeaders,
  }),
);
app.use(requestLogger);

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/tenant", tenantTransferRequestRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/reservations", reservationRoutes);
app.use("/api/contracts", contractRoutes);
app.use("/api/inquiries", publicLimiter, inquiryRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/move-out-clearances", moveOutClearanceRoutes);
app.use("/api/announcements", announcementRoutes);
// Mobile app routes use session_token auth. Mount them before the maintenance
// contract so tenant mobile /api/m/maintenance/* requests are not intercepted
// by the web Firebase-token middleware. Web/admin maintenance routes still
// fall through to the contract router below.
app.use("/api/m", mobileContractRoutes);
// Billing/PayMongo bridge to canonical Bill data — must be mounted before
// mobileRoutes (the vendored mobile backend copy) so /api/m/billing/* and
// /api/m/paymongo/checkout* are answered from the authoritative Bill model
// instead of the vendored legacy-collection billing controller.
app.use("/api/m", mobileBillingRoutes);
app.use("/api/m", mobilePaymongoRoutes);
// Document bridge to canonical/shared document storage — must be mounted
// before mobileRoutes (the vendored mobile backend copy) so
// /api/m/documents/* and /api/m/users/documents/* are answered from real
// content and the shared uploaded_documents store instead of the vendored
// fabricated-PDF controller and inline-base64-only document store.
app.use("/api/m", mobileDocumentRoutes);
// Session-teardown bridge — must be mounted before mobileRoutes (the
// vendored mobile backend copy, which never defined this path) so
// It also owns reset status and, critically, the Forgot Password alias that
// dispatches to the website's Firebase action-code controller. Login,
// password change, and temporary legacy-token completion fall through.
app.use("/api/m", mobileAuthRoutes);
// Notification + Firebase-storage-upload bridges — Phase 4 cutover audit
// found neither path was defined anywhere under /api/m (bridge or vendored),
// so both 404'd against this backend despite being ACTIVE mobile features.
// Must be mounted before mobileRoutes for the same reason as every bridge
// above.
app.use("/api/m", mobileNotificationRoutes);
app.use("/api/m", mobileUploadRoutes);
// Mobile chat is a transport-only adapter over controllers/chatController.js.
// Keep it before the vendored router so the raw-Mongo chat copy can no longer
// become a second lifecycle/authorization/notification authority.
app.use("/api/m", mobileChatRoutes);
app.use("/api/m", mobileTenantTransferRequestRoutes);
app.use("/api/m", mobileStayExtensionRoutes);
app.use("/api/tenant", adminStayExtensionRoutes);
app.use("/api/m", mobileMaintenanceRoutes);
app.use("/api/m", mobileRoutes);
app.use("/api/m/maintenance", maintenanceRoutes);
app.use("/api/maintenance", maintenanceRoutes);
app.use("/api/service-providers", serviceProviderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/attachments", attachmentRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/chatbot", chatbotRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/utilities", utilityBillingRoutes);
app.use("/api/financial", financialRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/appliances", applianceRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/branches", branchSummaryRoutes);
app.use("/api/backups", backupRoutes);

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
    status: heapUsedMB < HEAP_WARN_THRESHOLD ? "ok" : heapUsedMB < HEAP_CRIT_THRESHOLD ? "warning" : "critical",
    heapUsed: `${heapUsedMB}MB`,
    heapTotal: `${heapTotalMB}MB`,
    capMB: HEAP_CAP_MB,
    thresholdWarnMB: HEAP_WARN_THRESHOLD,
  };

  checks.uptime = `${Math.round(process.uptime())}s`;

  res.status(healthy ? 200 : 503).json({
    success: true,
    data: {
      status: healthy ? "healthy" : "degraded",
      checks,
      environment: process.env.NODE_ENV || "development",
      commit: process.env.RENDER_GIT_COMMIT || null,
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
    stopBackgroundJobs();
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
  logDocumentPrecheckStartupStatus();
  await logContractPdfRendererStartupStatus(logger);

  const mongoConnected = await connectDB();

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

    initSocket(server, {
      allowedOrigins: allowedOriginRules,
      isOriginAllowed,
    });
    startBackgroundServices(mongoConnected);
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
