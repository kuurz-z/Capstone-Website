/**
 * ============================================================================
 * NOTIFICATION CONTROLLER
 * ============================================================================
 *
 * Handles notification retrieval and management for users.
 *
 * ============================================================================
 */

import Notification from "../models/Notification.js";
import { User } from "../models/index.js";
import {
  sendSuccess,
  AppError,
} from "../middleware/errorHandler.js";

/**
 * GET /api/notifications
 * Get notifications for the authenticated user (paginated).
 */
export const getMyNotifications = async (req, res, next) => {
  try {
    const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();
    if (!dbUser) throw new AppError("User not found", 404, "USER_NOT_FOUND");

    const { page = 1, limit = 20, unreadOnly } = req.query;
    const result = await Notification.getForUser(dbUser._id, {
      page: parseInt(page),
      limit: parseInt(limit),
      unreadOnly: unreadOnly === "true",
    });

    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/notifications/:notificationId/read
 * Mark a single notification as read.
 */
export const markAsRead = async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();
    if (!dbUser) throw new AppError("User not found", 404, "USER_NOT_FOUND");

    const notification = await Notification.findById(notificationId);
    if (!notification) throw new AppError("Notification not found", 404, "NOTIFICATION_NOT_FOUND");
    if (String(notification.userId) !== String(dbUser._id))
      throw new AppError("Not your notification", 403, "FORBIDDEN");

    await notification.markAsRead();
    sendSuccess(res, { message: "Notification marked as read" });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications as read for the authenticated user.
 */
export const markAllAsRead = async (req, res, next) => {
  try {
    const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();
    if (!dbUser) throw new AppError("User not found", 404, "USER_NOT_FOUND");

    const result = await Notification.markAllAsRead(dbUser._id);
    sendSuccess(res, { message: "All notifications marked as read", modifiedCount: result.modifiedCount });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/notifications/unread-count
 * Get unread notification count for the authenticated user.
 */
export const getUnreadCount = async (req, res, next) => {
  try {
    const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();
    if (!dbUser) throw new AppError("User not found", 404, "USER_NOT_FOUND");

    const count = await Notification.countDocuments({ userId: dbUser._id, isRead: false });
    sendSuccess(res, { unreadCount: count });
  } catch (error) {
    next(error);
  }
};
