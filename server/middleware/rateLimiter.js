/**
 * ============================================================================
 * RATE LIMITING MIDDLEWARE
 * ============================================================================
 *
 * Tiered rate limiting to protect against abuse and DDoS.
 *
 * Tiers:
 * - globalLimiter:   1000 req / 15min per IP (general)
 * - authLimiter:     50 req / 15min per IP   (login, register)
 * - publicLimiter:   60 req / 15min per IP   (inquiry form, public routes)
 * - apiLimiter:      500 req / 15min per IP  (authenticated API)
 *
 * NOTE: In development, localhost requests skip rate limiting entirely
 * so that admin pages with multiple API calls + auto-refresh don't
 * trigger 429 errors.
 *
 * ============================================================================
 */

import rateLimit from "express-rate-limit";

const isDev = process.env.NODE_ENV !== "production";

// --- Standard error response shape ---
const rateLimitResponse = (req, res) => {
  res.status(429).json({
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please try again later.",
    },
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
};

/**
 * In development, skip rate limiting for localhost requests.
 * Admin pages fire many API calls (dashboard=5+, auto-refresh every 30-60s,
 * auth profile check on every navigation) which easily exceed tight limits.
 */
const skipInDev = (req) => {
  if (!isDev) return false;
  const ip = req.ip || req.connection?.remoteAddress || "";
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip === "localhost"
  );
};

/**
 * Global limiter — applied to all routes as a safety net.
 * 1000 requests per 15-minute window per IP.
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
  skip: (req) => req.path === "/api/health" || skipInDev(req),
});

/**
 * Auth limiter — strict limits on login / register / password reset.
 * 50 requests per 15-minute window per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
  skip: skipInDev,
  message: "Too many authentication attempts. Please try again in 15 minutes.",
});

/**
 * Public limiter — for public endpoints like inquiry form.
 * 60 requests per 15-minute window per IP.
 */
export const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
  skip: skipInDev,
});

/**
 * API limiter — for authenticated API endpoints (more generous).
 * 500 requests per 15-minute window per IP.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
  skip: skipInDev,
});

/**
 * Reservation creation limiter — prevent bed-lock exhaustion attacks.
 * 5 new reservations per minute per IP.
 */
export const reservationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
  skip: skipInDev,
});

/**
 * Inquiry limiter — strict limits on public inquiry form submissions.
 * 5 submissions per 15-minute window per IP.
 */
export const inquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "You've submitted too many inquiries. Please try again in 15 minutes.",
      },
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  },
  skip: skipInDev,
});
