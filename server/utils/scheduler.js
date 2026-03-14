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
 *   1. Overdue move-in detection — daily at 08:30
 *   2. Bed lock cleanup         — every 2 min
 *   3. Overdue bill marking     — daily at midnight
 *   4. Auto-compute penalties   — daily at 00:10
 *   5. Payment due reminders    — daily at 08:00
 *   6. Contract expiration      — daily at 09:00
 *   7. Firebase ↔ MongoDB sync  — daily at 03:00
 *   8. Stale reservation expiry — hourly
 *   9. No-show auto-cancel      — daily at 10:00
 *
 * ============================================================================
 */

import cron from "node-cron";
import dayjs from "dayjs";
import { Reservation, Room, Bill, User } from "../models/index.js";
import { getAuth } from "../config/firebase.js";
import notify from "./notificationService.js";
import { updateOccupancyOnReservationChange } from "./occupancyManager.js";

// ─── Job 1: Overdue Move-In Detection (daily at 08:30) ──────────────────────────

async function detectOverdueMoveIns() {
  try {
    const now = dayjs();
    let notified = 0;

    // Find reserved reservations past their move-in deadline
    const overdueReservations = await Reservation.findOverdueMoveIns()
      .populate("userId", "firstName lastName")
      .populate("roomId", "name branch");

    for (const reservation of overdueReservations) {
      const deadline = reservation.moveInExtendedTo || reservation.targetMoveInDate;
      if (!deadline) continue;
      const daysOverdue = now.diff(dayjs(deadline), "day");
      if (daysOverdue <= 0) continue;

      const tenantName = reservation.userId
        ? `${reservation.userId.firstName || ""} ${reservation.userId.lastName || ""}`.trim()
        : "Unknown tenant";
      const roomName = reservation.roomId?.name || "Unknown room";
      const code = reservation.reservationCode || reservation._id.toString().slice(-6);

      notify.overdueMoveIn(reservation.userId?._id, code, roomName, tenantName, daysOverdue);
      notified++;
    }

    if (notified > 0) {
      console.log(`📢 ${notified} overdue move-in alerts sent`);
    }
  } catch (error) {
    console.error("❌ Overdue move-in detection error:", error);
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

// ─── Job 7: Firebase ↔ MongoDB Sync Cleanup (daily at 03:00) ───────────

async function cleanupOrphanedAccounts() {
  const auth = getAuth();
  if (!auth) {
    console.warn("⚠️ [Sync] Firebase Admin not initialized — skipping sync cleanup");
    return;
  }

  try {
    // 1. Fetch all Firebase Auth users
    const firebaseUsers = [];
    let nextPageToken;
    do {
      const result = await auth.listUsers(1000, nextPageToken);
      firebaseUsers.push(...result.users);
      nextPageToken = result.pageToken;
    } while (nextPageToken);

    // 2. Fetch all MongoDB users
    const mongoUsers = await User.find({}, "firebaseUid email role").lean();

    const firebaseUids = new Set(firebaseUsers.map((u) => u.uid));
    const mongoByUid = new Map(mongoUsers.map((u) => [u.firebaseUid, u]));

    let deletedFirebase = 0;
    let deletedMongo = 0;

    // 3. Delete orphaned Firebase accounts (in Firebase but NOT in MongoDB)
    for (const fbUser of firebaseUsers) {
      if (!mongoByUid.has(fbUser.uid)) {
        try {
          await auth.deleteUser(fbUser.uid);
          deletedFirebase++;
          console.log(`🔥 [Sync] Deleted orphaned Firebase account: ${fbUser.email}`);
        } catch (err) {
          console.error(`❌ [Sync] Failed to delete Firebase user ${fbUser.email}:`, err.message);
        }
      }
    }

    // 4. Delete orphaned MongoDB records (in MongoDB but NOT in Firebase)
    //    Skip admin and superAdmin to prevent accidental deletion
    for (const [uid, mgUser] of mongoByUid) {
      if (!firebaseUids.has(uid)) {
        if (mgUser.role === "admin" || mgUser.role === "superAdmin") {
          console.warn(`⚠️ [Sync] Skipping orphaned admin MongoDB record: ${mgUser.email}`);
          continue;
        }
        try {
          await User.deleteOne({ firebaseUid: uid });
          deletedMongo++;
          console.log(`🍃 [Sync] Deleted orphaned MongoDB record: ${mgUser.email}`);
        } catch (err) {
          console.error(`❌ [Sync] Failed to delete MongoDB user ${mgUser.email}:`, err.message);
        }
      }
    }

    if (deletedFirebase > 0 || deletedMongo > 0) {
      console.log(`🔄 [Sync] Cleanup complete: ${deletedFirebase} Firebase + ${deletedMongo} MongoDB orphan(s) removed`);
    }
  } catch (error) {
    console.error("❌ [Sync] Firebase ↔ MongoDB sync cleanup error:", error.message);
  }
}

// ─── Job 8: Auto-Expire Stale Reservations (hourly) ───────────────────────

async function expireStaleReservations() {
  try {
    const now = dayjs();
    let expired = 0;

    // Tiered expiration windows by status
    const tiers = [
      {
        statuses: ["pending"],
        // 2 hours after creation
        filter: { createdAt: { $lt: now.subtract(2, "hour").toDate() } },
      },
      {
        statuses: ["visit_pending"],
        // 24 hours after creation (they should have scheduled by now)
        filter: { createdAt: { $lt: now.subtract(24, "hour").toDate() } },
      },
      {
        statuses: ["visit_approved"],
        // 48 hours after the visit date passed
        filter: { visitDate: { $lt: now.subtract(48, "hour").toDate() } },
      },
      {
        statuses: ["payment_pending"],
        // 48 hours after reaching this status (use updatedAt as proxy)
        filter: { updatedAt: { $lt: now.subtract(48, "hour").toDate() } },
      },
    ];

    for (const tier of tiers) {
      const reservations = await Reservation.find({
        status: { $in: tier.statuses },
        isArchived: false,
        ...tier.filter,
      })
        .populate("userId", "firstName lastName")
        .populate("roomId", "name");

      for (const reservation of reservations) {
        const oldStatus = reservation.status;
        reservation.status = "cancelled";
        reservation.notes = `${reservation.notes ? reservation.notes + " | " : ""}Auto-expired from "${oldStatus}" — ${now.format("MMM D, YYYY h:mm A")}`;
        await reservation.save();

        // Release the bed
        try {
          await updateOccupancyOnReservationChange(reservation, "cancelled", oldStatus);
        } catch (err) {
          console.error(`⚠️ Bed release failed for ${reservation._id}:`, err.message);
        }

        // Notify tenant
        const code = reservation.reservationCode || reservation._id.toString().slice(-6);
        const roomName = reservation.roomId?.name || "your room";
        if (reservation.userId?._id) {
          notify.reservationExpired(reservation.userId._id, code, roomName);
        }

        expired++;
      }
    }

    if (expired > 0) {
      console.log(`⏰ ${expired} stale reservation(s) auto-expired`);
    }
  } catch (error) {
    console.error("❌ Stale reservation expiration error:", error);
  }
}

// ─── Job 9: Auto-Cancel No-Show Reservations (daily at 10:00) ─────────

async function cancelNoShowReservations() {
  try {
    const now = dayjs();
    const graceDays = 7;
    let cancelled = 0;

    // Find "reserved" (paid) reservations where the move-in deadline + 7 days has passed
    const reservations = await Reservation.find({
      status: "reserved",
      isArchived: false,
    })
      .populate("userId", "firstName lastName")
      .populate("roomId", "name");

    for (const reservation of reservations) {
      const deadline = reservation.moveInExtendedTo || reservation.targetMoveInDate;
      if (!deadline) continue;

      const daysOverdue = now.diff(dayjs(deadline), "day");
      if (daysOverdue < graceDays) continue;

      reservation.status = "cancelled";
      reservation.notes = `${reservation.notes ? reservation.notes + " | " : ""}Auto-cancelled: no-show ${daysOverdue} days past move-in — ${now.format("MMM D, YYYY")}`;
      await reservation.save();

      // Release the bed
      try {
        await updateOccupancyOnReservationChange(reservation, "cancelled", "reserved");
      } catch (err) {
        console.error(`⚠️ Bed release failed for ${reservation._id}:`, err.message);
      }

      // Notify tenant
      const code = reservation.reservationCode || reservation._id.toString().slice(-6);
      const roomName = reservation.roomId?.name || "your room";
      if (reservation.userId?._id) {
        notify.reservationNoShow(reservation.userId._id, code, roomName, daysOverdue);
      }

      cancelled++;
    }

    if (cancelled > 0) {
      console.log(`🚷 ${cancelled} no-show reservation(s) auto-cancelled`);
    }
  } catch (error) {
    console.error("❌ No-show cancellation error:", error);
  }
}

// ─── Scheduler Startup ──────────────────────────────────────────────────

const scheduledJobs = [];

export function startScheduler() {

  // Run cleanup jobs once immediately on startup
  cleanupExpiredBedLocks();
  markOverdueBills();

  // Job 1: Overdue move-in detection — daily at 08:30
  scheduledJobs.push(
    cron.schedule("30 8 * * *", detectOverdueMoveIns, {
      scheduled: true,
      name: "overdue-movein-detection",
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

  // Job 7: Firebase ↔ MongoDB sync cleanup — daily at 03:00
  scheduledJobs.push(
    cron.schedule("0 3 * * *", cleanupOrphanedAccounts, {
      scheduled: true,
      name: "firebase-mongodb-sync",
    }),
  );

  // Job 8: Auto-expire stale reservations — every hour at :15
  scheduledJobs.push(
    cron.schedule("15 * * * *", expireStaleReservations, {
      scheduled: true,
      name: "stale-reservation-expiry",
    }),
  );

  // Job 9: Auto-cancel no-show reservations — daily at 10:00
  scheduledJobs.push(
    cron.schedule("0 10 * * *", cancelNoShowReservations, {
      scheduled: true,
      name: "noshow-reservation-cancel",
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
