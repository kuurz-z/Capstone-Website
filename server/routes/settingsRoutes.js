import express from "express";
import { verifyAdmin, verifyOwner, verifyToken } from "../middleware/auth.js";
import {
  getBusinessRules,
  updateBranchBillingSettings,
  updateBusinessRules,
} from "../controllers/settingsController.js";

const router = express.Router();

router.get("/business", verifyToken, verifyAdmin, getBusinessRules);
router.patch("/business", verifyToken, verifyOwner, updateBusinessRules);
router.patch("/branch/:branch", verifyToken, verifyOwner, updateBranchBillingSettings);

export default router;
