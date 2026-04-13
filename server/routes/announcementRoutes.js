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
import { verifyToken, verifyAdmin } from "../middleware/auth.js";
import { validate } from "../validation/validate.js";
import {
  createAnnouncementSchema,
  updateAnnouncementSchema,
} from "../validation/schemas.js";
import { requirePermission } from "../middleware/permissions.js";
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
 * GET /api/announcements/admin
 * Get recent announcements in the admin's scope
 */
router.get(
  "/admin",
  verifyAdmin,
  requirePermission("manageAnnouncements"),
  announcementsController.getAdminAnnouncements,
);

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
router.post(
  "/",
  verifyAdmin,
  requirePermission("manageAnnouncements"),
  validate(createAnnouncementSchema),
  announcementsController.createAnnouncement,
);

/**
 * PUT /api/announcements/:id
 * Update an announcement (Admin only)
 */
router.put(
  "/:id",
  verifyAdmin,
  requirePermission("manageAnnouncements"),
  validate(updateAnnouncementSchema),
  announcementsController.updateAnnouncement,
);

/**
 * DELETE /api/announcements/:id
 * Delete an announcement (Admin only)
 */
router.delete(
  "/:id",
  verifyAdmin,
  requirePermission("manageAnnouncements"),
  announcementsController.deleteAnnouncement,
);

// ============================================================================
// EXPORT
// ============================================================================

export default router;
