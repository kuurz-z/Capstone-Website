/**
 * ============================================================================
 * CANCELLATION CONTROLLER
 * ============================================================================
 *
 * Handles reservation cancellations, post-payment cancellation requests, and admin approval/rejection.
 */

import { Reservation, Contract } from "../../models/index.js";
import logger from "../../middleware/logger.js";
import auditLogger from "../../utils/auditLogger.js";
import {
  isValidObjectId,
  invalidIdResponse,
  syncReservationUserLifecycle,
} from "../../utils/reservationHelpers.js";
import {
  normalizeReservationStatus,
} from "../../utils/lifecycleNaming.js";
import { updateOccupancyOnReservationChange } from "../../utils/occupancyManager.js";
import { notify } from "../../utils/notificationService.js";
import { archiveContractForCancelledReservation } from "../../services/contractArchiveService.js";
import {
  resolveTenantCanonicalContract,
  EARLY_STAGE_STATUSES,
} from "../../services/tenantContractSelectionService.js";
import {
  deriveAdvanceCoverageDates,
  deriveContractLeaseDates,
} from "../../services/contractLeaseDateService.js";
import {
  findDbUser,
  notifyAdminsOfCancellationRequest,
  notifyAdminsOfCancellationWithdrawal,
  assertNoActiveStayOrProgressedContract,
} from "./_helpers.js";

const APPLICANT_CANCELLABLE_STATUSES = new Set([
  "pending",
  "viewing_preference_selected",
  "visit_pending",
  "visit_approved",
  "pending_application_review",
  "needs_revision",
  "approved_for_payment",
  "payment_pending",
  "reserved",
]);

const hasPaidReservationFee = (reservation = {}) => {
  const status = normalizeReservationStatus(reservation.status);
  return Boolean(
    reservation.paymentStatus === "paid" ||
      reservation.paymentDate ||
      reservation.reservedAt ||
      status === "reserved" ||
      reservation.paymongoPaymentId,
  );
};

export const cancelReservationByUser = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    const dbUser = await findDbUser(req.user.uid);
    if (!dbUser)
      return res.status(404).json({ error: "User not found.", code: "USER_NOT_FOUND" });

    const reservation = await Reservation.findById(reservationId);
    if (!reservation)
      return res.status(404).json({ error: "Reservation not found.", code: "RESERVATION_NOT_FOUND" });

    if (String(reservation.userId) !== String(dbUser._id))
      return res.status(403).json({
        error: "You can only cancel your own reservation.",
        code: "RESERVATION_ACCESS_DENIED",
      });

    if (normalizeReservationStatus(reservation.status) === "cancelled") {
      return res.status(409).json({
        error: "This reservation is already cancelled.",
        code: "ALREADY_CANCELLED",
      });
    }

    if (hasPaidReservationFee(reservation)) {
      return res.status(409).json({
        error: "This reservation has a paid reservation fee. Please use the cancellation request process.",
        code: "PAID_RESERVATION_MUST_USE_REQUEST_FLOW",
      });
    }

    if (!APPLICANT_CANCELLABLE_STATUSES.has(normalizeReservationStatus(reservation.status))) {
      return res.status(409).json({
        error: `A reservation with status "${reservation.status}" cannot be cancelled by the applicant.`,
        code: "CANCELLATION_NOT_ALLOWED",
      });
    }

    try {
      await assertNoActiveStayOrProgressedContract(reservation._id, dbUser._id);
    } catch (guardErr) {
      return res.status(guardErr.statusCode || 409).json({
        error: guardErr.message,
        code: guardErr.code || "ACTIVE_STAY_OR_CONTRACT_BLOCKS_CANCELLATION",
      });
    }

    const now = new Date();
    const previousStatus = reservation.status;
    const visitHistoryUpdate = [];
    if (reservation.visitDate) {
      visitHistoryUpdate.push(...(reservation.visitHistory || []), {
        visitDate: reservation.visitDate,
        visitTime: reservation.visitTime,
        viewingType: reservation.viewingType || "inperson",
        status: "cancelled",
        scheduledAt: reservation.visitScheduledAt || reservation.createdAt,
      });
    }

    const updates = {
      status: "cancelled",
      cancelledAt: now,
      cancelledBy: dbUser._id,
      cancellationSource: "applicant",
      cancellationReason: req.body.reason || null,
      reservationFeeRefundable: false,
      reservationFeeForfeited: true,
      ...(visitHistoryUpdate.length > 0 && { visitHistory: visitHistoryUpdate }),
    };

    Object.assign(reservation, updates);
    const updated = await reservation.save();
    await updated.populate("userId", "firstName lastName email");
    await updated.populate("roomId", "name branch type");

    try {
      await updateOccupancyOnReservationChange(updated, { status: previousStatus });
    } catch (occupancyErr) {
      logger.warn({ err: occupancyErr, reservationId }, "Cancel: occupancy update failed (non-fatal)");
    }

    try {
      await syncReservationUserLifecycle({
        status: "cancelled",
        previousStatus,
        userId: dbUser._id,
        roomId: reservation.roomId,
        reservationId: reservation._id,
      });
    } catch (lifecycleErr) {
      logger.warn({ err: lifecycleErr, reservationId }, "Cancel: lifecycle sync failed (non-fatal)");
    }

    try {
      await archiveContractForCancelledReservation({ reservationId: reservation._id, actorId: dbUser._id });
    } catch (contractArchiveErr) {
      logger.warn({ err: contractArchiveErr, reservationId }, "Cancel: early-stage Contract archive failed (non-fatal)");
    }

    const notifCode = updated.reservationCode || null;
    notify
      .reservationCancelled(dbUser._id, notifCode, req.body.reason || "Cancelled by applicant")
      .catch((e) => logger.warn({ err: e }, "Cancel notification failed (non-fatal)"));

    await auditLogger.logModification(
      req,
      "reservation",
      reservation._id,
      previousStatus ? { status: previousStatus } : null,
      updated.toObject(),
      `Reservation cancelled by applicant (${dbUser.firstName || dbUser.email})`,
    );

    return res.json({
      message: "Reservation cancelled. The reservation fee is non-refundable.",
      reservation: updated,
      feeForfeited: true,
    });
  } catch (error) {
    next(error);
  }
};

export const requestCancellationByUser = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    const dbUser = await findDbUser(req.user.uid);
    if (!dbUser)
      return res.status(404).json({ error: "User not found.", code: "USER_NOT_FOUND" });

    const reservation = await Reservation.findById(reservationId);
    if (!reservation)
      return res.status(404).json({ error: "Reservation not found.", code: "NOT_FOUND" });

    if (String(reservation.userId) !== String(dbUser._id))
      return res.status(403).json({ error: "Unauthorized.", code: "UNAUTHORIZED" });

    if (!hasPaidReservationFee(reservation)) {
      return res.status(409).json({
        error: "This reservation has not been paid. Use the direct cancel instead.",
        code: "NOT_PAID_USE_DIRECT_CANCEL",
      });
    }

    const normalizedStatus = normalizeReservationStatus(reservation.status);
    if (!APPLICANT_CANCELLABLE_STATUSES.has(normalizedStatus)) {
      return res.status(409).json({
        error: `A reservation with status "${reservation.status}" cannot be cancelled.`,
        code: "CANCELLATION_NOT_ALLOWED",
      });
    }

    try {
      await assertNoActiveStayOrProgressedContract(reservation._id, dbUser._id);
    } catch (guardErr) {
      return res.status(guardErr.statusCode || 409).json({
        error: guardErr.message,
        code: guardErr.code || "ACTIVE_STAY_OR_CONTRACT_BLOCKS_CANCELLATION",
      });
    }

    if (reservation.cancellationRequested && reservation.cancellationStatus === "pending") {
      notifyAdminsOfCancellationRequest(reservation, dbUser).catch((notifyErr) => {
        logger.warn({ err: notifyErr }, "[CancelRequest] Pending request admin notification failed (non-fatal)");
      });
      return res.status(409).json({
        error: "A cancellation request is already pending review.",
        code: "CANCELLATION_REQUEST_ALREADY_PENDING",
      });
    }

    const oldData = reservation.toObject();
    const now = new Date();
    reservation.cancellationRequested = true;
    reservation.cancellationRequestedAt = now;
    reservation.cancellationRequestedBy = dbUser._id;
    reservation.cancellationStatus = "pending";
    const userReason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    reservation.cancellationReason = userReason || "Cancellation requested by tenant";
    await reservation.save();

    await auditLogger.logModification(
      req,
      "reservation",
      reservation._id,
      oldData,
      reservation.toObject(),
      "Cancellation request submitted",
    );

    await notify.cancellationRequested(dbUser._id, reservation.reservationCode).catch((notifyErr) => {
      logger.warn({ err: notifyErr }, "[CancelRequest] Tenant notification failed (non-fatal)");
    });

    try {
      await notifyAdminsOfCancellationRequest(reservation, dbUser);
    } catch (notifyErr) {
      logger.warn({ err: notifyErr }, "[CancelRequest] Admin notification failed (non-fatal)");
    }

    res.json({ message: "Cancellation request submitted. Pending admin review.", reservation });
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, "requestCancellationByUser error");
    next(error);
  }
};

export const withdrawCancellationRequestByUser = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    const dbUser = await findDbUser(req.user.uid);
    if (!dbUser)
      return res.status(404).json({ error: "User not found.", code: "USER_NOT_FOUND" });

    const reservation = await Reservation.findById(reservationId);
    if (!reservation)
      return res.status(404).json({ error: "Reservation not found.", code: "NOT_FOUND" });

    if (String(reservation.userId) !== String(dbUser._id))
      return res.status(403).json({ error: "Unauthorized.", code: "UNAUTHORIZED" });

    if (!reservation.cancellationRequested || reservation.cancellationStatus !== "pending") {
      return res.status(409).json({
        error: "No pending cancellation request found to withdraw.",
        code: "NO_PENDING_CANCELLATION_REQUEST",
      });
    }

    const oldData = reservation.toObject();
    reservation.cancellationRequested = false;
    reservation.cancellationStatus = null;
    reservation.cancellationReason = null;
    reservation.cancellationRequestedAt = null;
    reservation.cancellationRequestedBy = null;
    await reservation.save();

    await auditLogger.logModification(
      req,
      "reservation",
      reservation._id,
      oldData,
      reservation.toObject(),
      "Cancellation request withdrawn by applicant",
    );

    try {
      await notifyAdminsOfCancellationWithdrawal(reservation, dbUser);
    } catch (notifyErr) {
      logger.warn({ err: notifyErr }, "[CancelRequestWithdraw] Admin notification failed (non-fatal)");
    }

    return res.json({
      message: "Cancellation request withdrawn. Your reservation remains active.",
      reservation,
    });
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, "withdrawCancellationRequestByUser error");
    next(error);
  }
};

export const approveCancellationRequest = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    const dbUser = await findDbUser(req.user.uid);
    if (!dbUser)
      return res.status(404).json({ error: "User not found.", code: "USER_NOT_FOUND" });

    const reservation = await Reservation.findById(reservationId).populate("roomId");
    if (!reservation)
      return res.status(404).json({ error: "Reservation not found.", code: "NOT_FOUND" });

    if (!reservation.cancellationRequested || reservation.cancellationStatus !== "pending") {
      return res.status(409).json({
        error: "No pending cancellation request found for this reservation.",
        code: "NO_PENDING_REQUEST",
      });
    }

    const currentStatus = normalizeReservationStatus(reservation.status);
    if (currentStatus === "moveIn" || currentStatus === "moveOut") {
      return res.status(409).json({
        error: "Cannot cancel a reservation for a tenant who has already moved in. Please use the Move-Out or Early Termination workflow instead.",
        code: "TENANT_ALREADY_MOVED_IN",
      });
    }

    try {
      await assertNoActiveStayOrProgressedContract(reservation._id, reservation.userId);
    } catch (guardErr) {
      return res.status(guardErr.statusCode || 409).json({
        error: guardErr.message,
        code: guardErr.code || "ACTIVE_STAY_OR_CONTRACT_BLOCKS_CANCELLATION",
      });
    }

    const now = new Date();
    const adminNote = req.body.note || null;
    const oldData = reservation.toObject();
    const previousStatus = reservation.status;

    const visitHistoryUpdate = [];
    if (reservation.visitDate) {
      visitHistoryUpdate.push(...(reservation.visitHistory || []), {
        visitDate: reservation.visitDate,
        visitTime: reservation.visitTime,
        viewingType: reservation.viewingType || "inperson",
        status: "cancelled",
        scheduledAt: reservation.visitScheduledAt || reservation.createdAt,
      });
    }

    reservation.status = "cancelled";
    reservation.cancelledAt = now;
    reservation.cancelledBy = dbUser._id;
    reservation.cancellationSource = "admin";
    reservation.reservationFeeRefundable = false;
    reservation.reservationFeeForfeited = true;
    reservation.cancellationStatus = "approved";
    reservation.cancellationReviewedAt = now;
    reservation.cancellationReviewedBy = dbUser._id;
    reservation.cancellationAdminNote = adminNote;

    const existingReason =
      typeof reservation.cancellationReason === "string"
        ? reservation.cancellationReason.trim()
        : "";
    const noteReason =
      typeof adminNote === "string" ? adminNote.trim() : "";
    reservation.cancellationReason =
      existingReason || noteReason || "Tenant cancellation request approved by admin";
    if (visitHistoryUpdate.length > 0) reservation.visitHistory = visitHistoryUpdate;
    reservation.visitDate = null;
    reservation.visitTime = null;
    reservation.visitScheduledAt = null;
    await reservation.save();

    try {
      await updateOccupancyOnReservationChange(
        {
          ...reservation.toObject(),
          roomId: reservation.roomId?._id || reservation.roomId,
        },
        oldData,
      );
    } catch (occupancyErr) {
      logger.warn(
        { err: occupancyErr, requestId: req.id },
        "[ApproveCancellation] Occupancy update failed (non-fatal)",
      );
    }

    await syncReservationUserLifecycle({
      status: "cancelled",
      previousStatus,
      userId: reservation.userId,
      roomId: reservation.roomId,
      reservationId: reservation._id,
    }).catch((err) => logger.warn({ err }, "[ApproveCancellation] User lifecycle sync failed (non-fatal)"));

    await archiveContractForCancelledReservation({ reservationId: reservation._id, actorId: dbUser._id })
      .catch((err) => logger.warn({ err }, "[ApproveCancellation] Early-stage Contract archive failed (non-fatal)"));

    await auditLogger.logModification(
      req,
      "reservation",
      reservation._id,
      oldData,
      reservation.toObject(),
      "Cancellation request approved",
    );

    await notify.cancellationApproved(reservation.userId, reservation.reservationCode).catch((notifyErr) => {
      logger.warn({ err: notifyErr }, "[ApproveCancellation] Tenant notification failed (non-fatal)");
    });

    res.json({ message: "Cancellation request approved. Reservation cancelled and bed released.", reservation });
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, "approveCancellationRequest error");
    next(error);
  }
};

export const rejectCancellationRequest = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    const dbUser = await findDbUser(req.user.uid);
    if (!dbUser)
      return res.status(404).json({ error: "User not found.", code: "USER_NOT_FOUND" });

    const reservation = await Reservation.findById(reservationId);
    if (!reservation)
      return res.status(404).json({ error: "Reservation not found.", code: "NOT_FOUND" });

    if (!reservation.cancellationRequested || reservation.cancellationStatus !== "pending") {
      return res.status(409).json({
        error: "No pending cancellation request found for this reservation.",
        code: "NO_PENDING_REQUEST",
      });
    }

    const now = new Date();
    const adminNote = req.body.note || null;
    const oldData = reservation.toObject();

    reservation.cancellationStatus = "rejected";
    reservation.cancellationReviewedAt = now;
    reservation.cancellationReviewedBy = dbUser._id;
    reservation.cancellationAdminNote = adminNote;
    reservation.cancellationRequested = false;
    await reservation.save();

    await auditLogger.logModification(
      req,
      "reservation",
      reservation._id,
      oldData,
      reservation.toObject(),
      "Cancellation request rejected",
    );

    await notify.cancellationRejected(reservation.userId, reservation.reservationCode, adminNote).catch((notifyErr) => {
      logger.warn({ err: notifyErr }, "[RejectCancellation] Tenant notification failed (non-fatal)");
    });

    res.json({ message: "Cancellation request rejected. Reservation remains active.", reservation });
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, "rejectCancellationRequest error");
    next(error);
  }
};

export const requestPreMoveInModification = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    const { requestedMoveInDate, reason } = req.body;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    const dbUser = await findDbUser(req.user.uid);
    if (!dbUser) return res.status(404).json({ error: "User not found.", code: "USER_NOT_FOUND" });

    const reservation = await Reservation.findById(reservationId);
    if (!reservation) return res.status(404).json({ error: "Reservation not found.", code: "NOT_FOUND" });

    if (String(reservation.userId) !== String(dbUser._id)) {
      return res.status(403).json({ error: "Unauthorized.", code: "UNAUTHORIZED" });
    }

    const currentStatus = normalizeReservationStatus(reservation.status);
    if (currentStatus === "moveIn" || currentStatus === "moveOut" || currentStatus === "cancelled") {
      return res.status(409).json({
        error: "Pre-move-in modification is only allowed before move-in.",
        code: "MODIFICATION_NOT_ALLOWED",
      });
    }

    const now = new Date();
    reservation.modificationRequested = true;
    reservation.modificationRequestedAt = now;
    reservation.modificationStatus = "pending";
    reservation.modificationDetails = {
      requestedMoveInDate: requestedMoveInDate ? new Date(requestedMoveInDate) : null,
      reason: reason || "",
      adminNote: "",
      reviewedAt: null,
      reviewedBy: null,
    };
    await reservation.save();

    res.json({ message: "Modification request submitted successfully for admin review.", reservation });
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, "requestPreMoveInModification error");
    next(error);
  }
};

export const approvePreMoveInModification = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    const dbUser = await findDbUser(req.user.uid);
    if (!dbUser) return res.status(404).json({ error: "User not found.", code: "USER_NOT_FOUND" });

    const reservation = await Reservation.findById(reservationId);
    if (!reservation) return res.status(404).json({ error: "Reservation not found.", code: "NOT_FOUND" });

    if (!reservation.modificationRequested || reservation.modificationStatus !== "pending") {
      return res.status(409).json({
        error: "No pending modification request found for this reservation.",
        code: "NO_PENDING_MODIFICATION",
      });
    }

    const now = new Date();
    const details = reservation.modificationDetails || {};
    if (details.requestedMoveInDate) {
      reservation.intendedMoveInDate = details.requestedMoveInDate;
      reservation.targetMoveInDate = details.requestedMoveInDate;
      reservation.moveInDate = details.requestedMoveInDate;
    }

    reservation.modificationStatus = "approved";
    reservation.modificationRequested = false;
    reservation.modificationDetails = {
      ...details,
      adminNote: req.body.note || "Approved by admin",
      reviewedAt: now,
      reviewedBy: dbUser._id,
    };
    await reservation.save();

    // Reschedule Move-In: if a Contract already exists for this reservation,
    // its leaseStartDate/advance-coverage dates are derived from the
    // original move-in date and would go stale the moment the reservation's
    // move-in date changes. A draft (still pre-generation) is safe to
    // update in place — it's a plain field mutation, not a status
    // transition, and nothing has been generated/signed against the old
    // date yet. A Contract that has already progressed past early-stage
    // must NOT be silently altered (it may already be generated, signed, or
    // notarized against the old date) — flag it for admin review instead.
    let contractDateSync = null;
    if (details.requestedMoveInDate) {
      try {
        const contract = await resolveTenantCanonicalContract(reservation.userId, {
          includeEarlyStages: true,
        });
        if (contract) {
          if (EARLY_STAGE_STATUSES.has(contract.status)) {
            const duration = Number(contract.leaseDurationMonths || reservation.leaseDuration || 12);
            const leaseDates = deriveContractLeaseDates({
              leaseStartDate: details.requestedMoveInDate,
              leaseDurationMonths: duration,
            });
            const coverageDates = deriveAdvanceCoverageDates(details.requestedMoveInDate);
            // leaseStartDate/leaseEndDate are schema-immutable (Contract.js)
            // once set — deliberately, to stop a progressed Contract's dates
            // from being silently rewritten. A still-draft Contract's dates
            // are a legitimate, narrow exception (mirrors the same raw
            // collection.updateOne bypass contractDraftRecoveryService.js
            // already uses to backfill a draft's dates), gated here on the
            // same still-draft/early-stage precondition just verified above.
            await Contract.collection.updateOne(
              { _id: contract._id },
              {
                $set: {
                  leaseStartDate: leaseDates.leaseStartDate,
                  leaseEndDate: leaseDates.leaseEndDate,
                  advanceCoverageStart: coverageDates.advanceCoverageStart,
                  advanceCoverageEnd: coverageDates.advanceCoverageEnd,
                  updatedBy: dbUser._id,
                  updatedAt: now,
                },
              },
            );
            contractDateSync = { contractId: String(contract._id), action: "dates_updated" };
          } else {
            await Contract.updateOne(
              { _id: contract._id },
              {
                $push: {
                  staleDataFlags: {
                    field: "leaseStartDate",
                    flaggedAt: now,
                    reason: "movein_rescheduled_after_generation",
                  },
                },
              },
            );
            contractDateSync = { contractId: String(contract._id), action: "flagged_stale" };
          }
        }
      } catch (contractSyncErr) {
        logger.warn(
          { err: contractSyncErr, reservationId: reservation._id },
          "[ApprovePreMoveInModification] Contract date sync/flag failed (non-fatal)",
        );
      }
    }

    res.json({
      message: "Modification request approved successfully.",
      reservation,
      contractDateSync,
    });
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, "approvePreMoveInModification error");
    next(error);
  }
};

export const rejectPreMoveInModification = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    const dbUser = await findDbUser(req.user.uid);
    if (!dbUser) return res.status(404).json({ error: "User not found.", code: "USER_NOT_FOUND" });

    const reservation = await Reservation.findById(reservationId);
    if (!reservation) return res.status(404).json({ error: "Reservation not found.", code: "NOT_FOUND" });

    if (!reservation.modificationRequested || reservation.modificationStatus !== "pending") {
      return res.status(409).json({
        error: "No pending modification request found for this reservation.",
        code: "NO_PENDING_MODIFICATION",
      });
    }

    const now = new Date();
    const details = reservation.modificationDetails || {};

    reservation.modificationStatus = "rejected";
    reservation.modificationRequested = false;
    reservation.modificationDetails = {
      ...details,
      adminNote: req.body.note || "Rejected by admin",
      reviewedAt: now,
      reviewedBy: dbUser._id,
    };
    await reservation.save();

    res.json({ message: "Modification request rejected.", reservation });
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, "rejectPreMoveInModification error");
    next(error);
  }
};
