/**
 * ============================================================================
 * DIGITAL TWIN ROUTES
 * ============================================================================
 *
 * Admin-protected routes for the digital twin dashboard.
 *
 *   GET /api/digital-twin/snapshot?branch=   → branch overview
 *   GET /api/digital-twin/room/:roomId       → room deep-dive
 *
 * ============================================================================
 */

import { Router } from "express";
import { verifyToken, verifyAdmin } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { getSnapshot, getRoomDetail } from "../controllers/digitalTwinController.js";

const router = Router();

router.get("/snapshot", verifyToken, verifyAdmin, requirePermission("viewReports"), getSnapshot);
router.get("/room/:roomId", verifyToken, verifyAdmin, requirePermission("viewReports"), getRoomDetail);

export default router;
