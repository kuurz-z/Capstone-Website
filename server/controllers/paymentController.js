/**
 * ============================================================================
 * PAYMENT CONTROLLER - PAYMONGO INTEGRATION
 * ============================================================================
 *
 * Handles online payment checkout sessions and client-side payment polling.
 * The webhook remains the canonical settlement path; polling is a tenant-safe
 * convenience path and must be idempotent.
 *
 * ============================================================================
 */

import dayjs from "dayjs";
import {
  createCheckoutSession,
  getCheckoutSession,
} from "../config/paymongo.js";
import { Bill, Payment, Reservation, User } from "../models/index.js";
import logger from "../middleware/logger.js";
import {
  sendPaymentApprovedEmail,
  sendPaymentReceiptEmail,
} from "../config/email.js";
import { BUSINESS } from "../config/constants.js";
import { getReservationFeeAmount } from "../utils/businessSettings.js";
import { settlePaymongoBill } from "../utils/billSettlement.js";
import { validateInvoiceVersionForCheckout } from "../services/penaltyEngineService.js";
import {
  getBillRemainingAmount,
  getVisibleBillSnapshot,
  resolveBillStatus,
} from "../utils/billingPolicy.js";
import { hasReservationStatus } from "../utils/lifecycleNaming.js";
import { notify } from "../utils/notificationService.js";
import { sendSuccess, AppError } from "../middleware/errorHandler.js";
import { normalizeReservationStatus } from "../utils/lifecycleNaming.js";
import { isOwnerRole } from "../config/roles.js";
import { settleReservationDeposit } from "../services/reservationDepositSettlementService.js";
import auditLogger from "../utils/auditLogger.js";
import { getPublicUrlConfig } from "../config/publicUrls.js";
import { readPaidPayments, readPaymentMethod } from "../utils/paymongoPaymentMethod.js";
import { resolveReservationFinancials } from "../utils/depositUtils.js";

const FRONTEND_URL = getPublicUrlConfig().publicFrontendUrl;
const TENANT_BILLING_PATH = "/applicant/billing";

function isDepositCheckoutReady(reservation) {
  return (
    hasReservationStatus(reservation?.status, "approved_for_payment", "payment_pending") &&
    Boolean(reservation?.applicationSubmittedAt)
  );
}

async function getDbUser(firebaseUid) {
  return User.findOne({ firebaseUid }).lean();
}

const hasBillingPermission = (user) =>
  isOwnerRole(user?.role) ||
  (user?.role === "branch_admin" &&
    Array.isArray(user.permissions) &&
    user.permissions.includes("manageBilling"));

async function resolveSessionResourceAccess(metadata, dbUser) {
  if (metadata.userId && String(metadata.userId) !== String(dbUser._id)) {
    throw new AppError(
      "You can only inspect your own checkout sessions",
      403,
      "FORBIDDEN",
    );
  }

  if (metadata.type === "bill" && metadata.billId) {
    const bill = await Bill.findById(metadata.billId);
    if (!bill) throw new AppError("Bill not found", 404, "BILL_NOT_FOUND");
    if (String(bill.userId) !== String(dbUser._id)) {
      throw new AppError("You can only inspect your own bills", 403, "FORBIDDEN");
    }
    return { bill, reservation: null };
  }

  if (metadata.type === "multi_bill") {
    let billIds = [];
    try {
      billIds = Array.isArray(metadata.billIds)
        ? metadata.billIds
        : JSON.parse(metadata.billIds || "[]");
    } catch {
      billIds = [];
    }
    if (billIds.length > 0) {
      const bills = await Bill.find({ _id: { $in: billIds } });
      for (const b of bills) {
        if (String(b.userId) !== String(dbUser._id)) {
          throw new AppError("You can only inspect your own bills", 403, "FORBIDDEN");
        }
      }
      return { bill: null, reservation: null, bills };
    }
  }

  if (metadata.type === "deposit" && metadata.reservationId) {
    const reservation = await Reservation.findById(metadata.reservationId).populate(
      "roomId",
      "name branch",
    );
    if (!reservation) {
      throw new AppError(
        "Reservation not found",
        404,
        "RESERVATION_NOT_FOUND",
      );
    }
    if (String(reservation.userId) !== String(dbUser._id)) {
      throw new AppError(
        "You can only inspect your own reservations",
        403,
        "FORBIDDEN",
      );
    }
    return { bill: null, reservation };
  }

  return { bill: null, reservation: null };
}

export const createBillCheckout = async (req, res, next) => {
  try {
    const { billId } = req.params;
    const dbUser = await getDbUser(req.user.uid);
    if (!dbUser) throw new AppError("User not found", 404, "USER_NOT_FOUND");

    const bill = await Bill.findById(billId);
    if (!bill) throw new AppError("Bill not found", 404, "BILL_NOT_FOUND");

    if (String(bill.userId) !== String(dbUser._id)) {
      throw new AppError("You can only pay your own bills", 403, "FORBIDDEN");
    }

    const expectedVersion = req.body?.expectedVersion ?? req.query?.expectedVersion;
    if (expectedVersion !== undefined && expectedVersion !== null) {
      const versionCheck = await validateInvoiceVersionForCheckout(billId, expectedVersion);
      if (!versionCheck.valid) {
        throw new AppError(versionCheck.reason, 409, "INVOICE_VERSION_STALE");
      }
    }

    if (getVisibleBillSnapshot(bill).status === "paid") {
      throw new AppError("Bill is already paid", 400, "ALREADY_PAID");
    }

    bill.remainingAmount = getBillRemainingAmount(bill);
    bill.status = resolveBillStatus(bill);
    const visibleBill = getVisibleBillSnapshot(bill);
    const amountDue = visibleBill.remainingAmount;
    if (amountDue <= 0) {
      throw new AppError("No visible balance is currently due", 400, "NO_BALANCE_DUE");
    }

    if (bill.paymongoSessionId) {
      try {
        const existing = await getCheckoutSession(bill.paymongoSessionId);
        const existingUrl = existing?.attributes?.checkout_url;
        const existingPayments = existing?.attributes?.payments || [];
        const existingPaidPayments = readPaidPayments(existing);

        if (existingPaidPayments.length > 0) {
          // The session was already paid — settle the bill and inform the frontend.
          logger.info(
            { billId: String(bill._id), sessionId: bill.paymongoSessionId },
            "createBillCheckout: existing session already paid — settling",
          );
          const paymentReference = existingPaidPayments[0]?.id || bill.paymongoSessionId;
          const paidAmount = Number(existingPaidPayments[0]?.attributes?.amount || 0) / 100;
          const settledAmount = paidAmount > 0 ? paidAmount : Number(existing?.attributes?.metadata?.amountDue || 0);
          await settlePaymongoBill({
            bill,
            paymentReference,
            settledAmount,
            source: "paymongo-polling",
            metadata: {
              sessionId: bill.paymongoSessionId,
              sessionType: "bill",
              currency: "PHP",
            },
          });
          throw new AppError("Bill is already paid", 400, "ALREADY_PAID");
        }

        if (existingUrl && existingPayments.length === 0) {
          const existingAmountCents =
            existing?.attributes?.line_items?.[0]?.amount ??
            Math.round(Number(existing?.attributes?.metadata?.amountDue || 0) * 100);
          if (existingAmountCents === Math.round(amountDue * 100)) {
            return sendSuccess(res, {
              checkoutUrl: existingUrl,
              sessionId: bill.paymongoSessionId,
              reused: true,
            });
          }
        }
      } catch (err) {
        if (err?.code === "ALREADY_PAID") throw err;
        // Expired, invalid, or amount-mismatch session: create a fresh one below.
        logger.warn({ err: err.message, sessionId: bill.paymongoSessionId }, "Stale PayMongo session — creating fresh checkout");
      }
    }

    const isInitialPayment = bill.billType === "initial_payment";
    const monthLabel = dayjs(bill.billingMonth).format("MMMM YYYY");
    const checkoutIdempotencyKey = `bill:${bill._id}:balance:${Math.round(amountDue * 100)}`;
    const { checkoutUrl, sessionId } = await createCheckoutSession({
      amount: amountDue,
      description: isInitialPayment
        ? "Lilycrest Dormitory - Remaining Initial Balance"
        : `Lilycrest Dormitory - ${monthLabel} Bill`,
      metadata: {
        type: "bill",
        purpose: isInitialPayment ? "initial_payment" : "regular_bill",
        billId: String(bill._id),
        userId: String(dbUser._id),
        amountDue: String(amountDue),
      },
      successUrl: `${FRONTEND_URL}${TENANT_BILLING_PATH}?payment=success&session_id={id}`,
      cancelUrl: `${FRONTEND_URL}${TENANT_BILLING_PATH}?payment=cancelled&session_id={id}`,
      idempotencyKey: checkoutIdempotencyKey,
    });

    bill.paymongoSessionId = sessionId;
    bill.paymongoCheckoutIdempotencyKey = checkoutIdempotencyKey;
    await bill.save();
    await auditLogger.log({
      req,
      type: "data_modification",
      action: "payment.paymongo_checkout_created",
      severity: "info",
      entityType: "bill",
      entityId: bill._id,
      details: "Created or refreshed a PayMongo Bill checkout.",
      metadata: {
        billId: String(bill._id),
        reservationId: bill.reservationId ? String(bill.reservationId) : null,
        workflowVersion: bill.structuredWorkflowVersion || null,
        amount: amountDue,
        currency: "PHP",
      },
    });

    sendSuccess(res, { checkoutUrl, sessionId });
  } catch (error) {
    next(error);
  }
};

export const createMultiBillCheckout = async (req, res, next) => {
  try {
    const { billIds } = req.body;
    if (!Array.isArray(billIds) || billIds.length === 0) {
      throw new AppError("billIds must be a non-empty array", 400, "INVALID_BILL_IDS");
    }

    const dbUser = await getDbUser(req.user.uid);
    if (!dbUser) throw new AppError("User not found", 404, "USER_NOT_FOUND");

    const bills = await Bill.find({
      _id: { $in: billIds },
      userId: dbUser._id,
      isArchived: { $ne: true },
    });

    if (bills.length !== billIds.length) {
      throw new AppError("One or more selected bills were not found", 404, "BILL_NOT_FOUND");
    }

    let totalDue = 0;
    const payableBills = [];

    for (const bill of bills) {
      bill.remainingAmount = getBillRemainingAmount(bill);
      bill.status = resolveBillStatus(bill);
      const visible = getVisibleBillSnapshot(bill);
      if (visible.status === "paid" || visible.remainingAmount <= 0) {
        continue;
      }
      totalDue += visible.remainingAmount;
      payableBills.push(bill);
    }

    totalDue = Math.round(totalDue * 100) / 100;

    if (payableBills.length === 0 || totalDue <= 0) {
      throw new AppError("All selected bills are already paid or have no remaining balance", 400, "NO_BALANCE_DUE");
    }

    const validBillIds = payableBills.map((b) => String(b._id));
    const sortedBillIdsStr = [...validBillIds].sort().join("_");
    const checkoutIdempotencyKey = `multi_bill:${sortedBillIdsStr}:balance:${Math.round(totalDue * 100)}`;

    const { checkoutUrl, sessionId } = await createCheckoutSession({
      amount: totalDue,
      description: `Lilycrest Dormitory - Consolidated Statement Payment (${payableBills.length} Bill${payableBills.length === 1 ? "" : "s"})`,
      metadata: {
        type: "multi_bill",
        billIds: JSON.stringify(validBillIds),
        userId: String(dbUser._id),
        amountDue: String(totalDue),
      },
      successUrl: `${FRONTEND_URL}${TENANT_BILLING_PATH}?payment=success&session_id={id}`,
      cancelUrl: `${FRONTEND_URL}${TENANT_BILLING_PATH}?payment=cancelled&session_id={id}`,
      idempotencyKey: checkoutIdempotencyKey,
    });

    await Bill.updateMany(
      { _id: { $in: validBillIds } },
      {
        $set: {
          paymongoSessionId: sessionId,
          paymongoCheckoutIdempotencyKey: checkoutIdempotencyKey,
        },
      },
    );

    await auditLogger.log({
      req,
      type: "data_modification",
      action: "payment.paymongo_multi_bill_checkout_created",
      severity: "info",
      entityType: "bill",
      entityId: payableBills[0]._id,
      details: `Created PayMongo batch checkout for ${payableBills.length} bills totaling ₱${totalDue}.`,
      metadata: {
        billIds: validBillIds,
        amount: totalDue,
        currency: "PHP",
      },
    });

    sendSuccess(res, { checkoutUrl, sessionId, totalAmount: totalDue, billCount: payableBills.length });
  } catch (error) {
    next(error);
  }
};

export const createDepositCheckout = async (req, res, next) => {
  try {
    const { resId } = req.params;
    const dbUser = await getDbUser(req.user.uid);
    if (!dbUser) throw new AppError("User not found", 404, "USER_NOT_FOUND");

    const reservation = await Reservation.findById(resId).populate("roomId");
    if (!reservation) {
      throw new AppError(
        "Reservation not found",
        404,
        "RESERVATION_NOT_FOUND",
      );
    }

    if (String(reservation.userId) !== String(dbUser._id)) {
      throw new AppError(
        "You can only pay for your own reservation",
        403,
        "FORBIDDEN",
      );
    }

    if (reservation.paymentStatus === "paid") {
      throw new AppError("Deposit is already paid", 400, "ALREADY_PAID");
    }

    if (!hasReservationStatus(reservation.status, "approved_for_payment", "payment_pending")) {
      throw new AppError(
        "Payment is still locked. It will only be available after your application and documents are approved.",
        403,
        "PAYMENT_LOCKED_PENDING_APPLICATION_REVIEW",
      );
    }

    if (!isDepositCheckoutReady(reservation)) {
      throw new AppError(
        "Reservation Fee checkout is available only after application submission.",
        409,
        "DEPOSIT_NOT_READY",
        {
          status: normalizeReservationStatus(reservation.status),
          applicationSubmittedAt: reservation.applicationSubmittedAt || null,
        },
      );
    }

    const amount =
      reservation.reservationFeeAmount ?? (await getReservationFeeAmount());
    if (
      !reservation.reservationFeeAmount ||
      reservation.reservationFeeAmount !== amount
    ) {
      reservation.reservationFeeAmount = amount;
    }

    const targetDepositCents = Math.round(amount * 100);

    if (reservation.paymongoSessionId) {
      try {
        const existing = await getCheckoutSession(reservation.paymongoSessionId);
        const existingUrl = existing?.attributes?.checkout_url;
        const existingPayments = existing?.attributes?.payments || [];
        const existingAmountCents =
          existing?.attributes?.line_items?.[0]?.amount ??
          Math.round(Number(existing?.attributes?.metadata?.amountDue || 0) * 100);

        if (
          existingUrl &&
          existingPayments.length === 0 &&
          existingAmountCents === targetDepositCents
        ) {
          if (!hasReservationStatus(reservation.status, "payment_pending")) {
            reservation.status = "payment_pending";
            reservation.paymentStatus = "pending";
            await reservation.save();
          }
          return sendSuccess(res, {
            checkoutUrl: existingUrl,
            sessionId: reservation.paymongoSessionId,
            reused: true,
          });
        }
      } catch {
        // Expired, invalid, or price-mismatch session: create a fresh one below.
      }
    }

    const roomName = reservation.roomId?.name || "Room";
    const { checkoutUrl, sessionId } = await createCheckoutSession({
      amount,
      description: `Lilycrest Dormitory - Reservation Fee (${roomName})`,
      metadata: {
        type: "deposit",
        reservationId: String(reservation._id),
        userId: String(dbUser._id),
        amountDue: String(amount),
      },
      successUrl: `${FRONTEND_URL}/applicant/reservation?payment=success&session_id={id}`,
      cancelUrl: `${FRONTEND_URL}/applicant/reservation?payment=cancelled&session_id={id}`,
      idempotencyKey: `reservation-fee:${reservation._id}:${targetDepositCents}`,
    });

    reservation.paymongoSessionId = sessionId;
    reservation.status = "payment_pending";
    reservation.paymentStatus = "pending";
    await reservation.save();
    await auditLogger.log({
      req,
      type: "data_modification",
      action: "reservation.reservation_fee_checkout_created",
      severity: "info",
      entityType: "reservation",
      entityId: reservation._id,
      details: "Created or refreshed a PayMongo Reservation Fee checkout.",
      metadata: {
        reservationId: String(reservation._id),
        workflowVersion: reservation.financialWorkflowVersion || null,
        amount,
        currency: "PHP",
      },
    });

    sendSuccess(res, { checkoutUrl, sessionId });
  } catch (error) {
    next(error);
  }
};

export const createMoveInCheckout = async (req, res, next) => {
  try {
    const { resId } = req.params;
    const dbUser = await getDbUser(req.user.uid);
    if (!dbUser) throw new AppError("User not found", 404, "USER_NOT_FOUND");

    const reservation = await Reservation.findById(resId).populate("roomId");
    if (!reservation) {
      throw new AppError(
        "Reservation not found",
        404,
        "RESERVATION_NOT_FOUND",
      );
    }

    if (String(reservation.userId) !== String(dbUser._id)) {
      throw new AppError(
        "You can only pay for your own reservation",
        403,
        "FORBIDDEN",
      );
    }

    if (
      reservation.initialPaymentStatus === "paid" ||
      reservation.paymentStatus === "paid_in_full"
    ) {
      throw new AppError("Move-in balance is already settled", 400, "ALREADY_PAID");
    }

    const {
      monthlyRent,
      advanceRent,
      securityDeposit,
      reservationFeeAmount,
      appliedReservationCredit: reservationFeeCredit,
      grossTotal,
      remainingDue,
    } = resolveReservationFinancials(reservation);

    if (remainingDue <= 0) {
      throw new AppError(
        "No remaining move-in balance is due",
        400,
        "NO_BALANCE_DUE",
      );
    }

    let bill = null;
    if (reservation.initialPaymentBillId) {
      bill = await Bill.findById(reservation.initialPaymentBillId);
    }
    if (!bill) {
      bill = await Bill.findOne({
        reservationId: reservation._id,
        billType: "initial_payment",
        isArchived: { $ne: true },
      });
    }

    if (!bill) {
      bill = new Bill({
        reservationId: reservation._id,
        userId: dbUser._id,
        roomId: reservation.roomId?._id || reservation.roomId,
        branch: reservation.roomId?.branch || "main",
        billingMonth: new Date(),
        dueDate: null,
        billType: "initial_payment",
        grossAmount: grossTotal,
        reservationCreditApplied: reservationFeeCredit,
        totalAmount: remainingDue,
        remainingAmount: remainingDue,
        status: "pending",
        charges: {
          rent: advanceRent,
          electricity: 0,
          water: 0,
          applianceFees: 0,
          corkageFees: 0,
          penalty: 0,
          discount: 0,
        },
      });
      await bill.save();
      reservation.initialPaymentBillId = bill._id;
      await reservation.save({ validateModifiedOnly: true });
    } else {
      // Synchronize existing bill to authoritative financials
      bill.grossAmount = grossTotal;
      bill.reservationCreditApplied = reservationFeeCredit;
      bill.totalAmount = remainingDue;
      bill.remainingAmount = remainingDue;
      bill.charges = {
        ...(bill.charges?.toObject?.() || bill.charges || {}),
        rent: advanceRent,
        electricity: 0,
        water: 0,
        applianceFees: 0,
        corkageFees: 0,
        penalty: 0,
        discount: 0,
      };
      await bill.save();
    }

    const targetMoveInCents = Math.round(remainingDue * 100);

    if (bill.paymongoSessionId) {
      try {
        const existing = await getCheckoutSession(bill.paymongoSessionId);
        const existingUrl = existing?.attributes?.checkout_url;
        const existingPayments = existing?.attributes?.payments || [];
        const existingAmountCents =
          existing?.attributes?.line_items?.[0]?.amount ??
          Math.round(Number(existing?.attributes?.metadata?.amountDue || 0) * 100);

        if (
          existingUrl &&
          existingPayments.length === 0 &&
          existingAmountCents === targetMoveInCents
        ) {
          return sendSuccess(res, {
            checkoutUrl: existingUrl,
            sessionId: bill.paymongoSessionId,
            reused: true,
          });
        }
      } catch {
        // Expired, invalid, or price-mismatch session: create fresh one below
      }
    }

    const roomName = reservation.roomId?.name || "Room";
    const checkoutIdempotencyKey = `movein:${reservation._id}:bill:${bill._id}:balance:${targetMoveInCents}`;
    const { checkoutUrl, sessionId } = await createCheckoutSession({
      amount: remainingDue,
      description: `Lilycrest Dormitory - Remaining Move-In Balance (${roomName})`,
      metadata: {
        type: "bill",
        purpose: "initial_payment",
        billId: String(bill._id),
        reservationId: String(reservation._id),
        userId: String(dbUser._id),
        amountDue: String(remainingDue),
      },
      successUrl: `${FRONTEND_URL}/applicant/profile?payment=success&session_id={id}`,
      cancelUrl: `${FRONTEND_URL}/applicant/profile?payment=cancelled&session_id={id}`,
      idempotencyKey: checkoutIdempotencyKey,
    });

    bill.paymongoSessionId = sessionId;
    bill.paymongoCheckoutIdempotencyKey = checkoutIdempotencyKey;
    await bill.save();

    reservation.initialPaymentBillId = bill._id;
    reservation.initialPaymentSessionId = sessionId;
    await reservation.save({ validateModifiedOnly: true });

    await auditLogger.log({
      req,
      type: "data_modification",
      action: "payment.paymongo_movein_checkout_created",
      severity: "info",
      entityType: "bill",
      entityId: bill._id,
      details: "Created PayMongo checkout for remaining move-in balance.",
      metadata: {
        billId: String(bill._id),
        reservationId: String(reservation._id),
        amount: remainingDue,
        currency: "PHP",
      },
    });

    sendSuccess(res, { checkoutUrl, sessionId });
  } catch (error) {
    next(error);
  }
};

export const checkSessionStatus = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const dbUser = await getDbUser(req.user.uid);
    if (!dbUser) throw new AppError("User not found", 404, "USER_NOT_FOUND");

    logger.info({ sessionId }, "checkSessionStatus called");
    let session;
    try {
      session = await getCheckoutSession(sessionId);
    } catch (err) {
      logger.warn({ err: err.message, sessionId }, "Failed to fetch PayMongo session");
      return res.status(200).json({
        success: true,
        status: "unpaid",
        message: err.message || "Could not retrieve checkout session",
      });
    }

    const metadata = session.attributes?.metadata || {};
    const { bill: sessionBill, reservation: sessionReservation } =
      await resolveSessionResourceAccess(metadata, dbUser);
    const paidPayments = readPaidPayments(session);
    const isPaid = paidPayments.length > 0;

    logger.info(
      {
        isPaid,
        totalPayments: session.attributes.payments?.length || 0,
        paidPayments: paidPayments.length,
      },
      "Payment check result",
    );

    const { paymentMethod, rawPaymentType } = readPaymentMethod(
      session,
      paidPayments,
    );
    let paidReservationSnapshot = null;

    if (isPaid) {
      logger.info(
        {
          type: metadata.type,
          billId: metadata.billId,
          reservationId: metadata.reservationId,
        },
        "Payment metadata",
      );

      const bill =
        sessionBill ||
        (metadata.billId
          ? await Bill.findById(metadata.billId)
          : await Bill.findOne({ paymongoSessionId: sessionId }));

      if (bill) {
        const paymentReference = paidPayments[0]?.id || sessionId;
        const sessionPaidAmount = Number(paidPayments[0]?.attributes?.amount || 0);
        const settledAmount = Number(metadata.amountDue || 0) > 0
          ? Number(metadata.amountDue)
          : sessionPaidAmount > 0
            ? sessionPaidAmount / 100
            : null;
        const settlement = await settlePaymongoBill({
          bill,
          paymentReference,
          settledAmount,
          source: "paymongo-polling",
          metadata: {
            sessionId,
            sessionType: metadata.type || "bill",
            currency: String(
              paidPayments[0]?.attributes?.currency || "PHP",
            ).toUpperCase(),
          },
        });

        const isInitialPayment =
          bill.billType === "initial_payment" ||
          metadata.purpose === "initial_payment";

        if (isInitialPayment && bill.reservationId) {
          await Reservation.updateOne(
            { _id: bill.reservationId },
            {
              $set: {
                initialPaymentStatus: "paid",
                paymentStatus: "paid_in_full",
                reservationFeePaymentStatus: "verified",
              },
            },
          );
          try {
            const { autoGenerateDepositSettledContract } = await import(
              "../services/autoContractOrchestratorService.js"
            );
            await autoGenerateDepositSettledContract({
              reservationId: bill.reservationId,
              actorId: bill.userId,
            });
          } catch (contractErr) {
            logger.warn(
              { err: contractErr },
              "Failed to auto-generate contract upon initial payment settlement (non-fatal)",
            );
          }
        }

        if (!settlement.applied) {
          logger.info(
            {
              billId: bill._id,
              paymentReference,
              reason: settlement.reason,
            },
            "Bill payment already applied",
          );
        } else {
          const monthStr = dayjs(bill.billingMonth).format("MMMM YYYY");

          await notify.paymentApproved(
            bill.userId,
            monthStr,
            settlement.appliedAmount,
            {
              billId: bill._id,
              eventId: settlement.payment?._id || paymentReference,
            },
          );

            // Email + in-app notification to tenant
            try {
              const tenant = await User.findById(bill.userId).lean();
              if (tenant?.email) {
                const tenantName =
                  `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim() ||
                  "Tenant";

                let reservationCode = "";
                let roomName = "";
                if (bill.reservationId) {
                  const resDoc = await Reservation.findById(bill.reservationId)
                    .populate("roomId", "name branch")
                    .lean();
                  if (resDoc) {
                    reservationCode = resDoc.reservationCode || "";
                    roomName = resDoc.roomId?.name || "";
                  }
                }

                if (!isInitialPayment) {
                  await sendPaymentApprovedEmail({
                    to: tenant.email,
                    tenantName,
                    billingMonth: monthStr,
                    paidAmount: settlement.appliedAmount,
                    branchName: bill.branch,
                  });
                }

                await sendPaymentReceiptEmail({
                  to: tenant.email,
                  tenantName,
                  billedTo: tenantName,
                  amount: settlement.appliedAmount,
                  description: isInitialPayment
                    ? "Lilycrest Dormitory — Move-In Settlement (Advance Rent & Security Deposit)"
                    : `Monthly Bill - ${monthStr}`,
                  paymentMethod: paymentMethod || "Online Payment (PayMongo)",
                  paymentDate: dayjs().format("MMMM D, YYYY"),
                  referenceId:
                    settlement.payment?.referenceNumber ||
                    settlement.payment?.paymentId ||
                    bill.paymentReference ||
                    paymentReference,
                  reservationCode,
                  roomName,
                  branch: bill.branch,
                });
              }
            } catch (emailErr) {
              logger.warn({ err: emailErr }, "Bill email error");
            }

            // In-app notification to branch admins and owner
            try {
              const admins = await User.find({
                accountStatus: "active",
                $or: [
                  { role: "branch_admin", branch: bill.branch },
                  { role: "owner" },
                ],
              }).select("_id firstName lastName").lean();

              if (admins.length > 0) {
                const tenantUser = await User.findById(bill.userId)
                  .select("firstName lastName")
                  .lean();
                const tenantName = tenantUser
                  ? `${tenantUser.firstName || ""} ${tenantUser.lastName || ""}`.trim() || "A tenant"
                  : "A tenant";
                await Promise.all(
                  admins.map((admin) =>
                    notify.general(
                      admin._id,
                      "Payment Received",
                      `${tenantName} paid ₱${settlement.appliedAmount.toLocaleString()} for the ${monthStr} bill.`,
                      { entityType: "bill", actionUrl: "/admin/billing" },
                    )
                  )
                );
              }
            } catch (adminNotifErr) {
              logger.warn({ err: adminNotifErr }, "Admin payment notification error");
            }
          }
        }

        if (metadata.type === "multi_bill") {
          let billIds = [];
          try {
            billIds = Array.isArray(metadata.billIds)
              ? metadata.billIds
              : JSON.parse(metadata.billIds || "[]");
          } catch {
            billIds = [];
          }
          if (billIds.length === 0) {
            const matchedBills = await Bill.find({ paymongoSessionId: sessionId });
            billIds = matchedBills.map((b) => String(b._id));
          }

          const paymentReference = paidPayments[0]?.id || sessionId;
          const totalPaidAmount = Number(metadata.amountDue || 0) > 0
            ? Number(metadata.amountDue)
            : Number(paidPayments[0]?.attributes?.amount || 0) / 100;

          let totalSettled = 0;
          const settledBills = [];

          for (const bId of billIds) {
            const billDoc = await Bill.findById(bId);
            if (!billDoc) continue;
            const remaining = getBillRemainingAmount(billDoc);
            if (remaining <= 0) continue;

            const settlement = await settlePaymongoBill({
              bill: billDoc,
              paymentReference,
              settledAmount: remaining,
              source: "paymongo-polling",
              metadata: {
                sessionId,
                sessionType: "multi_bill",
                currency: String(paidPayments[0]?.attributes?.currency || "PHP").toUpperCase(),
              },
            });
            if (settlement.applied) {
              totalSettled += settlement.appliedAmount;
              settledBills.push(billDoc);
            }
          }

          if (settledBills.length > 0) {
            try {
              const tenant = await User.findById(dbUser._id).lean();
              if (tenant?.email) {
                const tenantName = `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim() || "Tenant";
                await sendPaymentReceiptEmail({
                  to: tenant.email,
                  tenantName,
                  billedTo: tenantName,
                  amount: totalPaidAmount || totalSettled,
                  description: `Consolidated Payment (${settledBills.length} Statements)`,
                  paymentMethod: paymentMethod || "Online Payment (PayMongo)",
                  paymentDate: dayjs().format("MMMM D, YYYY"),
                  referenceId: paymentReference,
                  reservationCode: "",
                  roomName: "",
                  branch: settledBills[0]?.branch || "",
                });
              }
            } catch (emailErr) {
              logger.warn({ err: emailErr }, "Multi-bill receipt email error");
            }

            try {
              await notify.paymentApproved(
                dbUser._id,
                `${settledBills.length} statements`,
                totalSettled,
                { eventId: paymentReference },
              );
            } catch (notifErr) {
              logger.warn({ err: notifErr }, "Multi-bill tenant notification error");
            }

            try {
              const admins = await User.find({
                accountStatus: "active",
                $or: [
                  ...(settledBills[0]?.branch ? [{ role: "branch_admin", branch: settledBills[0].branch }] : [{ role: "branch_admin" }]),
                  { role: "owner" },
                ],
              }).select("_id firstName lastName").lean();

              if (admins.length > 0) {
                const tenantUser = await User.findById(dbUser._id).select("firstName lastName").lean();
                const tenantName = tenantUser
                  ? `${tenantUser.firstName || ""} ${tenantUser.lastName || ""}`.trim() || "A tenant"
                  : "A tenant";
                await Promise.all(
                  admins.map((admin) =>
                    notify.general(
                      admin._id,
                      "Payment Received",
                      `${tenantName} paid ₱${totalSettled.toLocaleString()} for ${settledBills.length} consolidated bills.`,
                      { entityType: "bill", actionUrl: "/admin/billing" },
                    )
                  )
                );
              }
            } catch (adminNotifErr) {
              logger.warn({ err: adminNotifErr }, "Admin multi-bill notification error");
            }
          }
        }

        if (metadata.type === "deposit" && metadata.reservationId) {
        const reservation =
          sessionReservation ||
          (await Reservation.findById(metadata.reservationId).populate(
            "roomId",
            "name branch",
          ));

        if (reservation && reservation.paymentStatus !== "paid") {
          logger.info(
            { reservationId: metadata.reservationId },
            "Marking deposit as paid",
          );

          const paymentReference = paidPayments[0]?.id || sessionId;
          const payObj = paidPayments[0]?.attributes || paidPayments[0] || {};
          const paidAmount = Number(payObj.amount || 0) / 100;
          const currency = String(payObj.currency || "PHP").toUpperCase();
          const settlement = await settleReservationDeposit({
            reservationId: metadata.reservationId,
            source: "paymongo",
            paidAmount,
            externalPaymentId: paymentReference,
            externalSessionId: sessionId,
            paymentReference,
            idempotencyKey: `paymongo:${paymentReference}`,
            evidence: {
              paymentMethod: rawPaymentType || "paymongo",
              currency,
            },
            paidAt: new Date(),
            fallbackFeeResolver: getReservationFeeAmount,
          });
          const settledReservation = settlement.reservation;
          paidReservationSnapshot = {
            _id: settledReservation._id,
            reservationCode: settledReservation.reservationCode,
            status: settledReservation.status,
            paymentStatus: settledReservation.paymentStatus,
            paymentMethod: settledReservation.paymentMethod,
            paymentDate: settledReservation.paymentDate,
            paymongoPaymentId: settledReservation.paymongoPaymentId,
            requiresReview: Boolean(settlement.reconciliationRequired),
          };

          if (settlement.settled && !settlement.idempotent) {
            try {
              const tenant = await User.findById(settledReservation.userId).lean();
              if (tenant?.email) {
                const tenantName =
                  `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim() ||
                  "Tenant";
                const roomName = reservation.roomId?.name || "Room";
                await sendPaymentReceiptEmail({
                  to: tenant.email,
                  tenantName,
                  amount:
                    settledReservation.reservationFeeAmount ??
                    BUSINESS.DEPOSIT_AMOUNT,
                  description: `Reservation Fee - ${roomName}`,
                  paymentMethod: paymentMethod || "Online Payment (PayMongo)",
                  paymentDate: dayjs().format("MMMM D, YYYY"),
                  referenceId:
                    settlement.payment?.referenceNumber ||
                    settlement.payment?.paymentId ||
                    settledReservation.paymentReference ||
                    paymentReference,
                  reservationCode: settledReservation.reservationCode || "",
                  roomName,
                  branch: reservation.roomId?.branch || "",
                });
              }
            } catch (emailErr) {
              logger.warn({ err: emailErr }, "Deposit receipt email error");
            }
          }
        } else if (reservation) {
          paidReservationSnapshot = {
            _id: reservation._id,
            reservationCode: reservation.reservationCode,
            status: reservation.status,
            paymentStatus: reservation.paymentStatus,
            paymentMethod: reservation.paymentMethod,
            paymentDate: reservation.paymentDate,
            paymongoPaymentId: reservation.paymongoPaymentId,
          };
          logger.info(
            { reservationId: metadata.reservationId },
            "Deposit already paid - skipping",
          );
        }
      }
    }

    const primaryPaidPayment = paidPayments[0] || null;
    const referenceNumber = primaryPaidPayment?.id || reservation?.paymongoPaymentId || sessionId;
    const sessionPaidAmount = Number(primaryPaidPayment?.attributes?.amount || 0);
    const resolvedAmount = Number(metadata.amountDue || 0) > 0
      ? Number(metadata.amountDue)
      : sessionPaidAmount > 0
        ? sessionPaidAmount / 100
        : Number(session?.attributes?.line_items?.[0]?.amount || 0) / 100;
    const paidAt = primaryPaidPayment?.attributes?.paid_at
      ? new Date(primaryPaidPayment.attributes.paid_at * 1000).toISOString()
      : new Date().toISOString();

    logger.info(
      { sessionId, status: isPaid ? "paid" : "pending" },
      "checkSessionStatus complete",
    );

    sendSuccess(res, {
      sessionId,
      status: isPaid ? "paid" : "pending",
      paid: isPaid,
      referenceNumber: isPaid ? referenceNumber : null,
      amount: isPaid ? resolvedAmount : 0,
      paidAt: isPaid ? paidAt : null,
      paymentCount: paidPayments.length,
      paymentMethod,
      ...(paidReservationSnapshot && { reservation: paidReservationSnapshot }),
      ...(paidReservationSnapshot?.requiresReview ? { requiresReview: true } : {}),
    });
  } catch (error) {
    logger.error(
      { err: error, sessionId: req.params.sessionId },
      "checkSessionStatus error",
    );
    next(error);
  }
};

export const getPaymentsForBill = async (req, res, next) => {
  try {
    const { billId } = req.params;
    const dbUser = await getDbUser(req.user.uid);
    if (!dbUser) throw new AppError("User not found", 404, "USER_NOT_FOUND");

    const bill = await Bill.findById(billId).lean();
    if (!bill) throw new AppError("Bill not found", 404, "BILL_NOT_FOUND");

    const isOwnBill = String(bill.userId) === String(dbUser._id);
    const isOwner = isOwnerRole(dbUser.role);
    const isBranchBillingAdmin =
      dbUser.role === "branch_admin" &&
      hasBillingPermission(dbUser) &&
      bill.branch === dbUser.branch;

    if (!isOwnBill && !isOwner && !isBranchBillingAdmin) {
      throw new AppError(
        "You are not allowed to view payments for this bill",
        403,
        "FORBIDDEN",
      );
    }

    const payments = await Payment.getPaymentsForBill(bill._id);
    sendSuccess(res, { data: payments });
  } catch (error) {
    next(error);
  }
};

export const getAdminPaymentLedger = async (req, res, next) => {
  try {
    const status = String(req.query.status || "").trim();
    const branch =
      req.branchFilter ||
      (req.isOwner && req.query.branch ? String(req.query.branch).trim() : "");
    const search = String(req.query.search || "").trim().toLowerCase();
    const dateFrom = String(req.query.dateFrom || "").trim();
    const dateTo = String(req.query.dateTo || "").trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);

    const filter = {};
    if (branch) filter.branch = branch;
    if (status && status !== "all") filter.status = status;

    const createdAtFilter = {};
    if (dateFrom) {
      const parsed = new Date(dateFrom);
      if (!Number.isNaN(parsed.getTime())) {
        createdAtFilter.$gte = parsed;
      }
    }
    if (dateTo) {
      const parsed = new Date(dateTo);
      if (!Number.isNaN(parsed.getTime())) {
        parsed.setHours(23, 59, 59, 999);
        createdAtFilter.$lte = parsed;
      }
    }
    if (Object.keys(createdAtFilter).length > 0) {
      filter.createdAt = createdAtFilter;
    }

    const category = String(req.query.category || "").trim(); // all, reservation_fee, advance_deposit, rent, utility

    const payments = await Payment.find(filter)
      .populate("tenantId", "firstName lastName email profileImage avatar photoUrl")
      .populate({
        path: "billId",
        select: "billingMonth totalAmount status branch billType charges grossAmount reservationCreditApplied reservationId roomId",
        populate: [
          { path: "roomId", select: "name roomNumber branch type" },
          {
            path: "reservationId",
            select: "reservationCode status roomId selectedBed totalPrice amountPaid branch",
            populate: { path: "roomId", select: "name roomNumber branch type" },
          },
        ],
      })
      .populate({
        path: "reservationId",
        select: "reservationCode status roomId selectedBed totalPrice amountPaid branch",
        populate: { path: "roomId", select: "name roomNumber branch type" },
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const resolvePaymentCategory = (payment) => {
      if (
        payment.purpose === "reservation_fee" ||
        payment.purpose === "reservation_deposit" ||
        (!payment.billId && payment.reservationId)
      ) {
        return "reservation_fee";
      }
      if (
        payment.purpose === "initial_payment" ||
        payment.billId?.billType === "initial_payment"
      ) {
        return "advance_deposit";
      }
      if (
        payment.purpose === "rent" ||
        payment.purpose === "regular_rent" ||
        payment.billId?.billType === "rent"
      ) {
        return "rent";
      }
      if (payment.purpose === "utility" || payment.billId?.billType === "utility") {
        return "utility";
      }
      return payment.purpose || "other";
    };

    let filteredPayments = payments;

    if (category && category !== "all") {
      filteredPayments = filteredPayments.filter((p) => {
        const cat = resolvePaymentCategory(p);
        if (category === "reservation_fee") return cat === "reservation_fee";
        if (category === "advance_deposit") return cat === "advance_deposit";
        return cat === category;
      });
    }

    if (search) {
      filteredPayments = filteredPayments.filter((payment) => {
        const effectiveRes = payment.reservationId || payment.billId?.reservationId || null;
        const effectiveRoom =
          payment.reservationId?.roomId ||
          payment.billId?.roomId ||
          payment.billId?.reservationId?.roomId ||
          null;
        const tenantName =
          `${payment.tenantId?.firstName || ""} ${payment.tenantId?.lastName || ""}`.trim();
        const reservationCode = effectiveRes?.reservationCode || "";
        const roomName = effectiveRoom?.name || effectiveRoom?.roomNumber || "";
        const haystack = [
          payment.paymentId,
          payment.referenceNumber,
          payment.externalPaymentId,
          payment.source,
          payment.method,
          payment.status,
          payment.billId?._id,
          payment.tenantId?._id,
          payment.tenantId?.email,
          tenantName,
          reservationCode,
          roomName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(search);
      });
    }

    sendSuccess(res, {
      data: filteredPayments.map((payment) => {
        const cat = resolvePaymentCategory(payment);
        const effectiveRes = payment.reservationId || payment.billId?.reservationId || null;
        const effectiveRoom =
          payment.reservationId?.roomId ||
          payment.billId?.roomId ||
          payment.billId?.reservationId?.roomId ||
          null;
        const roomName = effectiveRoom?.name || effectiveRoom?.roomNumber || "";
        const bedLabel =
          payment.reservationId?.selectedBed?.label ||
          payment.billId?.reservationId?.selectedBed?.label ||
          "";
        const reservationCode =
          effectiveRes?.reservationCode ||
          (effectiveRes?._id ? String(effectiveRes._id) : "") ||
          "";

        return {
          id: payment._id,
          _id: payment._id,
          paymentId: payment.paymentId,
          paymentCategory: cat,
          category: cat,
          billId: payment.billId?._id || payment.billId || null,
          billNumber: payment.billId?._id || null,
          billStatus: payment.billId?.status || null,
          billType: payment.billId?.billType || null,
          billCharges: payment.billId?.charges || null,
          billGrossAmount: payment.billId?.grossAmount || null,
          billReservationCreditApplied: payment.billId?.reservationCreditApplied || null,
          reservationId: effectiveRes?._id || null,
          reservation: effectiveRes && typeof effectiveRes === "object"
            ? {
                id: effectiveRes._id,
                _id: effectiveRes._id,
                reservationCode,
                status: effectiveRes.status || null,
                roomId: effectiveRoom,
                selectedBed: effectiveRes.selectedBed || null,
                totalPrice: effectiveRes.totalPrice || null,
                branch: effectiveRes.branch || null,
              }
            : null,
          purpose: payment.purpose || "other",
          branch: payment.branch || effectiveRes?.branch || payment.billId?.branch || null,
          roomName,
          bedLabel,
          reservationCode,
          tenantId: payment.tenantId || null,
          tenant: payment.tenantId
            ? {
                id: payment.tenantId._id,
                _id: payment.tenantId._id,
                firstName: payment.tenantId.firstName || "",
                lastName: payment.tenantId.lastName || "",
                name:
                  `${payment.tenantId.firstName || ""} ${payment.tenantId.lastName || ""}`.trim() ||
                  "Tenant",
                email: payment.tenantId.email || "",
                profileImage:
                  payment.tenantId.profileImage ||
                  payment.tenantId.avatar ||
                  payment.tenantId.photoUrl ||
                  "",
              }
            : null,
          amount: payment.amount || 0,
          paidAmount: payment.paidAmount ?? payment.amount ?? 0,
          expectedAmount: payment.expectedAmount ?? payment.amount ?? 0,
          paymentMethod: payment.method || null,
          method: payment.method || null,
          status: payment.status || null,
          externalPaymentId: payment.externalPaymentId || null,
          referenceNumber: payment.referenceNumber || null,
          paymentReference: payment.referenceNumber || payment.externalPaymentId || null,
          source: payment.source || null,
          proofUrl: payment.proofUrl || null,
          proofImageUrl: payment.proofImageUrl || null,
          createdAt: payment.createdAt || null,
          submittedAt: payment.submittedAt || payment.createdAt || null,
          processedAt: payment.processedAt || null,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
};
