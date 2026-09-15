import { getRoomTransferError } from "../utils/roomTransferErrors.js";
import {
  cancelTenantTransferRequest,
  createTenantTransferRequest,
  declineTenantTransferRequest,
  getTenantRoomTransferPreferences,
  getTenantTransferLifecycle,
} from "../services/tenantTransferRequestService.js";
import auditLogger from "../utils/auditLogger.js";
import logger from "../middleware/logger.js";

const actorTenantId = (req) => req.mobileTenant?._id || req.authUser?._id || null;

const sendServiceError = (res, error, fallbackCode) =>
  res.status(error?.statusCode || 500).json({
    error: getRoomTransferError(error),
    detail: getRoomTransferError(error),
    code: error?.code || fallbackCode,
  });

export async function createMyTenantTransferRequest(req, res) {
  try {
    const tenantId = actorTenantId(req);
    const request = await createTenantTransferRequest({ tenantId, payload: req.body });
    return res.status(201).json({
      message: "Room transfer request submitted.",
      request,
    });
  } catch (error) {
    logger.warn({ err: error, requestId: req.id }, "Create tenant room transfer request failed");
    return sendServiceError(res, error, "TRANSFER_REQUEST_CREATE_FAILED");
  }
}

export async function getMyTenantTransferRequest(req, res) {
  try {
    const lifecycle = await getTenantTransferLifecycle(actorTenantId(req));
    res.setHeader("Cache-Control", "private, no-store");
    return res.json(lifecycle);
  } catch (error) {
    logger.warn({ err: error, requestId: req.id }, "Get tenant room transfer lifecycle failed");
    return sendServiceError(res, error, "TRANSFER_REQUEST_READ_FAILED");
  }
}

export async function getMyTenantRoomTransferPreferences(req, res) {
  try {
    const rooms = await getTenantRoomTransferPreferences(actorTenantId(req));
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({ rooms });
  } catch (error) {
    logger.warn({ err: error, requestId: req.id }, "Get tenant room preferences failed");
    return sendServiceError(res, error, "TRANSFER_PREFERENCES_READ_FAILED");
  }
}

export async function cancelMyTenantTransferRequest(req, res) {
  try {
    const request = await cancelTenantTransferRequest({
      requestId: req.params.id,
      tenantId: actorTenantId(req),
    });
    return res.json({ message: "Room transfer request cancelled.", request });
  } catch (error) {
    logger.warn({ err: error, requestId: req.id }, "Cancel tenant room transfer request failed");
    return sendServiceError(res, error, "TRANSFER_REQUEST_CANCEL_FAILED");
  }
}

export async function declineTenantTransferRequestAction(req, res) {
  try {
    const request = await declineTenantTransferRequest({
      requestId: req.params.id,
      actorId: req.authUser?._id || null,
      actorRole: req.authUser?.role || "",
      actorBranch: req.authUser?.branch || "",
      declineReason: req.body?.declineReason || "",
    });
    await auditLogger.logModification(
      req,
      "tenant_transfer_request",
      req.params.id,
      { status: "pending" },
      { status: "declined", declineReason: request.declineReason || "" },
      "Tenant room transfer request declined",
    );
    return res.json({ message: "Room transfer request declined.", request });
  } catch (error) {
    logger.warn({ err: error, requestId: req.id }, "Decline tenant room transfer request failed");
    return sendServiceError(res, error, "TRANSFER_REQUEST_DECLINE_FAILED");
  }
}
