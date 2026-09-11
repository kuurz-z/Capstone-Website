import express from "express";
import {
  previewWaterBilling,
  recoverWaterOpening,
  openUtilityPeriod,
  generateHistoricalUtilityPeriod,
  recordUtilityReading,
  closeUtilityPeriod,
  batchCloseUtilityPeriods,
  getUtilityDiagnosticsApi,
  getUtilityRooms,
  getUtilityReadings,
  getUtilityLatestReading,
  getUtilityPeriods,
  getUtilityResult,
  exportUtilityRows,
  deleteUtilityPeriod,
  updateUtilityPeriod,
  deleteUtilityReading,
  updateUtilityReading,
  reviseUtilityResult,
  getRoomHistory,
  sendUtilityPeriod,
  getUtilityAiReview,
  resolveUtilityHistoricalGap,
} from "../controllers/utilityBillingController.js";
import { verifyToken, verifyAdmin } from "../middleware/auth.js";
import { filterByBranch } from "../middleware/branchAccess.js";
import { requirePermission } from "../middleware/permissions.js";

const router = express.Router();

// Module 4 utility billing route group:
// periods, readings, results, revisions, and send/close workflows.
router.use(verifyToken);
router.use(verifyAdmin);
router.use(filterByBranch);
router.use(requirePermission("manageBilling"));

// Diagnostics (Shared)
router.get("/diagnostics", getUtilityDiagnosticsApi);
router.post('/water/preview', previewWaterBilling);
router.post('/water/opening-baseline', recoverWaterOpening);

// Query routes (branch filtering done inside controllers via admin.branch)
router.get("/:utilityType/rooms", getUtilityRooms);
router.get("/:utilityType/readings/:roomId/latest", getUtilityLatestReading);
router.get("/:utilityType/readings/:roomId", getUtilityReadings);
router.get("/:utilityType/periods/:roomId", getUtilityPeriods);
router.get("/:utilityType/results/:periodId", getUtilityResult);
router.get("/:utilityType/export", exportUtilityRows);
router.get("/:utilityType/rooms/:roomId/history", getRoomHistory);
router.post("/:utilityType/periods/:periodId/ai-review", getUtilityAiReview);
router.post("/:utilityType/periods/:id/manual-review/resolve", filterByBranch, resolveUtilityHistoricalGap);

// Mutation routes — enforce branch isolation at middleware level
router.post("/:utilityType/periods", filterByBranch, openUtilityPeriod);
router.post("/:utilityType/periods/historical", filterByBranch, generateHistoricalUtilityPeriod);
router.patch("/:utilityType/periods/:id", filterByBranch, updateUtilityPeriod);
router.delete("/:utilityType/periods/:id", filterByBranch, deleteUtilityPeriod);

router.post("/:utilityType/readings", filterByBranch, recordUtilityReading);
router.patch("/:utilityType/readings/:id", filterByBranch, updateUtilityReading);
router.delete("/:utilityType/readings/:id", filterByBranch, deleteUtilityReading);

router.patch("/:utilityType/periods/:id/close", filterByBranch, closeUtilityPeriod);
router.post("/:utilityType/periods/:id/send", filterByBranch, sendUtilityPeriod);
router.post("/:utilityType/batch-close", filterByBranch, batchCloseUtilityPeriods);
router.post("/:utilityType/results/:periodId/revise", filterByBranch, reviseUtilityResult);

export default router;
