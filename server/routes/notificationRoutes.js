/**
 * ============================================================================
 * NOTIFICATION ROUTES
 * ============================================================================
 *
 * Endpoints:
 * - GET    /api/notifications              - Get my notifications (paginated)
 * - GET    /api/notifications/unread-count  - Get unread count
 * - PATCH  /api/notifications/read-all     - Mark all as read
 * - PATCH  /api/notifications/:id/read     - Mark single as read
 *
 * ============================================================================
 */

import express from "express";
import { verifyToken } from "../middleware/auth.js";
import {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
} from "../controllers/notificationController.js";

const router = express.Router();

// Get unread count (lightweight, no pagination) — must be before /:id
router.get("/unread-count", verifyToken, getUnreadCount);

// Mark all as read — must be before /:id
router.patch("/read-all", verifyToken, markAllAsRead);

// Get paginated notifications
router.get("/", verifyToken, getMyNotifications);

// Mark single notification as read
router.patch("/:notificationId/read", verifyToken, markAsRead);

export default router;
