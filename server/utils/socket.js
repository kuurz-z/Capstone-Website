/**
 * ============================================================================
 * SOCKET.IO SERVER
 * ============================================================================
 *
 * Real-time event broadcasting for:
 * - New notifications (bell icon updates instantly)
 * - Reservation status changes (admin ↔ tenant)
 * - Maintenance request updates
 *
 * USAGE (from any controller/service):
 *   import { getIO } from "../utils/socket.js";
 *   getIO().to(`user:${userId}`).emit("notification:new", payload);
 *
 * ============================================================================
 */

import { Server } from "socket.io";
import logger from "../middleware/logger.js";
import { getAuth } from "../config/firebase.js";
import { User } from "../models/index.js";
import { ROOM_BRANCHES } from "../config/branches.js";

let io = null;

const ADMIN_ROLES = new Set(["branch_admin", "owner", "superadmin"]);

const adminBranchRoom = (branch) => `admins:branch:${branch}`;
const isOwnerLike = (role, claims = {}) =>
  role === "owner" ||
  role === "superadmin" ||
  Boolean(claims.owner || claims.superadmin);

/**
 * Initialize Socket.IO on an existing HTTP server
 * @param {import("http").Server} httpServer
 * @param {string[]} allowedOrigins - CORS origins
 */
export function initSocket(httpServer, allowedOrigins = []) {
  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        return next(new Error("Authentication required"));
      }

      const auth = getAuth();
      if (!auth) {
        return next(new Error("Authentication unavailable"));
      }

      const decoded = await auth.verifyIdToken(token);
      const dbUser = await User.findOne({ firebaseUid: decoded.uid })
        .select("_id role branch accountStatus isArchived")
        .lean();

      if (!dbUser || dbUser.isArchived || dbUser.accountStatus !== "active") {
        return next(new Error("User not allowed"));
      }

      socket.data.user = dbUser;
      socket.data.claims = decoded;
      return next();
    } catch (error) {
      logger.warn({ err: error }, "Socket authentication failed");
      return next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const dbUser = socket.data.user;
    const claims = socket.data.claims || {};
    const userId = dbUser?._id ? String(dbUser._id) : "";
    const role = String(dbUser?.role || "").toLowerCase();

    if (userId) {
      socket.join(`user:${userId}`);
    }

    if (ADMIN_ROLES.has(role) || claims.branch_admin || claims.owner || claims.superadmin) {
      socket.join("admins");

      if (isOwnerLike(role, claims)) {
        socket.join("admins:all");
      } else if (ROOM_BRANCHES.includes(dbUser.branch)) {
        socket.join(adminBranchRoom(dbUser.branch));
      }
    }

    socket.on("disconnect", () => {
      // Cleanup handled automatically by Socket.IO
    });
  });

  logger.info("Socket.IO initialized");
  return io;
}

/**
 * Get the Socket.IO instance (use after initSocket)
 * @returns {Server|null}
 */
export function getIO() {
  return io;
}

/**
 * Emit a notification to a specific user
 * @param {string} userId - MongoDB user _id
 * @param {Object} notification - The notification payload
 */
export function emitToUser(userId, event, payload) {
  if (io) {
    io.to(`user:${userId}`).emit(event, payload);
  }
}

/**
 * Emit an event to all admins
 * @param {string} event - Event name
 * @param {Object} payload - Data to send
 */
export function emitToAdmins(event, payload) {
  if (io) {
    io.to("admins").emit(event, payload);
  }
}

/**
 * Emit a sensitive admin event to only the conversation branch plus owners.
 * Branch admins receive only their assigned branch; owner-like users receive all.
 */
export function emitToChatAdmins(branch, event, payload) {
  if (io && ROOM_BRANCHES.includes(branch)) {
    io.to(adminBranchRoom(branch)).to("admins:all").emit(event, payload);
  }
}

/**
 * Broadcast room availability update to ALL connected clients.
 * Called after any occupancy change so every open browser refreshes
 * the affected room card without needing a manual page reload.
 *
 * @param {string|ObjectId} roomId - The room that changed
 * @param {Object} data - Partial room data to attach (occupancy, available, capacity)
 */
export function emitRoomUpdate(roomId, data = {}) {
  if (io) {
    io.emit("room:updated", { roomId: String(roomId), ...data });
  }
}

/**
 * Broadcast a digital-twin state change to all admins.
 * Called when room occupancy, maintenance, or billing status changes.
 *
 * @param {string} branch - The branch that changed (optional)
 * @param {string|ObjectId} roomId - The specific room that changed (optional)
 */
export function emitDigitalTwinUpdate(branch = null, roomId = null) {
  if (io) {
    io.to("admins").emit("digital-twin:updated", {
      branch,
      roomId: roomId ? String(roomId) : null,
      timestamp: new Date().toISOString(),
    });
  }
}

