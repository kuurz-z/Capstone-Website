/**
 * ============================================================================
 * LILYCREST DORMITORY MANAGEMENT SYSTEM — SERVER
 * ============================================================================
 *
 * Production-grade Express.js server with:
 * - Security headers (Helmet)
 * - Rate limiting (tiered)
 * - Request ID tracing
 * - Structured JSON logging (Pino)
 * - Response compression (gzip/brotli)
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

// --- Config ---
import connectDB from "./config/database.js";

// --- Middleware ---
import requestId from "./middleware/requestId.js";
import { requestLogger } from "./middleware/logger.js";
import logger from "./middleware/logger.js";
import {
  globalLimiter,
  authLimiter,
  publicLimiter,
} from "./middleware/rateLimiter.js";
import { globalErrorHandler } from "./middleware/errorHandler.js";

// --- Routes ---
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/usersRoutes.js";
import roomRoutes from "./routes/roomsRoutes.js";
import reservationRoutes from "./routes/reservationsRoutes.js";
import inquiryRoutes from "./routes/inquiriesRoutes.js";
import auditRoutes from "./routes/auditRoutes.js";
import billingRoutes from "./routes/billingRoutes.js";
import announcementRoutes from "./routes/announcementRoutes.js";
import maintenanceRoutes from "./routes/maintenanceRoutes.js";

// Load environment variables from .env file
dotenv.config();

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

connectDB();

// ============================================================================
// EXPRESS APP INITIALIZATION
// ============================================================================

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================================
// SECURITY MIDDLEWARE (applied first)
// ============================================================================

/**
 * Request ID — trace every request through the system
 */
app.use(requestId);

/**
 * Allowed origins for CORS
 */
const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  process.env.FRONTEND_URL ||
  "http://localhost:3000,http://localhost:3001"
)
  .split(",")
  .map((o) => o.trim());

/**
 * Handle OPTIONS preflight explicitly (before any other middleware can block it)
 */
app.options("*", (req, res) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
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

/**
 * CORS — allow requests from the React frontend(s)
 */
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    exposedHeaders: ["X-Request-Id"],
  }),
);

/**
 * Helmet — sets secure HTTP headers:
 * - Content-Security-Policy, X-Content-Type-Options, X-Frame-Options
 * - Strict-Transport-Security, X-XSS-Protection, etc.
 */
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

/**
 * Global rate limit — 100 requests per 15 min per IP
 */
app.use(globalLimiter);

/**
 * Response compression — gzip/brotli for all responses
 */
app.use(compression());

/**
 * Body Parser — JSON and URL-encoded with per-route appropriate limits
 */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/**
 * Structured request logging — every request/response logged with context
 */
app.use(requestLogger);

// ============================================================================
// API ROUTES
// ============================================================================

/**
 * Authentication Routes (/api/auth/*)
 * Extra-strict rate limiting on login/register to prevent brute-force.
 */
app.use("/api/auth", authLimiter, authRoutes);

/**
 * User, Room, Reservation, Audit, Billing, Announcement, Maintenance Routes
 * Protected by global rate limit + per-route auth middleware.
 */
app.use("/api/users", userRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/reservations", reservationRoutes);
app.use("/api/inquiries", publicLimiter, inquiryRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/maintenance", maintenanceRoutes);

// ============================================================================
// DEEP HEALTH CHECK
// ============================================================================

/**
 * GET /api/health
 * Deep health check — verifies:
 * 1. Server is responsive
 * 2. MongoDB is connected and responsive
 * 3. Memory usage is within bounds
 */
app.get("/api/health", async (req, res) => {
  const checks = {};
  let healthy = true;

  // 1. MongoDB health
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

  // 2. Memory health
  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  checks.memory = {
    status: heapUsedMB < 512 ? "ok" : "warning",
    heapUsed: `${heapUsedMB}MB`,
    heapTotal: `${heapTotalMB}MB`,
  };

  // 3. Uptime
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

// ============================================================================
// GLOBAL ERROR HANDLER (must be AFTER all routes)
// ============================================================================

app.use(globalErrorHandler);

// ============================================================================
// SERVER STARTUP
// ============================================================================

const server = app.listen(PORT, () => {
  logger.info(
    {
      port: PORT,
      env: process.env.NODE_ENV || "development",
      node: process.version,
    },
    "🚀 LILYCREST DORMITORY MANAGEMENT SYSTEM started",
  );
  logger.info(`📡 API available at http://localhost:${PORT}/api`);
  logger.info(`🏥 Health check: http://localhost:${PORT}/api/health`);
});

/**
 * Handle server errors (e.g., port already in use)
 */
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    logger.fatal({ port: PORT }, "Port already in use");
    process.exit(1);
  } else {
    logger.fatal({ err: error }, "Server error");
    process.exit(1);
  }
});

/**
 * Graceful shutdown handling
 */
const gracefulShutdown = (signal) => {
  logger.info({ signal }, "Shutting down gracefully...");

  server.close(() => {
    logger.info("HTTP server closed");

    // Close MongoDB connection
    mongoose.connection.close(false).then(() => {
      logger.info("MongoDB connection closed");
      process.exit(0);
    });
  });

  // Force shutdown after 10 seconds
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

process.on("unhandledRejection", (reason, promise) => {
  logger.fatal({ reason }, "Unhandled Rejection");
  gracefulShutdown("unhandledRejection");
});
