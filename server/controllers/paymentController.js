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
import { Bill, Reservation, User } from "../models/index.js";
import logger from "../middleware/logger.js";
import {
  sendPaymentApprovedEmail,
  sendPaymentReceiptEmail,
} from "../config/email.js";
import { updateOccupancyOnReservationChange } from "../utils/occupancyManager.js";
import { BUSINESS } from "../config/constants.js";
import { getReservationFeeAmount } from "../utils/businessSettings.js";
import { settlePaymongoBill } from "../utils/billSettlement.js";
import {
  getBillRemainingAmount,
  getVisibleBillSnapshot,
  resolveBillStatus,
} from "../utils/billingPolicy.js";
import { sendSuccess, AppError } from "../middleware/errorHandler.js";

const FRONTEND_URL =
  process.env.FRONTEND_URL?.split(",")[0]?.trim() || "http://localhost:5173";
const TENANT_BILLING_PATH = "/applicant/billing";

const PAYMENT_METHOD_LABELS = Object.freeze({
  gcash: "GCash",
  grab_pay: "GrabPay",
  paymaya: "Maya",
  card: "Credit / Debit Card",
  dob: "Online Banking",
  billease: "BillEase",
  qrph: "QR Ph",
  online: "Online Payment (PayMongo)",
});

function canAutoReserveReservation(status) {
  return status === "pending" || status === "payment_pending";
}

async function getDbUser(firebaseUid) {
  return User.findOne({ firebaseUid }).lean();
}

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

const readPaidPayments = (session) => {
  const payments = session.attributes.payments || [];
  return payments.filter((payment) => {
    const status = payment?.attributes?.status || payment?.status;
    return status === "paid";
  });
};

const readPaymentMethod = (session, paidPayments) => {
  if (paidPayments.length === 0) {
    return { paymentMethod: null, rawPaymentType: null };
  }

  const firstPayment = paidPayments[0];
  const payObj = firstPayment?.attributes || firstPayment;
  const rawPaymentType =
    payObj?.source?.type || session.attributes?.payment_method_used || "online";

  return {
    rawPaymentType,
    paymentMethod:
      PAYMENT_METHOD_LABELS[rawPaymentType] || `PayMongo - ${rawPaymentType}`,
  };
};

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

    if (getVisibleBillSnapshot(bill).status === "paid") {
      throw new AppError("Bill is already paid", 400, "ALREADY_PAID");
    }

    if (bill.paymongoSessionId) {
      try {
        const existing = await getCheckoutSession(bill.paymongoSessionId);
        const existingUrl = existing?.attributes?.checkout_url;
        const existingPayments = existing?.attributes?.payments || [];
        if (existingUrl && existingPayments.length === 0) {
          return sendSuccess(res, {
            checkoutUrl: existingUrl,
            sessionId: bill.paymongoSessionId,
            reused: true,
          });
        }
      } catch {
        // Expired or invalid session: create a fresh one below.
      }
    }

    bill.remainingAmount = getBillRemainingAmount(bill);
    bill.status = resolveBillStatus(bill);
    const visibleBill = getVisibleBillSnapshot(bill);
    const amountDue = visibleBill.remainingAmount;
    if (amountDue <= 0) {
      throw new AppError("No visible balance is currently due", 400, "NO_BALANCE_DUE");
    }

    const monthLabel = dayjs(bill.billingMonth).format("MMMM YYYY");
    const { checkoutUrl, sessionId } = await createCheckoutSession({
      amount: amountDue,
      description: `Lilycrest Dormitory - ${monthLabel} Bill`,
      metadata: {
        type: "bill",
        billId: String(bill._id),
        userId: String(dbUser._id),
        amountDue: String(amountDue),
      },
      successUrl: `${FRONTEND_URL}${TENANT_BILLING_PATH}?payment=success&session_id={id}`,
      cancelUrl: `${FRONTEND_URL}${TENANT_BILLING_PATH}?payment=cancelled`,
    });

    bill.paymongoSessionId = sessionId;
    await bill.save();

    sendSuccess(res, { checkoutUrl, sessionId });
  } catch (error) {
    next(error);
  }
};

export const createDepositCheckout = async (req, res, next) => {
  try {
    const { resId } = req.params;
    const dbUser = await getDbUser(req.user.uid);
    if (!dbUser) throw new AppError("User not found", 404, "USER_NOT_FOUND");

    const reservation = await Reservation.findById(resId).populate(
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
        "You can only pay for your own reservation",
        403,
        "FORBIDDEN",
      );
    }

    if (reservation.paymentStatus === "paid") {
      throw new AppError("Deposit is already paid", 400, "ALREADY_PAID");
    }

    if (reservation.paymongoSessionId) {
      try {
        const existing = await getCheckoutSession(reservation.paymongoSessionId);
        const existingUrl = existing?.attributes?.checkout_url;
        const existingPayments = existing?.attributes?.payments || [];
        if (existingUrl && existingPayments.length === 0) {
          return sendSuccess(res, {
            checkoutUrl: existingUrl,
            sessionId: reservation.paymongoSessionId,
            reused: true,
          });
        }
      } catch {
        // Expired or invalid session: create a fresh one below.
      }
    }

    const amount =
      reservation.reservationFeeAmount || (await getReservationFeeAmount());
    if (
      !reservation.reservationFeeAmount ||
      reservation.reservationFeeAmount !== amount
    ) {
      reservation.reservationFeeAmount = amount;
    }

    const roomName = reservation.roomId?.name || "Room";
    const { checkoutUrl, sessionId } = await createCheckoutSession({
      amount,
      description: `Lilycrest Dormitory - Reservation Deposit (${roomName})`,
      metadata: {
        type: "deposit",
        reservationId: String(reservation._id),
        userId: String(dbUser._id),
      },
      successUrl: `${FRONTEND_URL}/applicant/reservation?payment=success&session_id={id}`,
      cancelUrl: `${FRONTEND_URL}/applicant/reservation?payment=cancelled&session_id={id}`,
    });

    reservation.paymongoSessionId = sessionId;
    await reservation.save();

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
    const session = await getCheckoutSession(sessionId);
    const metadata = session.attributes.metadata || {};
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

    if (isPaid) {
      logger.info(
        {
          type: metadata.type,
          billId: metadata.billId,
          reservationId: metadata.reservationId,
        },
        "Payment metadata",
      );

      if (metadata.type === "bill" && metadata.billId) {
        const bill = sessionBill || (await Bill.findById(metadata.billId));
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
            },
          });

          if (!settlement.applied) {
            logger.info(
              {
                billId: metadata.billId,
                paymentReference,
                reason: settlement.reason,
              },
              "Bill payment already applied",
            );
          } else {
            logger.info({ billId: metadata.billId }, "Marking bill as paid");

            try {
              const tenant = await User.findById(bill.userId).lean();
              if (tenant?.email) {
                const monthStr = dayjs(bill.billingMonth).format("MMMM YYYY");
                const tenantName =
                  `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim() ||
                  "Tenant";

                await sendPaymentApprovedEmail({
                  to: tenant.email,
                  tenantName,
                  billingMonth: monthStr,
                  paidAmount: settlement.appliedAmount,
                  branchName: bill.branch,
                });
                await sendPaymentReceiptEmail({
                  to: tenant.email,
                  tenantName,
                  amount: settlement.appliedAmount,
                  description: `Monthly Bill - ${monthStr}`,
                  paymentMethod: paymentMethod || "Online Payment (PayMongo)",
                  paymentDate: dayjs().format("MMMM D, YYYY"),
                  referenceId: paymentReference,
                });
              }
            } catch (emailErr) {
              logger.warn({ err: emailErr }, "Bill email error");
            }
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

          const oldStatus = reservation.status;
          const paymentReference = paidPayments[0]?.id || sessionId;
          const canAutoReserve = canAutoReserveReservation(reservation.status);

          reservation.paymentStatus = "paid";
          reservation.paymentDate = new Date();
          reservation.paymentMethod = rawPaymentType || "paymongo";
          reservation.paymongoPaymentId = paymentReference;
          if (canAutoReserve) {
            reservation.status = "reserved";
          }
          await reservation.save();

          if (canAutoReserve) {
            await updateOccupancyOnReservationChange(reservation, {
              status: oldStatus,
            });
            logger.info(
              { reservationId: metadata.reservationId },
              "Bed locked for reservation",
            );
          }

          try {
            const tenant = await User.findById(reservation.userId).lean();
            if (tenant?.email) {
              const tenantName =
                `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim() ||
                "Tenant";
              const roomName = reservation.roomId?.name || "Room";
              await sendPaymentReceiptEmail({
                to: tenant.email,
                tenantName,
                amount:
                  reservation.reservationFeeAmount || BUSINESS.DEPOSIT_AMOUNT,
                description: `Reservation Deposit - ${roomName}`,
                paymentMethod: paymentMethod || "Online Payment (PayMongo)",
                paymentDate: dayjs().format("MMMM D, YYYY"),
                referenceId: paymentReference,
              });
            }
          } catch (emailErr) {
            logger.warn({ err: emailErr }, "Deposit receipt email error");
          }
        } else if (reservation) {
          logger.info(
            { reservationId: metadata.reservationId },
            "Deposit already paid - skipping",
          );
        }
      }
    }

    logger.info(
      { sessionId, status: isPaid ? "paid" : "pending" },
      "checkSessionStatus complete",
    );

    sendSuccess(res, {
      sessionId,
      status: isPaid ? "paid" : "pending",
      paymentCount: paidPayments.length,
      paymentMethod,
    });
  } catch (error) {
    logger.error(
      { err: error, sessionId: req.params.sessionId },
      "checkSessionStatus error",
    );
    next(error);
  }
};
