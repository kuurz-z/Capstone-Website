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

router.patch('/room-transfer-requests/:id/acknowledge', verifyToken, verifyAdmin,
  requireAnyPermission(['manageReservations', 'manageTenants']), async (req, res) => {
    try { const { acknowledgeTenancyRequest } = await import("../services/requestAcknowledgementService.js"); res.json({ request: await acknowledgeTenancyRequest({ kind: 'transfer', requestId: req.params.id, actor: req.authUser }) }); }
    catch (error) { res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Unable to acknowledge request.' }); }
  });

export default router;
