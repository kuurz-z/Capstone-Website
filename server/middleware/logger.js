/**
 * ============================================================================
 * STRUCTURED LOGGER
 * ============================================================================
 *
 * Pino-based structured JSON logger with request context.
 * Replaces console.log throughout the application.
 *
 * Usage:
 *   import logger from "../middleware/logger.js";
 *   logger.info({ userId, action }, "User logged in");
 *   logger.error({ err, requestId }, "Database query failed");
 *
 * ============================================================================
 */

import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  // In production, output raw JSON for log aggregation
  ...(isDev
    ? {}
    : {
        formatters: {
          level: (label) => ({ level: label }),
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      }),
});

/**
 * Express middleware that logs every request/response.
 * Attaches child logger to req.log for contextual logging.
 */
export const requestLogger = (req, res, next) => {
  const start = Date.now();

  // Create a child logger with request context
  req.log = logger.child({
    requestId: req.id,
    method: req.method,
    url: req.originalUrl,
  });

  // Log when response finishes
  res.on("finish", () => {
    const duration = Date.now() - start;
    const logData = {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    };

    if (res.statusCode >= 500) {
      req.log.error(logData, "Request failed");
    } else if (res.statusCode >= 400) {
      req.log.warn(logData, "Client error");
    } else {
      req.log.info(logData, "Request completed");
    }
  });

  next();
};

export default logger;
