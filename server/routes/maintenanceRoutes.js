/**
 * ============================================================================
 * MAINTENANCE ROUTES
 * ============================================================================
 *
 * API endpoints for maintenance requests with branch isolation.
 * All endpoints require authentication.
 *
 * ============================================================================
 */

import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { validate } from "../validation/validate.js";
import { createMaintenanceSchema } from "../validation/schemas.js";
import * as maintenanceController from "../controllers/maintenanceController.js";

const router = express.Router();

// All maintenance routes require authentication
router.use(verifyToken);

// ============================================================================
// TENANT ROUTES
// ============================================================================

/**
 * GET /api/maintenance/my-requests
 * Get current tenant's maintenance requests
 */
router.get("/my-requests", maintenanceController.getMyRequests);

/**
 * POST /api/maintenance/requests
 * Create new maintenance request
 */
router.post("/requests", validate(createMaintenanceSchema), maintenanceController.createRequest);

/**
 * GET /api/maintenance/requests/:requestId
 * Get maintenance request details
 */
router.get("/requests/:requestId", maintenanceController.getRequest);

// ============================================================================
// ADMIN/STAFF ROUTES
// ============================================================================

/**
 * GET /api/maintenance/branch
 * Get all maintenance requests for branch (Admin only)
 */
router.get("/branch", maintenanceController.getByBranch);

/**
 * PATCH /api/maintenance/requests/:requestId
 * Update maintenance request status (Admin only)
 */
router.patch("/requests/:requestId", maintenanceController.updateRequest);

/**
 * GET /api/maintenance/stats/completion
 * Get completion statistics by branch (Admin only)
 */
router.get("/stats/completion", maintenanceController.getCompletionStats);

/**
 * GET /api/maintenance/stats/issue-frequency
 * Get issue frequency for predictive maintenance (Admin only)
 */
router.get("/stats/issue-frequency", maintenanceController.getIssueFrequency);

/**
 * GET /api/maintenance/scheduled
 * Get upcoming scheduled maintenance (Admin only)
 * Returns maintenance requests with scheduledDate in the future
 */
router.get("/scheduled", verifyToken, async (req, res) => {
  try {
    const MaintenanceRequest = (await import("../models/MaintenanceRequest.js")).default;
    const { User } = await import("../models/index.js");
    const dbUser = await User.findOne({ firebaseUid: req.user.uid });
    if (!dbUser || !["branch_admin", "owner"].includes(dbUser.role)) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const filter = {
      scheduledDate: { $gte: new Date() },
      status: { $nin: ["completed", "cancelled"] },
      isArchived: false,
    };
    if (dbUser.role === "branch_admin") filter.branch = dbUser.branch;

    const requests = await MaintenanceRequest.find(filter)
      .populate("roomId", "name branch")
      .populate("userId", "firstName lastName")
      .populate("assignedTo", "firstName lastName")
      .sort({ scheduledDate: 1 })
      .lean();

    res.json({ success: true, data: requests });
  } catch (error) {
    console.error("❌ Scheduled maintenance error:", error);
    res.status(500).json({ error: "Failed to fetch scheduled maintenance" });
  }
});

/**
 * GET /api/maintenance/costs
 * Get maintenance cost summary by room (Admin only)
 */
router.get("/costs", verifyToken, async (req, res) => {
  try {
    const MaintenanceRequest = (await import("../models/MaintenanceRequest.js")).default;
    const { User } = await import("../models/index.js");
    const dbUser = await User.findOne({ firebaseUid: req.user.uid });
    if (!dbUser || !["branch_admin", "owner"].includes(dbUser.role)) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const matchFilter = { status: "completed", isArchived: false };
    if (dbUser.role === "branch_admin") matchFilter.branch = dbUser.branch;

    const costs = await MaintenanceRequest.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: "$roomId",
          totalEstimated: { $sum: "$estimatedCost" },
          totalActual: { $sum: "$actualCost" },
          requestCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "rooms",
          localField: "_id",
          foreignField: "_id",
          as: "room",
        },
      },
      { $unwind: { path: "$room", preserveNullAndEmpty: true } },
      {
        $project: {
          roomName: "$room.name",
          branch: "$room.branch",
          totalEstimated: 1,
          totalActual: 1,
          requestCount: 1,
        },
      },
      { $sort: { totalActual: -1 } },
    ]);

    res.json({ success: true, data: costs });
  } catch (error) {
    console.error("❌ Maintenance costs error:", error);
    res.status(500).json({ error: "Failed to fetch maintenance costs" });
  }
});

// ============================================================================
// EXPORT
// ============================================================================

export default router;
