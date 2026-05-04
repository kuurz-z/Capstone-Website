/**
 * ============================================================================
 * FINANCIAL ROUTES
 * ============================================================================
 * Module 4 executive financial overview.
 * Owner-only route group.
 * ============================================================================
 */

import express from "express";
import { verifyToken, verifyOwner } from "../middleware/auth.js";
import { getOverview } from "../controllers/financialController.js";

const router = express.Router();

// All routes require authentication + owner role
router.use(verifyToken, verifyOwner);

/**
 * GET /api/financial/overview?branch=
 * Owner-only financial KPIs and per-room breakdown.
 */
router.get("/overview", getOverview);

export default router;
