/**
 * ============================================================================
 * MOBILE APP BRIDGE — Auth middleware
 * ============================================================================
 *
 * Session-based auth middleware for the mobile app.
 * Mobile uses session_token (stored in user_sessions collection),
 * NOT Firebase ID tokens like the web admin.
 * ============================================================================
 */

import { getDb } from "../config/database.js";

/**
 * Authenticate mobile requests via session_token.
 * Token can come from Authorization: Bearer <token>, cookie, or query param.
 */
export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.session_token;
  const queryToken = req.query?.token;

  let token = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else if (cookieToken) {
    token = cookieToken;
  } else if (queryToken) {
    token = queryToken;
  }

  if (!token) {
    return res.status(401).json({ detail: "Not authenticated" });
  }

  try {
    const db = getDb();
    const session = await db.collection("user_sessions").findOne({
      session_token: token,
      expires_at: { $gt: new Date() },
    });

    if (!session) {
      return res.status(401).json({ detail: "Invalid or expired session" });
    }

    if (!session.user_id) {
      await db.collection("user_sessions").deleteOne({ _id: session._id });
      return res
        .status(401)
        .json({ detail: "Invalid session. Please sign in again." });
    }

    const user = await db
      .collection("users")
      .findOne({ user_id: session.user_id });
    if (!user) {
      return res.status(401).json({ detail: "User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("[mobile] Auth middleware error:", error);
    return res.status(401).json({ detail: "Authentication error" });
  }
}

export function adminMiddleware(req, res, next) {
  const role = (req.user?.role || "").toLowerCase();
  if (role !== "admin" && role !== "superadmin") {
    return res.status(403).json({ detail: "Admin access required" });
  }
  return next();
}

export async function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.session_token;
  const queryToken = req.query?.token;

  let token = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else if (cookieToken) {
    token = cookieToken;
  } else if (queryToken) {
    token = queryToken;
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const db = getDb();
    const session = await db.collection("user_sessions").findOne({
      session_token: token,
      expires_at: { $gt: new Date() },
    });

    if (session?.user_id) {
      const user = await db
        .collection("users")
        .findOne({ user_id: session.user_id });
      req.user = user || null;
    } else {
      req.user = null;
    }
  } catch (_) {
    req.user = null;
  }

  return next();
}
