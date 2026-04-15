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
import {
  verifyApplicant,
  verifyToken,
  verifyAdmin,
} from "../middleware/auth.js";
import { filterByBranch } from "../middleware/branchAccess.js";
import { requirePermission } from "../middleware/permissions.js";
import * as maintenanceController from "../controllers/maintenanceController.js";

const router = express.Router();

router.use(verifyToken);

// ============================================================================
// TENANT ROUTES
// ============================================================================

router.get("/me", verifyApplicant, maintenanceController.getMyRequests);
router.post("/", verifyApplicant, maintenanceController.createRequest);
router.put("/:requestId", verifyApplicant, maintenanceController.updateMyRequest);
router.patch(
  "/:requestId/cancel",
  verifyApplicant,
  maintenanceController.cancelMyRequest,
);
router.patch(
  "/:requestId/reopen",
  verifyApplicant,
  maintenanceController.reopenMyRequest,
);

// ============================================================================
// ADMIN/STAFF ROUTES
// ============================================================================

router.get(
  "/admin/all",
  verifyAdmin,
  filterByBranch,
  requirePermission("manageMaintenance"),
  maintenanceController.getAdminAll,
);

router.patch(
  "/admin/:requestId/status",
  verifyAdmin,
  filterByBranch,
  requirePermission("manageMaintenance"),
  maintenanceController.updateAdminRequestStatus,
);

router.get("/:requestId", maintenanceController.getRequestById);

router.get("/my-requests", verifyApplicant, maintenanceController.getMyRequests);
router.post("/requests", verifyApplicant, maintenanceController.createRequestCompat);
router.get("/requests/:requestId", maintenanceController.getRequestById);
router.get(
  "/branch",
  verifyAdmin,
  filterByBranch,
  requirePermission("manageMaintenance"),
  maintenanceController.getByBranch,
);
router.patch(
  "/requests/:requestId",
  verifyAdmin,
  filterByBranch,
  requirePermission("manageMaintenance"),
  maintenanceController.updateRequest,
);

/**
 * GET /api/maintenance/stats/completion
 * Get completion statistics by branch (Admin only)
 */
router.get(
  "/stats/completion",
  verifyAdmin,
  filterByBranch,
  requirePermission("manageMaintenance"),
  maintenanceController.getCompletionStats,
);

/**
 * GET /api/maintenance/stats/issue-frequency
 * Get issue frequency for predictive maintenance (Admin only)
 */
router.get(
  "/stats/issue-frequency",
  verifyAdmin,
  filterByBranch,
  requirePermission("manageMaintenance"),
  maintenanceController.getIssueFrequency,
);

/**
 * GET /api/maintenance/scheduled
 * Get upcoming scheduled maintenance (Admin only)
 * Returns maintenance requests with scheduledDate in the future
 */
router.get(
  "/scheduled",
  verifyAdmin,
  requirePermission("manageMaintenance"),
  async (req, res) => {
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
router.get(
  "/costs",
  verifyAdmin,
  requirePermission("manageMaintenance"),
  async (req, res) => {
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
