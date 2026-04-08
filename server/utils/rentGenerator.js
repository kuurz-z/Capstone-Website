import dayjs from "dayjs";
import { Bill, Reservation, Room, User } from "../models/index.js";
import { getPenaltyRatePerDay } from "./businessSettings.js";
import { syncBillAmounts, getReservationCreditAvailable } from "./billingPolicy.js";
import logger from "../middleware/logger.js";
import notify from "./notificationService.js";
import {
  CURRENT_RESIDENT_STATUS_QUERY,
  readMoveInDate,
} from "./lifecycleNaming.js";

/**
 * Automatically generates Monthly Rent bills for tenants 5 days before their check-in anniversary.
 */
export async function generateAutomatedRentBills() {
  try {
    const now = dayjs();
    let generatedCount = 0;

    // We look for all checked-in reservations
    const reservations = await Reservation.find({
      status: { $in: CURRENT_RESIDENT_STATUS_QUERY },
      isArchived: false,
    })
      .populate("userId", "firstName lastName email")
      .populate("roomId", "name branch price monthlyPrice type");

    for (const reservation of reservations) {
      const moveInDate = readMoveInDate(reservation);
      if (!moveInDate || !reservation.userId || !reservation.roomId) {
        continue;
      }

      const checkInDay = dayjs(moveInDate).date();
      
      // Calculate their NEXT anniversary date based on the current month/year
      // If today's day is past the check-in day, their next due date is next month.
      let nextAnniversary = now.date(checkInDay).startOf('day');
      if (now.date() > checkInDay - 5) {
        nextAnniversary = nextAnniversary.add(1, 'month');
      }

      const dueInDays = nextAnniversary.diff(now.startOf('day'), 'day');

      // The exact generation trigger is exactly 5 days before the anniversary!
      if (dueInDays !== 5) {
        continue;
      }

      // Do NOT generate automated bills for the first month or prior to checkInDate!
      // The move-in payment covers the first cycle (from checkInDate to checkInDate + 1 month).
      // Therefore, the first automated bill should only be due starting exactly 1 month AFTER checkInDate.
      if (!nextAnniversary.isAfter(dayjs(moveInDate).endOf('day'), 'day')) {
        continue;
      }

      // Determine rent price
      const isLongTerm = dayjs().diff(dayjs(moveInDate), "month", true) >= 6;
      let rentPrice = reservation.monthlyRent || reservation.totalPrice;
      if (!rentPrice) {
        rentPrice = isLongTerm ? (reservation.roomId.monthlyPrice ?? reservation.roomId.price ?? 0) : (reservation.roomId.price ?? 0);
      }

      // Handle Appliance Fees (Guadalupe branch only)
      let applianceFees = 0;
      let additionalCharges = [];
      const branch = reservation.roomId.branch;

      if (branch === "guadalupe") {
        const customCharges = reservation.customCharges || [];
        applianceFees = customCharges.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
        additionalCharges = customCharges.map((c) => ({
          name: c.name,
          amount: c.amount,
        }));
      }

      const grossAmount = rentPrice + applianceFees;
      const billingMonthStartDate = nextAnniversary.subtract(1, 'month').toDate();

      // Check if we already generated a rent bill for this specific period to prevent duplicates
      const dupeFilter = {
        userId: reservation.userId._id,
        reservationId: reservation._id,
        billingMonth: billingMonthStartDate,
        "charges.rent": { $gt: 0 },
        isArchived: false,
      };

      if (await Bill.findOne(dupeFilter)) {
        continue; // Already billed
      }

      // Apply Reservation Credit if this is their first ever automated bill and credit is unused
      const creditAvailable = getReservationCreditAvailable(reservation);
      const reservationCreditApplied = Math.min(grossAmount, creditAvailable);

      // Generate the Bill
      const bill = new Bill({
        reservationId: reservation._id,
        userId: reservation.userId._id,
        branch: branch,
        roomId: reservation.roomId._id,
        billingMonth: billingMonthStartDate,
        billingCycleStart: billingMonthStartDate,
        billingCycleEnd: nextAnniversary.toDate(),
        dueDate: nextAnniversary.toDate(),
        isFirstCycleBill: reservationCreditApplied > 0, // Flag it as the first cycle if credit is applied
        proRataDays: dayjs(nextAnniversary).diff(dayjs(billingMonthStartDate), 'day'),
        charges: {
          rent: rentPrice,
          electricity: 0,
          water: 0,
          applianceFees: applianceFees,
          corkageFees: 0,
          penalty: 0,
          discount: 0,
        },
        additionalCharges: additionalCharges,
        grossAmount: grossAmount,
        reservationCreditApplied: reservationCreditApplied,
        totalAmount: grossAmount,
        remainingAmount: grossAmount,
        status: "pending", 
      });

      syncBillAmounts(bill);
      await bill.save();

      // Ensure the credit goes away so it's not applied to the next month
      if (reservationCreditApplied > 0) {
        reservation.reservationCreditConsumedAt = new Date();
        reservation.reservationCreditAppliedBillId = bill._id;
        await reservation.save();
      }
      generatedCount++;

      // Notify the tenant
      if (reservation.userId.email) {
        const monthLabel = dayjs(billingMonthStartDate).format("MMMM YYYY");
        const dueDateLabel = nextAnniversary.format("MMMM D, YYYY");
        // We can send the standard Bill Generated notification here
        notify.billGenerated(reservation.userId._id, monthLabel, bill.totalAmount, dueDateLabel);
      }
    }

    if (generatedCount > 0) {
      logger.info({ count: generatedCount }, "Automated Anniversary Rent Bills Generated");
    }
  } catch (error) {
    logger.error({ err: error }, "Failed to generate anniversary rent bills");
  }
}
