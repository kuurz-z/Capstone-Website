/**
 * ============================================================================
 * ANNOUNCEMENTS ROUTES
 * ============================================================================
 *
 * API endpoints for announcements with engagement tracking.
 * All endpoints require authentication.
 *
 * ============================================================================
 */

import express from "express";
import { verifyToken } from "../middleware/auth.js";
import * as announcementsController from "../controllers/announcementsController.js";

const router = express.Router();

// All announcements routes require authentication
router.use(verifyToken);

// ============================================================================
// TENANT ROUTES
// ============================================================================

/**
 * GET /api/announcements
 * Get announcements for user's branch
 */
router.get("/", announcementsController.getAnnouncements);

/**
 * GET /api/announcements/unacknowledged
 * Get unacknowledged announcements for current user
 */
router.get("/unacknowledged", announcementsController.getUnacknowledged);

/**
 * POST /api/announcements/:announcementId/read
 * Mark announcement as read
 */
router.post("/:announcementId/read", announcementsController.markAsRead);

/**
 * POST /api/announcements/:announcementId/acknowledge
 * Acknowledge announcement
 */
router.post(
  "/:announcementId/acknowledge",
  announcementsController.acknowledgeAnnouncement,
);

/**
 * GET /api/announcements/user/engagement-stats
 * Get user's engagement statistics
 */
router.get(
  "/user/engagement-stats",
  announcementsController.getUserEngagementStats,
);

// ============================================================================
// ADMIN ROUTES
// ============================================================================

/**
 * POST /api/announcements
 * Create new announcement (Admin only)
 */
router.post("/", announcementsController.createAnnouncement);

// ============================================================================
// EXPORT
// ============================================================================

export default router;
