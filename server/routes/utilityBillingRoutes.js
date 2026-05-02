import express from "express";
import {
  openUtilityPeriod,
  recordUtilityReading,
  closeUtilityPeriod,
  batchCloseUtilityPeriods,
  getUtilityDiagnosticsApi,
  getUtilityRooms,
  getUtilityReadings,
  getUtilityLatestReading,
  getUtilityPeriods,
  getUtilityResult,
  deleteUtilityPeriod,
  updateUtilityPeriod,
  deleteUtilityReading,
  updateUtilityReading,
  reviseUtilityResult,
  getRoomHistory,
  sendUtilityPeriod,
  getUtilityAiReview,
} from "../controllers/utilityBillingController.js";
import { verifyToken, verifyAdmin } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = express.Router();

// Module 4 utility billing route group:
// periods, readings, results, revisions, and send/close workflows.
router.use(verifyToken);
router.use(verifyAdmin);
router.use(requirePermission("manageBilling"));

// Diagnostics (Shared)
router.get("/diagnostics", getUtilityDiagnosticsApi);

// Query routes
router.get("/:utilityType/rooms", getUtilityRooms);
router.get("/:utilityType/readings/:roomId/latest", getUtilityLatestReading);
router.get("/:utilityType/readings/:roomId", getUtilityReadings);
router.get("/:utilityType/periods/:roomId", getUtilityPeriods);
router.get("/:utilityType/results/:periodId", getUtilityResult);
router.get("/:utilityType/rooms/:roomId/history", getRoomHistory);
router.post("/:utilityType/periods/:periodId/ai-review", getUtilityAiReview);

// Utility agnostic routes
router.post("/:utilityType/periods", openUtilityPeriod);
router.patch("/:utilityType/periods/:id", updateUtilityPeriod);
router.delete("/:utilityType/periods/:id", deleteUtilityPeriod);

router.post("/:utilityType/readings", recordUtilityReading);
router.patch("/:utilityType/readings/:id", updateUtilityReading);
router.delete("/:utilityType/readings/:id", deleteUtilityReading);

router.patch("/:utilityType/periods/:id/close", closeUtilityPeriod);
router.post("/:utilityType/periods/:id/send", sendUtilityPeriod);
router.post("/:utilityType/batch-close", batchCloseUtilityPeriods);
router.post("/:utilityType/results/:periodId/revise", reviseUtilityResult);

export default router;
