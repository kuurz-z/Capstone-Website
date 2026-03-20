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

let io = null;

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

  io.on("connection", (socket) => {
    const userId = socket.handshake.auth?.userId;

    // Join a personal room so we can target specific users
    if (userId) {
      socket.join(`user:${userId}`);
    }

    // Join role-based rooms
    const role = socket.handshake.auth?.role;
    if (role === "admin" || role === "superAdmin") {
      socket.join("admins");
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

