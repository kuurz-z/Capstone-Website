import express from "express";
import { verifyOwner, verifyToken } from "../middleware/auth.js";
import { getOwnerBranchSummaries } from "../controllers/branchSummaryController.js";

const router = express.Router();

router.get("/summary", verifyToken, verifyOwner, getOwnerBranchSummaries);

export default router;
