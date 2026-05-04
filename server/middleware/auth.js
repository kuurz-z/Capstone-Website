/**
 * =============================================================================
 * AUTHENTICATION & AUTHORIZATION MIDDLEWARE
 * =============================================================================
 *
 * Middleware functions for protecting routes and verifying user permissions.
 *
 * Middleware Functions:
 * 1. verifyToken: Validates Firebase ID token (required for all protected routes)
 * 2. verifyAdmin: Checks if user has admin privileges (branch_admin or owner)
 * 3. verifyOwner: Checks if user has owner privileges
 * 4. verifyApplicant: Ensures user is NOT an admin (for applicant/tenant-only endpoints)
 *
 * Usage:
 * - Apply verifyToken to all routes that require authentication
 * - Chain verifyAdmin after verifyToken for admin-only routes
 * - Chain verifyOwner after verifyToken for owner-only routes
 * - Chain verifyApplicant after verifyToken for applicant/tenant-only routes
 *
 * Example:
 *   router.get('/protected', verifyToken, handler)
 *   router.post('/admin-only', verifyToken, verifyAdmin, handler)
 *   router.delete('/owner-only', verifyToken, verifyOwner, handler)
 *   router.post('/user-only', verifyToken, verifyApplicant, handler)
 */

import { getAuth } from "../config/firebase.js";
import crypto from "crypto";
import { User, UserSession } from "../models/index.js";

import { CACHE } from "../config/constants.js";
import {
  getCachedAccountStatus as _getCachedAccountStatus,
  setCachedAccountStatus as _setCachedAccountStatus,
  invalidateAccountStatusCache,
} from "../utils/accountStatusCache.js";

export { invalidateAccountStatusCache };

/* ─── In-memory token verification cache (avoids hitting Firebase each request) ── */
const tokenCache = new Map();
const TOKEN_CACHE_TTL = CACHE.TOKEN_TTL_MS;

function getCachedToken(token) {
  const key = crypto.createHash("sha256").update(token).digest("hex");
  const entry = tokenCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > TOKEN_CACHE_TTL) {
    tokenCache.delete(key);
    return null;
  }
  entry.lastAccess = Date.now(); // Update on every read — enables LRU eviction
  return entry.decoded;
}

function setCachedToken(token, decoded) {
  const key = crypto.createHash("sha256").update(token).digest("hex");
  // Evict least-recently-accessed entry when cache is full
  // (LRU is better than FIFO — keeps active users' tokens cached)
  if (tokenCache.size >= CACHE.MAX_TOKEN_ENTRIES) {
    let lruKey = null;
    let lruTime = Infinity;
    for (const [k, v] of tokenCache) {
      const lastUsed = v.lastAccess || v.ts;
      if (lastUsed < lruTime) {
        lruTime = lastUsed;
        lruKey = k;
      }
    }
    if (lruKey) tokenCache.delete(lruKey);
  }
  tokenCache.set(key, { decoded, ts: Date.now(), lastAccess: Date.now() });
}

/* ─── Account status cache — backed by shared module so User post-save hooks
       can invalidate it without creating a circular import. ─────────────────── */
const getCachedAccountStatus = _getCachedAccountStatus;
const setCachedAccountStatus = _setCachedAccountStatus;

const OTP_SESSION_EXEMPT_PATHS = [
  "/api/auth/login",
  "/api/auth/verify-otp",
  "/api/auth/resend-otp",
  "/api/auth/logout",
  "/api/auth/register",
  "/api/auth/log-password-reset",
];

const isOtpSessionExempt = (req) =>
  OTP_SESSION_EXEMPT_PATHS.some((path) => req.originalUrl?.startsWith(path));

const isAdminRole = (role) =>
  role === "branch_admin" || role === "owner" || role === "superadmin";

/**
 * Verify Firebase ID Token
 *
 * Middleware to authenticate requests using Firebase ID tokens.
 * The token should be sent in the Authorization header as "Bearer <token>".
 *
 * Uses an in-memory cache to avoid hitting Firebase on every request.
 */
export const verifyToken = async (req, res, next) => {
  try {
    const auth = getAuth();

    if (!auth) {
      return res.status(503).json({
        error:
          "Authentication is temporarily unavailable. Firebase Admin is not initialized.",
        code: "FIREBASE_ADMIN_NOT_INITIALIZED",
      });
    }

    // Extract the Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: "No authorization header provided",
        code: "AUTH_HEADER_MISSING",
      });
    }

    // Extract the token from "Bearer <token>" format
    const token = authHeader.split("Bearer ")[1];

    if (!token) {
      return res.status(401).json({
        error: "No token provided",
        code: "TOKEN_MISSING",
      });
    }

    // Try cache first — saves ~200ms per request
    let decodedToken = getCachedToken(token);
    if (!decodedToken) {
      decodedToken = await auth.verifyIdToken(token);
      setCachedToken(token, decodedToken);
    }

    // Attach decoded user data to request object
    req.user = decodedToken;

    // --- Account status check (cached — saves ~5-50ms per request) ---
    // Block suspended/banned users from accessing any protected endpoint
    let dbUser = await User.findOne({ firebaseUid: decodedToken.uid })
      .select("_id accountStatus role")
      .lean();
    let accountStatus = getCachedAccountStatus(decodedToken.uid);
    if (accountStatus === undefined) {
      accountStatus = dbUser?.accountStatus || null;
      setCachedAccountStatus(decodedToken.uid, accountStatus);
    }

    if (accountStatus && accountStatus !== "active") {
      const statusMap = {
        suspended: { error: "Your account has been suspended. Contact support.", code: "ACCOUNT_SUSPENDED" },
        banned: { error: "Your account has been banned.", code: "ACCOUNT_BANNED" },
        pending_verification: { error: "Your account is pending verification.", code: "ACCOUNT_PENDING_VERIFICATION" },
      };
      const info = statusMap[accountStatus];
      if (info) return res.status(403).json(info);
    }

    if (
      dbUser &&
      !isAdminRole(dbUser.role) &&
      !isOtpSessionExempt(req)
    ) {
      const deviceId =
        typeof req.headers["x-device-id"] === "string"
          ? req.headers["x-device-id"].trim()
          : "";
      const sessionId =
        typeof req.headers["x-session-id"] === "string"
          ? req.headers["x-session-id"].trim()
          : "";

      if (!deviceId || !sessionId) {
        return res.status(401).json({
          error: "Session verification required. Please sign in again.",
          code: "OTP_SESSION_REQUIRED",
        });
      }

      const session = await UserSession.findValidOtpSession(
        dbUser._id,
        deviceId,
        sessionId,
      );

      if (!session) {
        return res.status(401).json({
          error: "Your session expired. Please verify again.",
          code: "OTP_SESSION_INVALID",
        });
      }

      session.lastActivityAt = new Date();
      await session.save();
      req.session = session;
    }

    // Token is valid, proceed to next middleware/route
    next();
  } catch (error) {
    console.error("❌ Token verification error:", error.message);

    // Provide specific error messages based on error type
    let errorMessage = "Invalid or expired token";
    let errorCode = "TOKEN_INVALID";

    if (error.code === "auth/id-token-expired") {
      errorMessage = "Token has expired. Please login again.";
      errorCode = "TOKEN_EXPIRED";
    } else if (error.code === "auth/argument-error") {
      errorMessage = "Malformed token provided.";
      errorCode = "TOKEN_MALFORMED";
    }

    res.status(401).json({
      error: errorMessage,
      code: errorCode,
    });
  }
};

/**
 * Verify Admin Role
 *
 * Middleware to check if the authenticated user has admin privileges.
 * Must be used AFTER verifyToken middleware.
 *
 * Checks in order:
 * 1. Firebase custom claims (branch_admin: true or owner: true) — fast path
 * 2. Fallback: MongoDB user role (handles missing custom claims)
 *
 * @middleware
 * @param {Object} req - Express request object (must have req.user from verifyToken)
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 *
 * @returns {void} Calls next() if admin, sends 403 error otherwise
 */
export const verifyAdmin = async (req, res, next) => {
  try {
    // Ensure verifyToken was called first
    if (!req.user || !req.user.uid) {
      return res.status(401).json({
        error: "User not authenticated. Apply verifyToken middleware first.",
        code: "USER_NOT_AUTHENTICATED",
      });
    }

    // Check custom claims from Firebase ID token (fast path)
    if (req.user.branch_admin || req.user.owner) {
      return next();
    }

    // Fallback: Check MongoDB role (handles missing Firebase custom claims)
    const dbUser = await User.findOne({ firebaseUid: req.user.uid });

    if (dbUser && (dbUser.role === "branch_admin" || dbUser.role === "owner")) {
      // Attach role info to req.user for downstream middleware
      req.user.branch_admin = dbUser.role === "branch_admin" || dbUser.role === "owner";
      req.user.owner = dbUser.role === "owner";
      req.user.dbRole = dbUser.role;
      return next();
    }

    return res.status(403).json({
      error: "Access denied. Admin privileges required.",
      code: "ADMIN_ACCESS_DENIED",
    });
  } catch (error) {
    console.error("❌ Admin verification error:", error.message);

    res.status(403).json({
      error: "Access denied",
      code: "ACCESS_DENIED",
    });
  }
};

/**
 * Verify Owner Role
 *
 * Middleware to check if the authenticated user has owner privileges.
 * Must be used AFTER verifyToken middleware.
 *
 * Checks for the 'owner' custom claim in the Firebase ID token.
 *
 * SECURITY: This prevents unauthorized access to owner-only endpoints.
 *
 * @middleware
 * @param {Object} req - Express request object (must have req.user from verifyToken)
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 *
 * @returns {void} Calls next() if owner, sends 403 error otherwise
 */
export const verifyOwner = async (req, res, next) => {
  try {
    // Ensure verifyToken was called first
    if (!req.user || !req.user.uid) {
      return res.status(401).json({
        error: "User not authenticated. Apply verifyToken middleware first.",
        code: "USER_NOT_AUTHENTICATED",
      });
    }

    // Check custom claims from Firebase ID token (fast path)
    if (req.user.owner) {
      req.isOwner = true;
      return next();
    }

    // Fallback: Check MongoDB role (handles missing Firebase custom claims)
    const dbUser = await User.findOne({ firebaseUid: req.user.uid });

    if (dbUser && dbUser.role === "owner") {
      req.user.owner = true;
      req.user.branch_admin = true;
      req.user.dbRole = dbUser.role;
      req.isOwner = true;
      return next();
    }

    return res.status(403).json({
      error: "Access denied. Owner privileges required.",
      code: "OWNER_ACCESS_DENIED",
    });
  } catch (error) {
    console.error("❌ Owner verification error:", error.message);

    res.status(403).json({
      error: "Access denied",
      code: "ACCESS_DENIED",
    });
  }
};

/**
 * Verify Applicant/Tenant Role
 *
 * Middleware to check if the authenticated user has applicant/tenant privileges.
 * Must be used AFTER verifyToken middleware.
 *
 * Ensures that admin users cannot access applicant-only endpoints.
 * Users with "applicant", "tenant" roles will pass this check.
 * branch_admin and owner users will be denied access.
 *
 * SECURITY: This prevents privilege escalation where admins
 * could access applicant endpoints with their elevated permissions.
 *
 * @middleware
 * @param {Object} req - Express request object (must have req.user from verifyToken)
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 *
 * @returns {void} Calls next() if applicant/tenant, sends 403 error otherwise
 */
export const verifyApplicant = async (req, res, next) => {
  try {
    // Ensure verifyToken was called first
    if (!req.user || !req.user.uid) {
      return res.status(401).json({
        error: "User not authenticated. Apply verifyToken middleware first.",
        code: "USER_NOT_AUTHENTICATED",
      });
    }

    // Check that user does NOT have admin privileges
    // This prevents admins from accessing applicant-only endpoints
    if (req.user.branch_admin || req.user.owner) {
      return res.status(403).json({
        error: "Access denied. Applicant endpoint - admin access not allowed.",
        code: "APPLICANT_ENDPOINT_ADMIN_DENIED",
      });
    }

    // Fallback: Check MongoDB role (handles missing/stale Firebase custom claims)
    const dbUser = await User.findOne({ firebaseUid: req.user.uid });
    if (dbUser && (dbUser.role === "branch_admin" || dbUser.role === "owner")) {
      return res.status(403).json({
        error: "Access denied. Applicant endpoint - admin access not allowed.",
        code: "APPLICANT_ENDPOINT_ADMIN_DENIED",
      });
    }

    // User is not an admin (applicant/tenant), proceed to route handler
    next();
  } catch (error) {
    console.error("❌ Applicant verification error:", error.message);

    res.status(403).json({
      error: "Access denied",
      code: "ACCESS_DENIED",
    });
  }
};
