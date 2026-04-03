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
  reviseUtilityResult
} from "../controllers/utilityBillingController.js";
import { verifyToken, verifyAdmin } from "../middleware/auth.js";

const router = express.Router();

router.use(verifyToken);
router.use(verifyAdmin);

// Diagnostics (Shared)
router.get("/diagnostics", getUtilityDiagnosticsApi);

// Query routes
router.get("/:utilityType/rooms", getUtilityRooms);
router.get("/:utilityType/readings/:roomId/latest", getUtilityLatestReading);
router.get("/:utilityType/readings/:roomId", getUtilityReadings);
router.get("/:utilityType/periods/:roomId", getUtilityPeriods);
router.get("/:utilityType/results/:periodId", getUtilityResult);

// Utility agnostic routes
router.post("/:utilityType/periods", openUtilityPeriod);
router.patch("/:utilityType/periods/:id", updateUtilityPeriod);
router.delete("/:utilityType/periods/:id", deleteUtilityPeriod);

router.post("/:utilityType/readings", recordUtilityReading);
router.patch("/:utilityType/readings/:id", updateUtilityReading);
router.delete("/:utilityType/readings/:id", deleteUtilityReading);

router.patch("/:utilityType/periods/:id/close", closeUtilityPeriod);
router.post("/:utilityType/batch-close", batchCloseUtilityPeriods);
router.post("/:utilityType/results/:periodId/revise", reviseUtilityResult);

export default router;
