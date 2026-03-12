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

/**
 * GET /api/notifications
 * Get notifications for the authenticated user (paginated).
 */
export const getMyNotifications = async (req, res) => {
  try {
    const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();
    if (!dbUser) return res.status(404).json({ error: "User not found" });

    const { page = 1, limit = 20, unreadOnly } = req.query;
    const result = await Notification.getForUser(dbUser._id, {
      page: parseInt(page),
      limit: parseInt(limit),
      unreadOnly: unreadOnly === "true",
    });

    res.json(result);
  } catch (error) {
    console.error("❌ Get notifications error:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
};

/**
 * PATCH /api/notifications/:notificationId/read
 * Mark a single notification as read.
 */
export const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();
    if (!dbUser) return res.status(404).json({ error: "User not found" });

    const notification = await Notification.findById(notificationId);
    if (!notification) return res.status(404).json({ error: "Notification not found" });
    if (String(notification.userId) !== String(dbUser._id))
      return res.status(403).json({ error: "Not your notification" });

    await notification.markAsRead();
    res.json({ message: "Notification marked as read" });
  } catch (error) {
    console.error("❌ Mark notification read error:", error);
    res.status(500).json({ error: "Failed to update notification" });
  }
};

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications as read for the authenticated user.
 */
export const markAllAsRead = async (req, res) => {
  try {
    const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();
    if (!dbUser) return res.status(404).json({ error: "User not found" });

    const result = await Notification.markAllAsRead(dbUser._id);
    res.json({ message: "All notifications marked as read", modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error("❌ Mark all notifications read error:", error);
    res.status(500).json({ error: "Failed to update notifications" });
  }
};

/**
 * GET /api/notifications/unread-count
 * Get unread notification count for the authenticated user.
 */
export const getUnreadCount = async (req, res) => {
  try {
    const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();
    if (!dbUser) return res.status(404).json({ error: "User not found" });

    const count = await Notification.countDocuments({ userId: dbUser._id, isRead: false });
    res.json({ unreadCount: count });
  } catch (error) {
    console.error("❌ Get unread count error:", error);
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
};
