/**
 * ============================================================================
 * CENTRALIZED CRON SCHEDULER
 * ============================================================================
 *
 * Uses node-cron to run scheduled tasks instead of raw setInterval.
 * Replaces the ad-hoc setInterval jobs with proper cron scheduling.
 *
 * Schedule Reference (cron syntax):
 *   ┌───── minute (0-59)
 *   │ ┌───── hour (0-23)
 *   │ │ ┌───── day of month (1-31)
 *   │ │ │ ┌───── month (1-12)
 *   │ │ │ │ ┌───── day of week (0-7, 0 and 7 = Sunday)
 *   * * * * *
 *
 * Jobs:
 *   1. Grace period check      — every 15 min
 *   2. Bed lock cleanup         — every 2 min
 *   3. Overdue bill marking     — daily at midnight
 *
 * ============================================================================
 */

import cron from "node-cron";
import dayjs from "dayjs";
import { Reservation, Room, Bill } from "../models/index.js";
import notify from "./notificationService.js";

// ─── Job 1: Grace Period Check (every 15 min) ──────────────────────────

async function processGracePeriods() {
  const now = dayjs();
  let transitioned = 0;
  let cancelled = 0;

  try {
    // Step 1: Confirmed → grace_period
    const confirmedPastMoveIn = await Reservation.find({
      status: "confirmed",
      checkInDate: { $lt: now.toDate() },
      isArchived: false,
    });

    for (const reservation of confirmedPastMoveIn) {
      reservation.status = "grace_period";

      if (!reservation.graceDeadline) {
        const moveIn = dayjs(reservation.checkInDate);
        const days = reservation.gracePeriodDays || 3;
        reservation.graceDeadline = moveIn.add(days, "day").toDate();
      }

      await reservation.save();
      transitioned++;

      const code = reservation.reservationCode || reservation._id.toString().slice(-6);
      const deadline = dayjs(reservation.graceDeadline).format("MMMM D, YYYY");
      notify.gracePeriodWarning(reservation.userId, code, deadline);
    }

    // Step 2: grace_period past deadline → cancelled
    const expiredGrace = await Reservation.find({
      status: "grace_period",
      graceDeadline: { $lt: now.toDate() },
      isArchived: false,
    });

    for (const reservation of expiredGrace) {
      reservation.status = "cancelled";
      reservation.notes = `${reservation.notes ? reservation.notes + " | " : ""}Auto-cancelled: grace period expired`;
      await reservation.save();

      if (reservation.roomId && reservation.selectedBed?.id) {
        try {
          const room = await Room.findById(reservation.roomId);
          if (room) {
            room.vacateBed(reservation.selectedBed.id);
            room.decreaseOccupancy();
            room.updateAvailability();
            await room.save();
          }
        } catch (e) {
          console.error(`⚠️ Failed to release bed for reservation ${reservation._id}:`, e.message);
        }
      }

      cancelled++;

      const code = reservation.reservationCode || reservation._id.toString().slice(-6);
      notify.reservationCancelled(reservation.userId, code, "Grace period expired — no check-in");
    }

    if (transitioned > 0 || cancelled > 0) {
    }
  } catch (error) {
    console.error("❌ Grace period job error:", error);
  }
}

// ─── Job 2: Bed Lock Cleanup (every 2 min) ─────────────────────────────

async function cleanupExpiredBedLocks() {
  try {
    const rooms = await Room.find({
      "beds.status": "locked",
      isArchived: false,
    });

    let totalUnlocked = 0;

    for (const room of rooms) {
      const unlocked = room.unlockExpiredBeds();
      if (unlocked > 0) {
        await room.save();
        totalUnlocked += unlocked;
      }
    }

    if (totalUnlocked > 0) {
    }
  } catch (error) {
    console.error("❌ Bed lock cleanup error:", error);
  }
}

// ─── Job 3: Overdue Bill Marking (daily at midnight) ────────────────────

async function markOverdueBills() {
  try {
    const now = dayjs().toDate();
    const result = await Bill.updateMany(
      {
        status: "pending",
        dueDate: { $lt: now },
        isArchived: false,
      },
      { $set: { status: "overdue" } },
    );

    if (result.modifiedCount > 0) {
    }
  } catch (error) {
    console.error("❌ Overdue bill marking error:", error);
  }
}

// ─── Job 4: Auto-Compute Penalties (daily at 00:10) ────────────────────

async function computeOverduePenalties() {
  try {
    const now = dayjs();
    const overdueBills = await Bill.find({
      status: "overdue",
      isArchived: false,
    }).populate("userId", "firstName lastName");

    let updated = 0;

    for (const bill of overdueBills) {
      const daysLate = now.diff(dayjs(bill.dueDate), "day");
      if (daysLate <= 0) continue;

      const ratePerDay = bill.penaltyDetails?.ratePerDay || 50;
      const newPenalty = daysLate * ratePerDay;
      const oldPenalty = bill.charges?.penalty || 0;

      // Only update if penalty changed (avoid spamming notifications)
      if (newPenalty === oldPenalty) continue;

      bill.charges.penalty = newPenalty;
      bill.penaltyDetails.daysLate = daysLate;
      bill.penaltyDetails.appliedAt = now.toDate();

      // Recalculate total: rent + electricity + water + applianceFees + corkageFees + penalty - discount + additionalCharges
      const c = bill.charges;
      const additionalTotal = (bill.additionalCharges || []).reduce((sum, ch) => sum + (ch.amount || 0), 0);
      bill.totalAmount = (c.rent || 0) + (c.electricity || 0) + (c.water || 0) +
        (c.applianceFees || 0) + (c.corkageFees || 0) + (c.penalty || 0) -
        (c.discount || 0) + additionalTotal;

      await bill.save();
      updated++;

      // Notify tenant (only on first penalty or when it increases significantly)
      if (oldPenalty === 0 && bill.userId) {
        const month = dayjs(bill.billingMonth).format("MMMM YYYY");
        notify.penaltyApplied(bill.userId._id || bill.userId, month, newPenalty, daysLate);
      }
    }

    if (updated > 0) {
    }
  } catch (error) {
    console.error("❌ Penalty computation error:", error);
  }
}

// ─── Job 5: Payment Due-Date Reminders (daily at 08:00) ────────────────

async function sendPaymentReminders() {
  try {
    const now = dayjs();
    const reminderDays = [7, 3, 1];
    let sent = 0;

    for (const daysAhead of reminderDays) {
      const targetDate = now.add(daysAhead, "day").startOf("day");
      const nextDay = targetDate.add(1, "day");

      const bills = await Bill.find({
        status: "pending",
        dueDate: { $gte: targetDate.toDate(), $lt: nextDay.toDate() },
        isArchived: false,
      });

      for (const bill of bills) {
        const month = dayjs(bill.billingMonth).format("MMMM YYYY");
        notify.billDueReminder(bill.userId, month, bill.totalAmount, daysAhead);
        sent++;
      }
    }

    if (sent > 0) {
    }
  } catch (error) {
    console.error("❌ Payment reminder error:", error);
  }
}

// ─── Job 6: Contract Expiration Alerts (daily at 09:00) ────────────────

async function checkContractExpirations() {
  try {
    const now = dayjs();
    const alertDays = [30, 15, 7, 1];
    let sent = 0;

    // Get all checked-in reservations
    const activeReservations = await Reservation.find({
      status: "checked-in",
      isArchived: false,
    }).populate("roomId", "name");

    for (const reservation of activeReservations) {
      if (!reservation.checkInDate || !reservation.leaseDuration) continue;

      const contractEnd = dayjs(reservation.checkInDate).add(reservation.leaseDuration, "month");
      const daysRemaining = contractEnd.diff(now, "day");

      // Send alert only on exact reminder days
      if (alertDays.includes(daysRemaining)) {
        const roomName = reservation.roomId?.name || "your room";
        notify.contractExpiring(reservation.userId, roomName, daysRemaining);
        sent++;
      }
    }

    if (sent > 0) {
    }
  } catch (error) {
    console.error("❌ Contract expiration check error:", error);
  }
}

// ─── Scheduler Startup ──────────────────────────────────────────────────

const scheduledJobs = [];

export function startScheduler() {

  // Run all jobs once immediately on startup
  processGracePeriods();
  cleanupExpiredBedLocks();
  markOverdueBills();

  // Job 1: Grace period — every 15 minutes
  scheduledJobs.push(
    cron.schedule("*/15 * * * *", processGracePeriods, {
      scheduled: true,
      name: "grace-period-check",
    }),
  );

  // Job 2: Bed lock cleanup — every 2 minutes
  scheduledJobs.push(
    cron.schedule("*/2 * * * *", cleanupExpiredBedLocks, {
      scheduled: true,
      name: "bed-lock-cleanup",
    }),
  );

  // Job 3: Overdue bill marking — daily at 00:05 (5 min after midnight)
  scheduledJobs.push(
    cron.schedule("5 0 * * *", markOverdueBills, {
      scheduled: true,
      name: "overdue-bill-marking",
    }),
  );

  // Job 4: Auto-compute penalties — daily at 00:10 (after overdue marking)
  scheduledJobs.push(
    cron.schedule("10 0 * * *", computeOverduePenalties, {
      scheduled: true,
      name: "overdue-penalty-computation",
    }),
  );

  // Job 5: Payment due reminders — daily at 08:00
  scheduledJobs.push(
    cron.schedule("0 8 * * *", sendPaymentReminders, {
      scheduled: true,
      name: "payment-due-reminders",
    }),
  );

  // Job 6: Contract expiration alerts — daily at 09:00
  scheduledJobs.push(
    cron.schedule("0 9 * * *", checkContractExpirations, {
      scheduled: true,
      name: "contract-expiration-alerts",
    }),
  );

}

/** Stop all cron jobs (for graceful shutdown) */
export function stopScheduler() {
  for (const job of scheduledJobs) {
    job.stop();
  }
  scheduledJobs.length = 0;
}

export default { startScheduler, stopScheduler };
