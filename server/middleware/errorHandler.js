/**
 * ============================================================================
 * STANDARDIZED ERROR HANDLER & RESPONSE HELPERS
 * ============================================================================
 *
 * Provides a consistent API response envelope across all endpoints.
 *
 * Success: { success: true, data: {...}, meta: { requestId, timestamp } }
 * Error:   { success: false, error: { code, message, details? }, meta: {...} }
 *
 * ============================================================================
 */

import logger from "./logger.js";

// ============================================================================
// CUSTOM ERROR CLASS
// ============================================================================

/**
 * Application-level error with HTTP status code and machine-readable code.
 * Throw this in controllers for automatic formatting.
 *
 * @example throw new AppError("Room not found", 404, "ROOM_NOT_FOUND");
 */
export class AppError extends Error {
  constructor(
    message,
    statusCode = 500,
    code = "INTERNAL_ERROR",
    details = null,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

/**
 * Send a standardized success response.
 *
 * @param {Response} res - Express response
 * @param {Object} data - Response payload
 * @param {number} statusCode - HTTP status (default 200)
 * @param {Object} meta - Additional metadata (pagination, etc.)
 */
export const sendSuccess = (res, data, statusCode = 200, meta = {}) => {
  const req = res.req;
  res.status(statusCode).json({
    success: true,
    data,
    meta: {
      requestId: req?.id,
      timestamp: new Date().toISOString(),
      ...meta,
    },
  });
};

/**
 * Send a standardized error response.
 *
 * @param {Response} res - Express response
 * @param {string} message - Human-readable error
 * @param {number} statusCode - HTTP status (default 500)
 * @param {string} code - Machine-readable error code
 * @param {*} details - Validation errors or extra info
 */
export const sendError = (
  res,
  message,
  statusCode = 500,
  code = "INTERNAL_ERROR",
  details = null,
) => {
  const req = res.req;
  const body = {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
    meta: {
      requestId: req?.id,
      timestamp: new Date().toISOString(),
    },
  };

  res.status(statusCode).json(body);
};

// ============================================================================
// GLOBAL ERROR HANDLER MIDDLEWARE
// ============================================================================

/**
 * Express error-handling middleware (must have 4 params).
 * Catches all unhandled errors and formats them consistently.
 */
export const globalErrorHandler = (err, req, res, _next) => {
  // Log the error
  const logContext = {
    requestId: req.id,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
  };

  if (err.isOperational) {
    // Known, expected errors (AppError)
    logger.warn({ ...logContext, err }, err.message);
  } else {
    // Unknown, unexpected errors
    logger.error({ ...logContext, err }, "Unhandled error");
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return sendError(
      res,
      "Validation failed",
      400,
      "VALIDATION_ERROR",
      details,
    );
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return sendError(
      res,
      `Duplicate value for field: ${field}`,
      409,
      "DUPLICATE_KEY",
      { field, value: err.keyValue[field] },
    );
  }

  // Mongoose cast error (invalid ObjectId, etc.)
  if (err.name === "CastError") {
    return sendError(
      res,
      `Invalid ${err.path}: ${err.value}`,
      400,
      "INVALID_ID",
    );
  }

  // AppError (our custom errors)
  if (err.isOperational) {
    return sendError(res, err.message, err.statusCode, err.code, err.details);
  }

  // Unknown errors — hide details in production
  const isDev = process.env.NODE_ENV === "development";
  sendError(
    res,
    isDev ? err.message : "Something went wrong",
    err.statusCode || 500,
    "INTERNAL_ERROR",
    isDev ? err.stack : undefined,
  );
};

// ============================================================================
// PAGINATION HELPER
// ============================================================================

/**
 * Parse pagination params from query string and return
 * a standardized pagination meta object.
 *
 * @param {Object} query - req.query
 * @param {number} totalCount - Total documents matching filter
 * @returns {{ page, limit, skip, meta }}
 */
export const parsePagination = (query, totalCount) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
    meta: {
      page,
      limit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit),
      hasNext: page * limit < totalCount,
      hasPrev: page > 1,
    },
  };
};
