import express from "express";
import { verifyAdmin, verifyOwner, verifyToken } from "../middleware/auth.js";
import {
  getAuditSummary,
  getBillingReport,
  getDashboardAnalytics,
  getFinancialsReport,
  getOccupancyForecast,
  getOccupancyReport,
  getOperationsReport,
} from "../controllers/analyticsController.js";

const router = express.Router();

router.use(verifyToken, verifyAdmin);

router.get("/dashboard", getDashboardAnalytics);
router.get("/reports/occupancy", getOccupancyReport);
router.get("/reports/billing", getBillingReport);
router.get("/reports/operations", getOperationsReport);
router.get("/forecast/occupancy", getOccupancyForecast);
router.get("/financials", verifyOwner, getFinancialsReport);
router.get("/audit", verifyOwner, getAuditSummary);

export default router;
