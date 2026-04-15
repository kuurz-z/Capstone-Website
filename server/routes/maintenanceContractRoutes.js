/**
 * ============================================================================
 * MAINTENANCE CONTRACT ROUTES
 * ============================================================================
 *
 * Canonical contract routes:
 * - Tenant: /api/m/maintenance/*
 * - Admin:  /api/m/maintenance/admin/*
 *
 * This router also exposes temporary compatibility aliases so the same
 * implementation can be mounted under /api/maintenance during rollout.
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

// Canonical tenant routes
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

// Canonical admin routes
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

// Compatibility aliases for legacy repo callers
router.get("/my-requests", verifyApplicant, maintenanceController.getMyRequests);
router.post("/requests", verifyApplicant, maintenanceController.createRequestCompat);
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
router.get(
  "/stats/completion",
  verifyAdmin,
  filterByBranch,
  requirePermission("manageMaintenance"),
  maintenanceController.getCompletionStats,
);
router.get(
  "/stats/issue-frequency",
  verifyAdmin,
  filterByBranch,
  requirePermission("manageMaintenance"),
  maintenanceController.getIssueFrequency,
);

// Shared detail routes
router.get("/requests/:requestId", maintenanceController.getRequestById);
router.get("/:requestId", maintenanceController.getRequestById);

export default router;
