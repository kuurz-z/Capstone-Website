import express from "express";
import { verifyAdmin, verifyApplicant, verifyToken } from "../middleware/auth.js";
import { requireAnyPermission } from "../middleware/permissions.js";
import {
  cancelMyTenantTransferRequest,
  createMyTenantTransferRequest,
  declineTenantTransferRequestAction,
  getMyTenantTransferRequest,
  getMyTenantRoomTransferPreferences,
} from "../controllers/tenantTransferRequestController.js";

const router = express.Router();

router.post("/room-transfer-requests", verifyToken, verifyApplicant, createMyTenantTransferRequest);
router.get("/room-transfer-request/current", verifyToken, verifyApplicant, getMyTenantTransferRequest);
router.get(
  "/room-transfer-preferences",
  verifyToken,
  verifyApplicant,
  getMyTenantRoomTransferPreferences,
);
router.patch(
  "/room-transfer-requests/:id/cancel",
  verifyToken,
  verifyApplicant,
  cancelMyTenantTransferRequest,
);
router.patch(
  "/room-transfer-requests/:id/decline",
  verifyToken,
  verifyAdmin,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  declineTenantTransferRequestAction,
);

export default router;
