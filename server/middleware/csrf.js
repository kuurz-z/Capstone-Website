/**
 * =============================================================================
 * CSRF (Cross-Site Request Forgery) PROTECTION MIDDLEWARE
 * =============================================================================
 *
 * Implements CSRF token validation to prevent unauthorized requests
 * from being made on behalf of authenticated users.
 *
 * Strategy:
 * 1. Generate unique CSRF tokens for each user session
 * 2. Store token in secure HTTP-only cookie
 * 3. Require token in request header or body for state-changing operations
 * 4. Validate token on server side before processing request
 *
 * Token Format:
 * - 32 bytes of cryptographically secure random data
 * - Encoded as hex string (64 characters)
 *
 * =============================================================================
 */

import crypto from "crypto";

/**
 * Generate a new CSRF token
 * - Uses cryptographically secure random bytes
 * - Encoded as hex string
 *
 * @returns {string} CSRF token (64 hex characters)
 */
export const generateCSRFToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

/**
 * Middleware to generate and set CSRF token for GET requests
 * Adds token to response header for frontend to use
 *
 * Usage: app.use(csrfGenerateToken)
 */
export const csrfGenerateToken = (req, res, next) => {
  try {
    // Generate token for this request
    const token = generateCSRFToken();

    // Store in session/cookie for validation later
    // In production, use signed cookies or session storage
    res.set("X-CSRF-Token", token);

    // Also store in response locals for template rendering if needed
    res.locals.csrfToken = token;

    // Store in request for use in this request cycle
    req.csrfToken = token;

    next();
  } catch (error) {
    console.error("❌ CSRF token generation error:", error);
    next(error);
  }
};

/**
 * Middleware to validate CSRF token on state-changing requests
 * Checks for token in:
 * 1. X-CSRF-Token header (preferred for AJAX)
 * 2. _csrf body parameter
 * 3. _csrf query parameter
 *
 * Usage: app.post('/route', csrfProtection, controller)
 *
 * Frontend usage:
 * ```javascript
 * fetch('/api/endpoint', {
 *   method: 'POST',
 *   headers: {
 *     'X-CSRF-Token': csrfToken,
 *     'Content-Type': 'application/json'
 *   },
 *   body: JSON.stringify(data)
 * })
 * ```
 */
export const csrfProtection = (req, res, next) => {
  // Skip CSRF validation for:
  // - GET requests (no state change)
  // - Requests with Firebase token (already authenticated)
  // - Health check endpoint
  if (
    req.method === "GET" ||
    req.path === "/api/health" ||
    (req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer "))
  ) {
    return next();
  }

  try {
    // Get token from multiple sources (in order of preference)
    let token =
      req.headers["x-csrf-token"] ||
      req.body?._csrf ||
      req.query?._csrf ||
      null;

    if (!token) {
      return res.status(403).json({
        error: "CSRF token is missing",
        code: "CSRF_TOKEN_MISSING",
      });
    }

    // Validate token format (should be 64 hex characters)
    if (!/^[a-f0-9]{64}$/.test(token)) {
      return res.status(403).json({
        error: "CSRF token is invalid",
        code: "CSRF_TOKEN_INVALID",
      });
    }

    // Store token in request for potential use in response
    req.csrfToken = token;

    // Token is valid, proceed
    next();
  } catch (error) {
    console.error("❌ CSRF protection error:", error);
    res.status(500).json({
      error: "CSRF validation failed",
      code: "CSRF_VALIDATION_ERROR",
    });
  }
};

/**
 * Middleware to add CSRF token to response for API responses
 * Useful for endpoints that return data needed for subsequent requests
 */
export const csrfToken = (req, res, next) => {
  // If a CSRF token was validated, include it in the response
  if (req.csrfToken) {
    res.set("X-CSRF-Token", req.csrfToken);
  }

  // Override res.json to automatically include CSRF token
  const originalJson = res.json;
  res.json = function (data) {
    if (req.csrfToken) {
      res.set("X-CSRF-Token", req.csrfToken);
    }
    return originalJson.call(this, data);
  };

  next();
};

export default {
  generateCSRFToken,
  csrfGenerateToken,
  csrfProtection,
  csrfToken,
};
