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
 *  10. Stale visit_pending warn  — daily at 08:00
 *  11. Archive stale cancelled   — daily at 02:00
 *
 * ============================================================================
 */

import cron from "node-cron";
import dayjs from "dayjs";
import { Reservation, Room, Bill, User } from "../models/index.js";
import { getAuth } from "../config/firebase.js";
import notify from "./notificationService.js";
import { updateOccupancyOnReservationChange } from "./occupancyManager.js";
import logger from "../middleware/logger.js";
import { BUSINESS } from "../config/constants.js";
import { resolveBillStatus, syncBillAmounts } from "./billingPolicy.js";
import { getPenaltyRatePerDay, resolvePenaltyRatePerDay } from "./businessSettings.js";
import { generateAutomatedRentBills } from "./rentGenerator.js";

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
      logger.info({ count: notified }, "Overdue move-in alerts sent");
    }
  } catch (error) {
    logger.error({ err: error }, "Overdue move-in detection failed");
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
      logger.info({ count: totalUnlocked }, "Expired bed locks released");
    }
  } catch (error) {
    logger.error({ err: error }, "Bed lock cleanup failed");
  }
}

// ─── Job 3: Overdue Bill Marking (daily at midnight) ────────────────────

async function markOverdueBills() {
  try {
    const now = dayjs().toDate();
    const result = await Bill.updateMany(
      {
        status: { $in: ["pending", "partially-paid"] },
        dueDate: { $lt: now },
        isArchived: false,
      },
      { $set: { status: "overdue" } },
    );

    if (result.modifiedCount > 0) {
      logger.info({ count: result.modifiedCount }, "Bills marked overdue");
    }
  } catch (error) {
    logger.error({ err: error }, "Overdue bill marking failed");
  }
}

// ─── Job 4: Auto-Compute Penalties (daily at 00:10) ────────────────────

async function computeOverduePenalties() {
  try {
    const now = dayjs();
    const penaltyRatePerDay = await getPenaltyRatePerDay();
    const overdueBills = await Bill.find({
      status: "overdue",
      isArchived: false,
    }).populate("userId", "firstName lastName");

    let updated = 0;

    for (const bill of overdueBills) {
      const daysLate = now.diff(dayjs(bill.dueDate), "day");
      if (daysLate <= 0) continue;

      const ratePerDay = resolvePenaltyRatePerDay(
        bill.penaltyDetails?.ratePerDay,
        penaltyRatePerDay,
      );
      const newPenalty = daysLate * ratePerDay;
      const oldPenalty = bill.charges?.penalty || 0;

      // Only update if penalty changed (avoid spamming notifications)
      if (newPenalty === oldPenalty) continue;

      bill.charges.penalty = newPenalty;
      bill.penaltyDetails.daysLate = daysLate;
      bill.penaltyDetails.appliedAt = now.toDate();
      syncBillAmounts(bill);
      bill.status = resolveBillStatus(bill, now.toDate());

      await bill.save();
      updated++;

      // Notify tenant (only on first penalty or when it increases significantly)
      if (oldPenalty === 0 && bill.userId) {
        const month = dayjs(bill.billingMonth).format("MMMM YYYY");
        notify.penaltyApplied(bill.userId._id || bill.userId, month, newPenalty, daysLate);
      }
    }

    if (updated > 0) {
      logger.info({ count: updated }, "Overdue penalties recomputed");
    }
  } catch (error) {
    logger.error({ err: error }, "Penalty computation failed");
  }
}

// ─── Job 5: Payment Due-Date Reminders (daily at 08:00) ────────────────

async function sendPaymentReminders() {
  try {
    const now = dayjs();
    const reminderDays = [5, 3, 1];
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
        // Skip the 5-day reminder if the bill was literally just generated in the last 24 hours 
        // to avoid duplicate spam with the "New Bill Generated" email.
        const ageInDays = now.diff(dayjs(bill.createdAt || new Date()), "day", true);
        if (daysAhead === 5 && ageInDays < 1) {
           continue; 
        }

        const month = dayjs(bill.billingMonth).format("MMMM YYYY");
        notify.billDueReminder(bill.userId, month, bill.totalAmount, daysAhead);
        sent++;
      }
    }

    if (sent > 0) {
      logger.info({ count: sent }, "Payment due reminders sent");
    }
  } catch (error) {
    logger.error({ err: error }, "Payment reminder failed");
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
      logger.info({ count: sent }, "Contract expiration alerts sent");
    }
  } catch (error) {
    logger.error({ err: error }, "Contract expiration check failed");
  }
}

// ─── Job 7: Firebase ↔ MongoDB Sync Cleanup (daily at 03:00) ───────────

async function cleanupOrphanedAccounts() {
  const auth = getAuth();
  if (!auth) {
    logger.warn("Sync: Firebase Admin not initialized — skipping orphan cleanup");
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
          logger.info({ email: fbUser.email }, "Sync: deleted orphaned Firebase account");
        } catch (err) {
          logger.error({ err, email: fbUser.email }, "Sync: failed to delete Firebase user");
        }
      }
    }

    // 4. Delete orphaned MongoDB records (in MongoDB but NOT in Firebase)
    //    Skip admin and superAdmin to prevent accidental deletion
    for (const [uid, mgUser] of mongoByUid) {
      if (!firebaseUids.has(uid)) {
        if (mgUser.role === "branch_admin" || mgUser.role === "owner") {
          logger.warn({ email: mgUser.email }, "Sync: skipping orphaned admin record — manual review required");
          continue;
        }
        try {
          await User.deleteOne({ firebaseUid: uid });
          deletedMongo++;
          logger.info({ email: mgUser.email }, "Sync: deleted orphaned MongoDB record");
        } catch (err) {
          logger.error({ err, email: mgUser.email }, "Sync: failed to delete MongoDB user");
        }
      }
    }

    if (deletedFirebase > 0 || deletedMongo > 0) {
      logger.info(
        { deletedFirebase, deletedMongo },
        "Sync: orphan cleanup complete",
      );
    }
  } catch (error) {
    logger.error({ err: error }, "Sync: Firebase-MongoDB cleanup failed");
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
        filter: { createdAt: { $lt: now.subtract(BUSINESS.STALE_PENDING_HOURS, "hour").toDate() } },
      },
      {
        statuses: ["visit_pending"],
        // 24 hours after creation (they should have scheduled by now)
        filter: { createdAt: { $lt: now.subtract(BUSINESS.STALE_VISIT_PENDING_HOURS, "hour").toDate() } },
      },
      {
        statuses: ["visit_approved"],
        // 48 hours after the visit date passed
        filter: { visitDate: { $lt: now.subtract(BUSINESS.STALE_VISIT_APPROVED_HOURS, "hour").toDate() } },
      },
      {
        statuses: ["payment_pending"],
        // 48 hours after reaching this status (use updatedAt as proxy)
        filter: { updatedAt: { $lt: now.subtract(BUSINESS.STALE_PAYMENT_PENDING_HOURS, "hour").toDate() } },
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
          await updateOccupancyOnReservationChange(reservation, { status: oldStatus });
        } catch (err) {
          logger.error({ err, reservationId: String(reservation._id) }, "Stale expiry: bed release failed");
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
      logger.info({ count: expired }, "Stale reservations auto-expired");
    }
  } catch (error) {
    logger.error({ err: error }, "Stale reservation expiration failed");
  }
}

// ─── Job 9: Auto-Cancel No-Show Reservations (daily at 10:00) ─────────

async function cancelNoShowReservations() {
  try {
    const now = dayjs();
    const graceDays = BUSINESS.NOSHOW_GRACE_DAYS;
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
        await updateOccupancyOnReservationChange(reservation, { status: "reserved" });
      } catch (err) {
        logger.error({ err, reservationId: String(reservation._id) }, "No-show cancel: bed release failed");
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
      logger.info({ count: cancelled }, "No-show reservations auto-cancelled");
    }
  } catch (error) {
    logger.error({ err: error }, "No-show cancellation failed");
  }
}

// ─── Job 10: Warn Admins About Stale Visit-Pending (daily at 08:00) ─────

async function warnStaleVisitPending() {
  try {
    const now = dayjs();
    const warnDays = BUSINESS.VISIT_PENDING_WARN_DAYS;
    const cutoff = now.subtract(warnDays, "day").toDate();
    let warned = 0;

    // Find visit_pending reservations older than VISIT_PENDING_WARN_DAYS
    const staleVisits = await Reservation.find({
      status: "visit_pending",
      isArchived: false,
      createdAt: { $lt: cutoff },
    })
      .populate("userId", "firstName lastName")
      .populate("roomId", "name branch");

    for (const reservation of staleVisits) {
      const branch = reservation.roomId?.branch;
      if (!branch) continue;

      const daysPending = now.diff(dayjs(reservation.createdAt), "day");
      const tenantName = reservation.userId
        ? `${reservation.userId.firstName || ""} ${reservation.userId.lastName || ""}`.trim()
        : "Unknown applicant";
      const roomName = reservation.roomId?.name || "Unknown room";

      // Find admins for this branch
      const branchAdmins = await User.find({
        role: { $in: ["branch_admin", "owner"] },
        branch: branch,
        isArchived: false,
      }).select("_id");

      for (const admin of branchAdmins) {
        notify.stalePendingVisitWarning(admin._id, tenantName, roomName, daysPending);
        warned++;
      }
    }

    if (warned > 0) {
      logger.info({ count: warned }, "Stale visit_pending admin warnings sent");
    }
  } catch (error) {
    logger.error({ err: error }, "Stale visit_pending warning job failed");
  }
}

// ─── Job 11: Auto-Archive Old Cancelled Reservations (daily at 02:00) ───

async function archiveStaleCancelled() {
  try {
    const now = dayjs();
    const cutoff = now.subtract(BUSINESS.ARCHIVE_CANCELLED_AFTER_DAYS, "day").toDate();
    let archived = 0;

    // Find cancelled, non-archived records older than threshold
    // Only auto-archive if user never submitted personal info (safe to hide)
    const staleRecords = await Reservation.find({
      status: "cancelled",
      isArchived: false,
      updatedAt: { $lt: cutoff },
      $or: [
        { firstName: null },
        { firstName: "" },
        { firstName: { $exists: false } },
      ],
    });

    for (const reservation of staleRecords) {
      reservation.isArchived = true;
      reservation.archivedAt = now.toDate();
      reservation.notes = `${reservation.notes ? reservation.notes + " | " : ""}Auto-archived: cancelled ${BUSINESS.ARCHIVE_CANCELLED_AFTER_DAYS}+ days ago — ${now.format("MMM D, YYYY")}`;
      await reservation.save();
      archived++;
    }

    if (archived > 0) {
      logger.info({ count: archived }, "Stale cancelled reservations auto-archived");
    }
  } catch (error) {
    logger.error({ err: error }, "Stale cancelled reservation archiving failed");
  }
}

// ─── Scheduler Startup ──────────────────────────────────────────────────

const scheduledJobs = [];

export function startScheduler() {

  // Run cleanup jobs once immediately on startup
  cleanupExpiredBedLocks();
  markOverdueBills();

  // Job 0: Automated Rent Bills — daily at midnight
  scheduledJobs.push(
    cron.schedule('0 0 * * *', generateAutomatedRentBills, {
      scheduled: true,
      name: 'automated-rent-generation',
    }),
  );

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

  // Job 10: Warn admins about stale visit_pending reservations — daily at 08:00
  scheduledJobs.push(
    cron.schedule("0 8 * * *", warnStaleVisitPending, {
      scheduled: true,
      name: "stale-visit-pending-warning",
    }),
  );

  // Job 11: Auto-archive old cancelled reservations — daily at 02:00
  scheduledJobs.push(
    cron.schedule("0 2 * * *", archiveStaleCancelled, {
      scheduled: true,
      name: "archive-stale-cancelled",
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
