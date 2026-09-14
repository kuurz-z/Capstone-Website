/**
 * ============================================================================
 * RENT GENERATOR SERVICE
 * ============================================================================
 *
 * Automated recurring rent generation engine for current resident stays.
 */

import dayjs from "dayjs";
import { getManilaDayjs, toManilaStartOfDay } from "../../utils/dateUtils.js";
import { Bill, Reservation } from "../../models/index.js";
import {
  getReservationRecurringFees,
  roundMoney,
  resolveVisibleRentBillingCycle,
  syncBillAmounts,
} from "./billingPolicy.js";
import { applyRentCreditToBill } from "./tenantCreditService.js";
import logger from "../../middleware/logger.js";
import notify from "../notifications/notificationService.js";
import { sendBillGeneratedEmail } from "../../config/email.js";
import {
  CURRENT_RESIDENT_STATUS_QUERY,
  readMoveInDate,
} from "../../utils/lifecycleNaming.js";
import {
  resolveVisibleStructuredRentPeriod,
} from "../structuredInitialPaymentPolicy.js";
import { usesStructuredInitialPayment } from "../../config/structuredInitialPayment.js";

async function recordStructuredBillingDecision(reservation, action, metadata, dryRun) {
  if (dryRun) return;
  try {
    const [{ AuditLog }, { randomUUID }] = await Promise.all([
      import("../../models/index.js"),
      import("crypto"),
    ]);
    await AuditLog.create({
      logId: `LOG-${randomUUID()}`,
      type: "data_modification",
      action,
      severity: "high",
      user: "system",
      userRole: "system",
      branch: reservation.pricingSnapshot?.branchId || reservation.branch || null,
      entityType: "reservation",
      entityId: String(reservation._id),
      details: "Recorded a structured recurring-billing decision.",
      metadata: {
        reservationId: String(reservation._id),
        workflowVersion: reservation.financialWorkflowVersion,
        ...metadata,
      },
    });
  } catch (error) {
    logger.warn({ err: error, reservationId: reservation?._id }, "Failed to record structured billing audit decision");
  }
}

/**
 * Resolve the recurring monthly rent amount for the reservation on a given date.
 */
export function resolveReservationRentAmount(
  reservation,
  referenceDate = new Date(),
) {
  // A room transfer that changed the room/room-type records the destination
  // approved rate here; it wins over EVERYTHING else (including the
  // immutable structured pricingSnapshot) so the next recurring rent Bill
  // bills the destination rate. See transferStayWorkflow.
  if (Number.isFinite(Number(reservation?.recurringRentRate)) && Number(reservation.recurringRentRate) > 0) {
    return roundMoney(reservation.recurringRentRate);
  }
  if (
    usesStructuredInitialPayment(reservation) &&
    Number.isFinite(Number(reservation?.pricingSnapshot?.finalMonthlyRate))
  ) {
    return roundMoney(reservation.pricingSnapshot.finalMonthlyRate);
  }
  const moveInDate = readMoveInDate(reservation);
  const referenceDay = toManilaStartOfDay(referenceDate);
  const isLongTerm =
    moveInDate &&
    referenceDay.diff(toManilaStartOfDay(moveInDate), "month", true) >= 6;

  let rentPrice = reservation?.monthlyRent || reservation?.totalPrice;
  if (!rentPrice) {
    rentPrice = isLongTerm
      ? (reservation?.roomId?.monthlyPrice ?? reservation?.roomId?.price ?? 0)
      : (reservation?.roomId?.price ?? 0);
  }

  return roundMoney(rentPrice);
}

export async function ensureCurrentCycleRentBill({
  reservation,
  referenceDate = new Date(),
  dryRun = false,
  notifyTenant = true,
  requireGenerationDateMatch = false,
} = {}) {
  const moveInDate = readMoveInDate(reservation);
  const currentDay = toManilaStartOfDay(referenceDate);
  if (!moveInDate || !reservation?.userId || !reservation?.roomId) {
    return { status: "skipped", reason: "missing_context" };
  }

  const structured = usesStructuredInitialPayment(reservation);
  if (
    structured &&
    (!reservation.advanceCoverageStart ||
      !reservation.advanceCoverageEndExclusive ||
      !reservation.nextRegularBillingDate)
  ) {
    await recordStructuredBillingDecision(
      reservation,
      "reservation.regular_bill_blocked_missing_advance_coverage",
      { reason: "structured_advance_coverage_missing" },
      dryRun,
    );
    return { status: "blocked", reason: "structured_advance_coverage_missing" };
  }
  const billingCycle = structured
    ? resolveVisibleStructuredRentPeriod(moveInDate, referenceDate)
    : resolveVisibleRentBillingCycle(moveInDate, referenceDate);
  if (!billingCycle) {
    const reason =
      structured &&
      getManilaDayjs(referenceDate).isBefore(getManilaDayjs(reservation.advanceCoverageEndExclusive))
        ? "advance_period_covered"
        : "outside_generation_window";
    if (reason === "advance_period_covered") {
      await recordStructuredBillingDecision(
        reservation,
        "reservation.regular_bill_skipped_advance_covered",
        {
          reason,
          coverageStart: reservation.advanceCoverageStart,
          coverageEndExclusive: reservation.advanceCoverageEndExclusive,
        },
        dryRun,
      );
    }
    return {
      status: "skipped",
      reason,
    };
  }

  const generationDay = toManilaStartOfDay(billingCycle.generationDate);
  if (requireGenerationDateMatch && !currentDay.isSame(generationDay, "day")) {
    return {
      status: "skipped",
      reason: "outside_generation_day",
      cycle: billingCycle,
    };
  }

  const billingMonthStartDate = dayjs(
    billingCycle.billingCycleStart || billingCycle.coverageStart,
  ).toDate();
  const billingCycleEndDate = dayjs(
    billingCycle.billingCycleEnd || billingCycle.coverageEndExclusive,
  ).toDate();
  const dueDateValue = dayjs(billingCycle.dueDate).toDate();
  const userId = reservation.userId?._id || reservation.userId;
  const roomId = reservation.roomId?._id || reservation.roomId;

  const existingCycleBill = await Bill.findOne({
    userId,
    reservationId: reservation._id,
    billingCycleStart: billingMonthStartDate,
    "charges.rent": { $gt: 0 },
    isArchived: false,
  });

  if (existingCycleBill) {
    return {
      status: "skipped",
      reason: "already_exists",
      cycle: billingCycle,
      bill: existingCycleBill,
    };
  }

  // If the reservation has queued appliance updates for the upcoming cycle, promote them now
  if (reservation.queuedAppliances?.appliances && !dryRun) {
    reservation.selectedAppliances = reservation.queuedAppliances.appliances;
    reservation.applianceFees = Number(reservation.queuedAppliances.applianceFees || 0);
    if (reservation.monthlyRent != null) {
      reservation.totalPrice = Number(reservation.monthlyRent) + reservation.applianceFees;
    }
    reservation.queuedAppliances = null;
    if (typeof reservation.save === "function") {
      await reservation.save();
    }
    await recordStructuredBillingDecision(
      reservation,
      "reservation.queued_appliances_promoted",
      {
        promotedAppliances: reservation.selectedAppliances,
        applianceFees: reservation.applianceFees,
      },
      dryRun,
    );
  }

  const rentPrice = resolveReservationRentAmount(reservation, referenceDate);
  const { applianceFees, additionalCharges } =
    getReservationRecurringFees(reservation);
  const grossAmount = roundMoney(rentPrice + applianceFees);
  const hasPriorRentBill = !!(await Bill.findOne({
    reservationId: reservation._id,
    isArchived: false,
    "charges.rent": { $gt: 0 },
  }));
  const isFirstCycleBill = !hasPriorRentBill;
  // The reservation-fee credit belongs against the initial payment (advance
  // rent + deposit + charges), not a recurring rent bill — the first regular
  // bill already starts at the second rental period (see
  // resolveVisibleRentBillingCycle), so it must never be credited here.
  const reservationCreditApplied = 0;

  const bill = new Bill({
    reservationId: reservation._id,
    userId,
    branch: reservation.roomId.branch,
    roomId,
    billingMonth: billingMonthStartDate,
    billingCycleStart: billingMonthStartDate,
    billingCycleEnd: billingCycleEndDate,
    dueDate: dueDateValue,
    isFirstCycleBill,
    proRataDays: dayjs(billingCycleEndDate).diff(
      dayjs(billingMonthStartDate),
      "day",
    ),
    charges: {
      rent: rentPrice,
      electricity: 0,
      water: 0,
      applianceFees,
      corkageFees: 0,
      penalty: 0,
      discount: 0,
    },
    additionalCharges,
    grossAmount,
    reservationCreditApplied,
    totalAmount: grossAmount,
    remainingAmount: grossAmount,
    status: "pending",
    billType: "monthly",
    structuredWorkflowVersion: structured
      ? reservation.financialWorkflowVersion
      : null,
    pricingSnapshotVersion: structured
      ? reservation.pricingSnapshotVersion
      : null,
  });

  syncBillAmounts(bill);

  if (dryRun) {
    return {
      status: "preview",
      cycle: billingCycle,
      bill,
    };
  }

  await bill.save();

  // ── Auto-consume available tenant RENT credit (e.g. excess prepaid rent
  //    from a cheaper-room transfer). Applied ONLY to the rent component,
  //    recorded as a matching charges.discount line, then the Bill total is
  //    re-synced via the canonical helper. Idempotent per (credit, billId).
  try {
    const { applied } = await applyRentCreditToBill({
      billId: bill._id,
      userId,
      eligibleRentAmount: rentPrice,
    });
    if (applied > 0) {
      bill.charges.discount = roundMoney(Number(bill.charges.discount || 0) + applied);
      bill.tenantCreditApplied = roundMoney(Number(bill.tenantCreditApplied || 0) + applied);
      syncBillAmounts(bill);
      await bill.save();
    }
  } catch (creditErr) {
    // Credit application must never block rent-bill creation — the Bill
    // stands at full rent and the credit remains available for next cycle.
    logger.warn(
      { err: creditErr, billId: String(bill._id), reservationId: String(reservation._id) },
      "[rentGenerator] tenant rent-credit application failed (non-fatal)",
    );
  }

  if (structured) {
    const { AuditLog } = await import("../../models/index.js");
    const { randomUUID } = await import("crypto");
    await AuditLog.create({
      logId: `LOG-${randomUUID()}`,
      type: "data_modification",
      action: isFirstCycleBill
        ? "reservation.first_regular_bill_created"
        : "reservation.regular_bill_created",
      severity: "high",
      user: "system",
      userRole: "system",
      branch: bill.branch,
      entityType: "bill",
      entityId: String(bill._id),
      details: "Created a non-overlapping structured regular-rent Bill.",
      metadata: {
        reservationId: String(reservation._id),
        billId: String(bill._id),
        workflowVersion: reservation.financialWorkflowVersion,
        amount: bill.totalAmount,
        coverageStart: bill.billingCycleStart,
        coverageEndExclusive: bill.billingCycleEnd,
        dueDate: bill.dueDate,
        reservationFeeCreditApplied: bill.reservationCreditApplied,
      },
    });
  }

  if (notifyTenant) {
    const monthLabel = dayjs(billingMonthStartDate).format("MMMM YYYY");
    const dueDateLabel = dayjs(dueDateValue).format("MMMM D, YYYY");
    const delivery = {
      email: { status: "not_attempted", sentAt: null, error: "" },
      notification: { status: "not_attempted", sentAt: null, error: "" },
    };

    if (reservation.userId?.email) {
      const tenantName =
        [reservation.userId?.firstName, reservation.userId?.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() || "Tenant";
      const emailResult = await sendBillGeneratedEmail({
        to: reservation.userId.email,
        tenantName,
        billingMonth: monthLabel,
        totalAmount: bill.totalAmount,
        dueDate: dueDateLabel,
        branchName: reservation.roomId?.branch || bill.branch || "Lilycrest",
        billType: "rent",
        roomName: reservation.roomId?.name || reservation.roomId?.roomNumber || "",
      });

      if (emailResult?.success) {
        delivery.email.status = "sent";
        delivery.email.sentAt = new Date();
      } else {
        delivery.email.status = "failed";
        delivery.email.error =
          emailResult?.error || emailResult?.message || "Email delivery failed";
      }
    }

    try {
      // billId/billType/actionUrl were previously omitted here, so the cron-
      // generated rent bill's push payload carried an empty billing_id — the
      // mobile app's resolveNotificationRoute() falls back to the generic
      // Billing tab instead of the specific bill on tap (see
      // controllers/billing/_helpers.js::deliverBillNotification for the
      // pattern this now matches).
      await notify.billGenerated(userId, monthLabel, bill.totalAmount, dueDateLabel, {
        billId: bill._id,
        billType: "rent",
        actionUrl: `/bill-details?billId=${String(bill._id)}`,
        eventId: `invoice:${Number(bill.invoiceVersion || 1)}`,
      });
      delivery.notification.status = "sent";
      delivery.notification.sentAt = new Date();
    } catch (error) {
      delivery.notification.status = "failed";
      delivery.notification.error = error.message || "Notification failed";
    }

    bill.delivery = delivery;
    await bill.save();
  }

  return {
    status: "created",
    cycle: billingCycle,
    bill,
  };
}

/**
 * Automatically generates Monthly Rent bills 5 calendar days before the
 * rent due date, where due date is 2 business days after the end of the
 * tenant's current billing cycle.
 */
export async function generateAutomatedRentBills({ force = false, now = dayjs() } = {}) {
  try {
    let generatedCount = 0;

    const reservations = await Reservation.find({
      status: { $in: CURRENT_RESIDENT_STATUS_QUERY },
      isArchived: false,
    })
      .populate("userId", "firstName lastName email")
      .populate("roomId", "name branch price monthlyPrice type");

    for (const reservation of reservations) {
      const result = await ensureCurrentCycleRentBill({
        reservation,
        referenceDate: now,
        dryRun: false,
        notifyTenant: true,
        requireGenerationDateMatch: !force,
      });

      if (result.status === "created") {
        generatedCount += 1;
      }
    }

    if (generatedCount > 0) {
      logger.info({ count: generatedCount }, "Automated Anniversary Rent Bills Generated");
    }
  } catch (error) {
    logger.error({ err: error }, "Failed to generate anniversary rent bills");
  }
}
