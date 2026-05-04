import dayjs from "dayjs";
import { Bill, Reservation } from "../models/index.js";
import {
  getReservationCreditAvailable,
  getReservationRecurringFees,
  roundMoney,
  resolveVisibleRentBillingCycle,
  syncBillAmounts,
} from "./billingPolicy.js";
import logger from "../middleware/logger.js";
import notify from "./notificationService.js";
import { sendBillGeneratedEmail } from "../config/email.js";
import {
  CURRENT_RESIDENT_STATUS_QUERY,
  readMoveInDate,
} from "./lifecycleNaming.js";

/**
 * Resolve the recurring monthly rent amount for the reservation on a given date.
 */
export function resolveReservationRentAmount(
  reservation,
  referenceDate = new Date(),
) {
  const moveInDate = readMoveInDate(reservation);
  const referenceDay = dayjs(referenceDate).startOf("day");
  const isLongTerm =
    moveInDate &&
    referenceDay.diff(dayjs(moveInDate).startOf("day"), "month", true) >= 6;

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
  const currentDay = dayjs(referenceDate).startOf("day");
  if (!moveInDate || !reservation?.userId || !reservation?.roomId) {
    return { status: "skipped", reason: "missing_context" };
  }

  const billingCycle = resolveVisibleRentBillingCycle(moveInDate, referenceDate);
  if (!billingCycle) {
    return { status: "skipped", reason: "outside_generation_window" };
  }

  const generationDay = dayjs(billingCycle.generationDate).startOf("day");
  if (requireGenerationDateMatch && !currentDay.isSame(generationDay, "day")) {
    return {
      status: "skipped",
      reason: "outside_generation_day",
      cycle: billingCycle,
    };
  }

  const billingMonthStartDate = dayjs(billingCycle.billingCycleStart).toDate();
  const billingCycleEndDate = dayjs(billingCycle.billingCycleEnd).toDate();
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
  const creditAvailable = getReservationCreditAvailable(reservation);
  const reservationCreditApplied = isFirstCycleBill
    ? Math.min(grossAmount, creditAvailable)
    : 0;

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

  if (reservationCreditApplied > 0 && typeof reservation.save === "function") {
    reservation.reservationCreditConsumedAt = currentDay.toDate();
    reservation.reservationCreditAppliedBillId = bill._id;
    await reservation.save();
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
      await notify.billGenerated(userId, monthLabel, bill.totalAmount, dueDateLabel);
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
