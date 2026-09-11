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
 *   3. Overdue bill marking     — daily at 01:00
 *   4. Auto-compute penalties   — daily at 01:10
 *   5. Payment due reminders    — daily at 08:00
 *   6. Contract expiration      — daily at 09:00
 *   7. Firebase ↔ MongoDB sync  — daily at 03:00
 *   8. Stale reservation expiry — hourly
 *   9. No-show auto-cancel      — daily at 10:00
 *  10. Stale visit_pending warn  — daily at 08:00
 *  11. Archive stale cancelled   — daily at 02:00
 *  19. Missing contract generation reconciliation — daily at 04:10
 *
 * ============================================================================
 */

import cron from "node-cron";
import dayjs from "dayjs";
import { Reservation, Room, Bill, User, MaintenanceRequest, Contract } from "../models/index.js";
import { resolveReservationContractEligibility } from "../services/reservationContractEligibilityService.js";
import { getAuth } from "../config/firebase.js";
import notify from "./notificationService.js";
import { activateDueRenewalContracts } from "../services/contractRenewalActivationService.js";
import {
  updateOccupancyOnReservationChange,
  releaseOrphanedBeds,
} from "./occupancyManager.js";
import logger from "../middleware/logger.js";
import { autoCloseInactiveChatConversations } from "../controllers/chatController.js";
import {
  ACTIVE_OCCUPANCY_STATUS_QUERY,
  CURRENT_RESIDENT_STATUS_QUERY,
  readMoveInDate,
} from "./lifecycleNaming.js";
import { syncReservationUserLifecycle } from "./reservationHelpers.js";
import { resolveBillStatus, syncBillAmounts } from "./billingPolicy.js";
import {
  getLifecyclePolicySettings,
} from "./businessSettings.js";
import { computePenalty, fetchPenaltySettings } from "./penaltyCalculator.js";

// ─── Shared helpers ──────────────────────────────────────────────────────────

/**
 * Attempt `fn` once. On failure, retry once more. If the retry also fails,
 * log the error and optionally alert branch admins so the failure surfaces
 * to the operations team rather than disappearing silently.
 */
async function retryJobOperation(fn, { label, branch = null } = {}) {
  try {
    await fn();
  } catch (firstErr) {
    logger.warn({ err: firstErr }, `${label}: attempt 1 failed — retrying`);
    try {
      await fn();
    } catch (secondErr) {
      logger.error({ err: secondErr }, `${label}: retry failed — alerting admins`);
      try {
        const adminQuery = {
          role: { $in: ["branch_admin", "owner"] },
          isArchived: false,
          accountStatus: "active",
        };
        if (branch) adminQuery.branch = branch;
        const admins = await User.find(adminQuery).select("_id").lean();
        for (const admin of admins) {
          notify.general(
            admin._id,
            "Scheduler Error — Manual Action Required",
            `A background job failed after retry: ${label}. Please check the server logs and resolve manually.`,
          );
        }
      } catch {
        // notification failure must never crash the scheduler
      }
    }
  }
}
import { generateAutomatedRentBills } from "./rentGenerator.js";
import { dispatchDueScheduledAnnouncements } from "./announcementDispatch.js";
import { detectSlaBreaches } from "./slaAlertJob.js";
import { sendPaymentReminderEmail } from "../config/email.js";

// ─── Job 1: Overdue Move-In Detection (daily at 08:30) ──────────────────────────

async function detectOverdueMoveIns() {
  try {
    const now = dayjs();
    let notified = 0;
    let flagged = 0;

    // Find reserved reservations past their move-in deadline
    const overdueReservations = await Reservation.findOverdueMoveIns()
      .populate("userId", "firstName lastName")
      .populate("roomId", "name branch")
      .lean();

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

      // Reservation.js's own findOverdueMoveIns doc comment: "If you are a
      // background job flagging a no-show, set status = 'move_in_overdue' —
      // that is the correct action." Only flag, never cancel/release here —
      // Spec §9.3: "From overdue, admin can reschedule (back to reserved),
      // confirm move-in, or explicitly cancel. System never auto-transitions
      // out." Only reservations still at "reserved" are eligible (the model
      // query already filters to this), so this is always a legal
      // reserved -> move_in_overdue transition per
      // ALLOWED_RESERVATION_STATUS_TRANSITIONS.
      if (reservation.status === "reserved") {
        try {
          await Reservation.updateOne(
            { _id: reservation._id, status: "reserved" },
            { $set: { status: "move_in_overdue" } },
          );
          flagged++;
        } catch (flagErr) {
          logger.warn(
            { err: flagErr, reservationId: reservation._id },
            "detectOverdueMoveIns: failed to flag move_in_overdue (non-fatal, will retry next run)",
          );
        }
      }
    }

    if (notified > 0) {
      logger.info({ count: notified, flagged }, "Overdue move-in alerts sent");
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

    // Collect bill IDs before the bulk update so we can notify tenants afterwards.
    const billsToMark = await Bill.find(
      {
        status: { $in: ["pending", "partially-paid"] },
        dueDate: { $ne: null, $lt: now },
        isArchived: false,
      },
      { _id: 1, userId: 1, billingMonth: 1 },
    ).lean();

    if (billsToMark.length === 0) return;

    const ids = billsToMark.map((b) => b._id);
    await Bill.updateMany({ _id: { $in: ids } }, { $set: { status: "overdue" } });

    logger.info({ count: billsToMark.length }, "Bills marked overdue");

    for (const bill of billsToMark) {
      if (!bill.userId) continue;
      const month = dayjs(bill.billingMonth).format("MMMM YYYY");
      await notify.billingNotice(bill.userId, {
        notificationType: "bill_due_reminder",
        title: "Bill Overdue",
        message: `Your bill for ${month} is now overdue. Please settle it as soon as possible to avoid additional penalties.`,
        billId: bill._id,
        pushType: "billing_overdue_notice",
        eventId: "status:overdue",
      });
    }
  } catch (error) {
    logger.error({ err: error }, "Overdue bill marking failed");
  }
}

// ─── Job 4: Auto-Compute Penalties (daily at 00:10) ────────────────────

async function computeOverduePenalties() {
  try {
    const now = dayjs();
    const settings = await fetchPenaltySettings();
    const overdueBills = await Bill.find({
      status: "overdue",
      isArchived: false,
    }).populate("userId", "firstName lastName");

    let updated = 0;

    for (const bill of overdueBills) {
      if (!bill?.dueDate) continue;

      const { penalty: newPenalty, daysLate, ratePerDay } = await computePenalty(bill, settings, now);
      if (daysLate <= 0) continue;
      const oldPenalty = bill.charges?.penalty || 0;

      // Only update if penalty changed (avoid spamming notifications)
      if (newPenalty === oldPenalty) continue;

      bill.charges.penalty = newPenalty;
      bill.penaltyDetails.daysLate = daysLate;
      bill.penaltyDetails.ratePerDay = ratePerDay;
      bill.penaltyDetails.appliedAt = now.toDate();
      syncBillAmounts(bill);
      bill.status = resolveBillStatus(bill, now.toDate());

      await bill.save();
      updated++;

      // Notify tenant (only on first penalty or when it increases significantly)
      if (oldPenalty === 0 && bill.userId) {
        const month = dayjs(bill.billingMonth).format("MMMM YYYY");
        await notify.penaltyApplied(
          bill.userId._id || bill.userId,
          month,
          newPenalty,
          daysLate,
          { billId: bill._id, eventId: bill.penaltyDetails.appliedAt },
        );
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
    const reminderDays = [3, 2, 1, 0];
    let sent = 0;

    for (const daysAhead of reminderDays) {
      const targetDate = now.add(daysAhead, "day").startOf("day");
      const nextDay = targetDate.add(1, "day");

      const bills = await Bill.find({
        status: { $in: ["pending", "partially-paid"] },
        dueDate: { $gte: targetDate.toDate(), $lt: nextDay.toDate() },
        isArchived: false,
      })
        .populate("userId", "firstName lastName email")
        .populate("roomId", "name branch");

      for (const bill of bills) {
        if (!bill.userId) continue;
        const month = dayjs(bill.billingMonth).format("MMMM YYYY");
        const userId = bill.userId._id || bill.userId;
        const tenantName = [bill.userId?.firstName, bill.userId?.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() || "Tenant";
        const dueDateLabel = dayjs(bill.dueDate).format("MMMM D, YYYY");
        const billTypeLabel = (bill.charges?.rent || 0) > 0 ? "Rent" : "Utility";

        await notify.billDueReminder(
          userId,
          month,
          bill.totalAmount,
          daysAhead,
          { billId: bill._id, eventId: `due:${daysAhead}` },
        );

        // Send payment reminder email on 3-day pre-due milestone
        if (daysAhead === 3 && bill.userId?.email) {
          try {
            await sendPaymentReminderEmail({
              to: bill.userId.email,
              tenantName,
              billingMonth: month,
              totalAmount: bill.totalAmount,
              dueDate: dueDateLabel,
              billType: billTypeLabel,
              branchName: bill.branch || bill.roomId?.branch || "Lilycrest",
            });
          } catch (emailErr) {
            logger.warn({ err: emailErr, billId: bill._id }, "Failed to send 3-day payment reminder email");
          }
        }

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

    // Get all moved-in reservations (read-only — notify only, no saves)
    const activeReservations = await Reservation.find({
      status: { $in: CURRENT_RESIDENT_STATUS_QUERY },
      isArchived: false,
    }).populate("roomId", "name").lean();

    for (const reservation of activeReservations) {
      const moveInDate = readMoveInDate(reservation);
      if (!moveInDate || !reservation.leaseDuration) continue;

      const contractEnd = dayjs(moveInDate).add(reservation.leaseDuration, "month");
      const daysRemaining = contractEnd.diff(now, "day");

      // Send alert only on exact reminder days
      if (alertDays.includes(daysRemaining)) {
        const roomName = reservation.roomId?.name || "your room";
        await notify.contractExpiring(reservation.userId, roomName, daysRemaining);
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
    const mongoUsers = await User.find({}, "firebaseUid email role tenantStatus _id").lean();

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
    //    Skip admins, owners, and any user with an active or past tenancy.
    for (const [uid, mgUser] of mongoByUid) {
      if (!firebaseUids.has(uid)) {
        if (mgUser.role === "branch_admin" || mgUser.role === "owner") {
          logger.warn({ email: mgUser.email }, "Sync: skipping orphaned admin record — manual review required");
          continue;
        }

        // Never delete a user who has (or had) a tenancy — their bills and
        // reservation records would become orphaned.
        if (mgUser.tenantStatus && mgUser.tenantStatus !== "applicant") {
          logger.warn({ email: mgUser.email, tenantStatus: mgUser.tenantStatus }, "Sync: skipping orphaned user with active/past tenancy");
          continue;
        }

        // BUG FIX (Layer 1B): use ACTIVE_OCCUPANCY_STATUS_QUERY (reserved + moveIn)
        // instead of CURRENT_RESIDENT_STATUS_QUERY (moveIn only) to catch reserved
        // reservations that were left behind by previous orphan cleanups.
        const activeReservationCount = await Reservation.countDocuments({
          userId: mgUser._id,
          status: { $in: ACTIVE_OCCUPANCY_STATUS_QUERY },
          isArchived: { $ne: true },
        });
        if (activeReservationCount > 0) {
          logger.warn(
            { email: mgUser.email, activeReservationCount },
            "Sync: skipping orphaned user — has active occupancy reservation(s) (reserved/moveIn)",
          );
          continue;
        }

        try {
          // Archive any remaining non-archived reservations before deleting
          // the user document so no reservation ever has a dangling userId.
          const remainingReservations = await Reservation.find({
            userId: mgUser._id,
            isArchived: { $ne: true },
          }).select("_id").lean();

          if (remainingReservations.length > 0) {
            const resIds = remainingReservations.map((r) => r._id);
            await Reservation.updateMany(
              { userId: mgUser._id, isArchived: { $ne: true } },
              { $set: { isArchived: true, status: "archived" } },
            );
            // Release beds held by those reservations
            await releaseOrphanedBeds([], resIds).catch((err) =>
              logger.warn({ err, email: mgUser.email }, "Sync: bed release for reservations failed")
            );
          }

          // Release any beds locked/occupied directly by this user
          await releaseOrphanedBeds([mgUser._id], []).catch((err) =>
            logger.warn({ err, email: mgUser.email }, "Sync: bed release for user failed")
          );

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
    const policy = await getLifecyclePolicySettings();
    let expired = 0;

    // Tiered expiration windows by status
    const tiers = [
      {
        statuses: ["pending"],
        // 30 minutes of inactivity (rolling timer checking updatedAt)
        filter: {
          updatedAt: {
            $lt: now.subtract(policy.stalePendingHours ?? 0.5, "hour").toDate(),
          },
        },
      },
      {
        statuses: ["visit_pending"],
        // 24 hours after creation (they should have scheduled by now)
        filter: {
          createdAt: {
            $lt: now.subtract(policy.staleVisitPendingHours, "hour").toDate(),
          },
        },
      },
      {
        statuses: ["visit_approved"],
        // 48 hours after the visit date passed
        filter: {
          visitDate: {
            $lt: now.subtract(policy.staleVisitApprovedHours, "hour").toDate(),
          },
        },
      },
      {
        statuses: ["payment_pending"],
        // 48 hours after reaching this status (use updatedAt as proxy)
        filter: {
          updatedAt: {
            $lt: now.subtract(policy.stalePaymentPendingHours, "hour").toDate(),
          },
        },
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

        const branch = reservation.roomId?.branch || null;
        const resId = String(reservation._id);

        // Release the bed — retry once, alert admins on persistent failure
        await retryJobOperation(
          () => updateOccupancyOnReservationChange(reservation, { status: oldStatus }),
          { label: `Stale expiry bed-release [${resId}]`, branch },
        );

        // Sync user lifecycle role/status — retry once
        await retryJobOperation(
          () => syncReservationUserLifecycle({
            status: reservation.status,
            previousStatus: oldStatus,
            userId: reservation.userId?._id || reservation.userId,
            roomId: reservation.roomId?._id || reservation.roomId,
            reservationId: reservation._id,
            force: true,
          }),
          { label: `Stale expiry lifecycle-sync [${resId}]`, branch },
        );

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
    const { noShowGraceDays: graceDays } = await getLifecyclePolicySettings();
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

      const nsBranch = reservation.roomId?.branch || null;
      const nsId = String(reservation._id);

      await retryJobOperation(
        () => updateOccupancyOnReservationChange(reservation, { status: "reserved" }),
        { label: `No-show bed-release [${nsId}]`, branch: nsBranch },
      );

      await retryJobOperation(
        () => syncReservationUserLifecycle({
          status: reservation.status,
          previousStatus: "reserved",
          userId: reservation.userId?._id || reservation.userId,
          roomId: reservation.roomId?._id || reservation.roomId,
          reservationId: reservation._id,
          force: true,
        }),
        { label: `No-show lifecycle-sync [${nsId}]`, branch: nsBranch },
      );

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
    const { visitPendingWarnDays: warnDays } = await getLifecyclePolicySettings();
    const cutoff = now.subtract(warnDays, "day").toDate();
    let warned = 0;

    // Find visit_pending reservations older than VISIT_PENDING_WARN_DAYS
    const staleVisits = await Reservation.find({
      status: "visit_pending",
      isArchived: false,
      createdAt: { $lt: cutoff },
    })
      .populate("userId", "firstName lastName")
      .populate("roomId", "name branch")
      .lean();

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
    const {
      archiveCancelledAfterDays,
    } = await getLifecyclePolicySettings();
    const cutoff = now.subtract(archiveCancelledAfterDays, "day").toDate();
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
      reservation.notes = `${reservation.notes ? reservation.notes + " | " : ""}Auto-archived: cancelled ${archiveCancelledAfterDays}+ days ago — ${now.format("MMM D, YYYY")}`;
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

async function dispatchScheduledAnnouncements() {
  try {
    const result = await dispatchDueScheduledAnnouncements();
    if (result.dispatchedCount > 0) {
      logger.info(
        {
          dispatchedCount: result.dispatchedCount,
          dueCount: result.dueCount,
        },
        "Scheduled announcements dispatched",
      );
    }
  } catch (error) {
    logger.error({ err: error }, "Scheduled announcement dispatch job failed");
  }
}

// ─── Job 15: Nightly Occupancy Integrity Reconciliation (daily at 04:00) ────
//
// Safety-net: runs AFTER Job 7 (Firebase sync, 03:00) to catch any rooms whose
// currentOccupancy counter drifted due to a deletion race, a failed bed-release,
// or any other unexpected path. Idempotent — always safe to run multiple times.

async function reconcileOccupancyIntegrity() {
  try {
    // 1. Build the full set of existing User _ids
    const existingUsers = await User.find({}).select("_id").lean();
    const existingUserIdSet = new Set(existingUsers.map((u) => String(u._id)));

    // 2a. Find ACTIVE reservations (reserved/moveIn) for deleted users — archive + release beds
    const orphanedReservations = await Reservation.find({
      isArchived: { $ne: true },
      status: { $in: ACTIVE_OCCUPANCY_STATUS_QUERY },
    }).select("_id reservationCode userId roomId status selectedBed").lean();

    const trueOrphans = orphanedReservations.filter(
      (r) => r.userId && !existingUserIdSet.has(String(r.userId)),
    );

    if (trueOrphans.length > 0) {
      logger.warn(
        { count: trueOrphans.length },
        "reconcileOccupancy: found orphaned active reservations — archiving",
      );

      // Group by room for efficient bed release
      const orphansByRoom = new Map();
      for (const res of trueOrphans) {
        const key = String(res.roomId);
        if (!orphansByRoom.has(key)) orphansByRoom.set(key, []);
        orphansByRoom.get(key).push(res);
      }

      for (const [roomId, resArr] of orphansByRoom) {
        const resIds = resArr.map((r) => r._id);

        // Archive the orphaned reservations
        await Reservation.updateMany(
          { _id: { $in: resIds } },
          { $set: { isArchived: true, status: "archived" } },
        );

        // Release their beds
        await releaseOrphanedBeds([], resIds).catch((err) =>
          logger.warn({ err, roomId }, "reconcileOccupancy: bed release failed (will retry next run)")
        );
      }
    }

    // 2b. Phase 5B: Archive NON-ACTIVE reservations for deleted users.
    // The pass above only catches reserved/moveIn. Cancelled, moveOut,
    // viewing_preference_selected etc. for deleted users accumulate indefinitely.
    const allNonActiveNonArchived = await Reservation.find({
      isArchived: { $ne: true },
      status: { $nin: ACTIVE_OCCUPANCY_STATUS_QUERY },
    }).select("_id userId").lean();

    const nonActiveOrphans = allNonActiveNonArchived.filter(
      (r) => r.userId && !existingUserIdSet.has(String(r.userId)),
    );

    if (nonActiveOrphans.length > 0) {
      await Reservation.updateMany(
        { _id: { $in: nonActiveOrphans.map((r) => r._id) } },
        { $set: { isArchived: true } },
      );
      logger.info(
        { count: nonActiveOrphans.length },
        "reconcileOccupancy: archived non-active orphaned reservations for deleted users",
      );
    }

    // 3. Recompute currentOccupancy for ALL active rooms from live reservations
    const rooms = await Room.find({ isArchived: { $ne: true } });
    let roomsFixed = 0;

    // Scheduled Room Transfer: an OPEN inbound schedule holds a real
    // destination-capacity slot (and, for a shared room, a specific
    // "reserved" bed) BEFORE its effective date. currentOccupancy in this
    // codebase already means "committed capacity slots" (a `reserved`
    // reservation counts), so these holds must be ADDED to the derived live
    // count and their beds must NOT be treated as stale pointers — otherwise
    // this job reconciles the hold away within a day. See
    // scheduledRoomTransferService.js.
    const { countOpenDestinationHolds, openHoldBackedBedKeys } = await import(
      "../services/scheduledRoomTransferService.js"
    );
    const holdBackedBedKeys = await openHoldBackedBedKeys(rooms.map((r) => r._id));

    for (const room of rooms) {
      const liveReservationCount = await Reservation.countDocuments({
        roomId: room._id,
        isArchived: { $ne: true },
        status: { $in: ACTIVE_OCCUPANCY_STATUS_QUERY },
      });
      const openHolds = await countOpenDestinationHolds(room._id);
      const liveCount = liveReservationCount + openHolds;

      // Fetch live reservations with selectedBed for cross-validation (Phase 1)
      const liveReservations = await Reservation.find({
        roomId: room._id,
        isArchived: { $ne: true },
        status: { $in: ACTIVE_OCCUPANCY_STATUS_QUERY },
      }).select("_id selectedBed").lean();

      const liveResIdSet = new Set(liveReservations.map((r) => String(r._id)));

      // Build: reservationId → claimedBedId (from selectedBed)
      const resBedMap = new Map();
      for (const res of liveReservations) {
        if (res.selectedBed?.id) {
          resBedMap.set(String(res._id), res.selectedBed.id);
        }
      }

      let bedChanged = false;

      for (const bed of room.beds) {
        if (bed.status === "maintenance") continue;

        // "locked" beds with an occupiedBy.reservationId are in-progress reservations
        // (post bed-status-mapping fix). Include them in stale-pointer cleanup so that
        // if the underlying reservation is cancelled/deleted without going through the
        // normal lifecycle path, the bed is freed. Pure admin/maintenance locks
        // (no occupiedBy.reservationId) are still skipped.
        const isReservationHeldBed =
          (bed.status === "occupied" || bed.status === "reserved") ||
          (bed.status === "locked" && bed.occupiedBy?.reservationId);

        // A bed held by an OPEN scheduled inbound transfer is a legitimate
        // "reserved" hold whose occupiedBy points at the tenant's SOURCE-room
        // reservation — its selectedBed will (correctly) not match this bed.
        // Skip both stale-pointer passes for it.
        if (holdBackedBedKeys.has(`${String(room._id)}::${String(bed.id)}`)) {
          continue;
        }

        if (isReservationHeldBed && bed.occupiedBy?.reservationId) {
          const resIdStr = String(bed.occupiedBy.reservationId);

          // Pass A: dead reference — reservation no longer active
          if (!liveResIdSet.has(resIdStr)) {
            bed.status = "available";
            bed.lockedBy = null;
            bed.lockExpiresAt = null;
            bed.occupiedBy = { userId: null, reservationId: null, occupiedSince: null };
            bedChanged = true;
            continue;
          }

          // Pass B (Phase 1): cross-validation — reservation IS active but its
          // selectedBed points to a DIFFERENT bed. This bed has a stale pointer.
          const claimedBedId = resBedMap.get(resIdStr);
          if (claimedBedId && claimedBedId !== bed.id) {
            logger.warn(
              { roomId: String(room._id), bedId: bed.id, reservationId: resIdStr, claimedBedId },
              "reconcileOccupancy: stale bed pointer (reservation claims different bed) — clearing",
            );
            bed.status = "available";
            bed.lockedBy = null;
            bed.lockExpiresAt = null;
            bed.occupiedBy = { userId: null, reservationId: null, occupiedSince: null };
            bedChanged = true;
          }
        }
      }

      const storedCount = room.currentOccupancy;
      if (storedCount !== liveCount || bedChanged) {
        room.currentOccupancy = liveCount;
        room.updateAvailability();
        await room.save();
        roomsFixed++;
      }
    }

    if (trueOrphans.length > 0 || nonActiveOrphans.length > 0 || roomsFixed > 0) {
      logger.info(
        {
          orphanedReservationsArchived: trueOrphans.length,
          nonActiveOrphansArchived: nonActiveOrphans.length,
          roomsFixed,
        },
        "reconcileOccupancy: integrity pass complete",
      );
    }
  } catch (error) {
    logger.error({ err: error }, "reconcileOccupancy: job failed");
  }
}

// ─── Job 19: Missing Contract Generation Reconciliation (daily at 04:10) ────
//
// Safety-net for autoGenerateMoveInContract/autoGenerateDepositSettledContract.
// Both are only invoked inline from the one request that flips a reservation
// to moveIn (reservationLifecycleController.js) or settles its initial-payment
// bill to ₱0 remaining (paymentController.js / structuredInitialPaymentService.js).
// Neither has a retry path: if that single request's contract-generation step
// throws, times out, or is skipped entirely (e.g. the reservation/bill state
// was set directly rather than through those code paths), the tenant is left
// with a Contract stuck at draft/incomplete/ready_for_generation — invisible
// on both Web and Mobile — with nothing to ever revisit it.
//
// This scans for exactly that stuck state and retries generation the same
// way the original trigger would have. Idempotent — autoGenerateMoveInContract
// and autoGenerateDepositSettledContract only act on a Contract still at
// draft/incomplete/ready_for_generation and are themselves safe to call
// repeatedly (assertPreparedGenerationAllowed guards a Contract that already
// has a prepared/final document), so a contract already resolved by a prior
// run or a concurrent request is never double-generated.
//
// Eligibility is gated through resolveReservationContractEligibility — the
// exact same reservation-approval check contractGenerationDataService.js
// runs before every real generation attempt — instead of a cheaper
// movedIn/depositSettled heuristic. That heuristic used to accept a
// reservation as "should be generatable" purely from status/payment flags,
// which can be true well before the reservation's application approval is
// actually on record (e.g. paid but never formally reviewed): Job 19 would
// then attempt generation, get rejected by the real validator every night,
// and never distinguish that from a transient failure worth retrying. The
// real eligibility check is cheap (reservation-only, no extra queries) and
// gives Job 19 the same pass/fail the generator itself will apply, so a
// not-yet-approved reservation is skipped with its reason logged instead of
// retried forever.
async function reconcileMissingContractGeneration() {
  try {
    const stuckContracts = await Contract.find({
      isCurrent: true,
      status: { $in: ["draft", "incomplete", "ready_for_generation"] },
    }).select("_id reservationId status createdBy updatedBy bedId bedLabel roomType").lean();

    let scanned = stuckContracts.length;
    let attempted = 0;
    let recovered = 0;
    let notYetGeneratable = 0;

    for (const contract of stuckContracts) {
      if (!contract.reservationId) continue;
      const reservation = await Reservation.findById(contract.reservationId).lean();
      if (!reservation) continue;

      // Same bedExists source contractGenerationDataService.js's real check
      // uses (the Contract's own bedId/bedLabel) — not the reservation's
      // selectedBed snapshot, which can diverge from what was actually
      // copied onto the Contract at draft-creation time.
      const eligibility = resolveReservationContractEligibility(reservation, {
        bedExists: Boolean(contract.bedId || contract.bedLabel),
        roomType: contract.roomType,
      });
      if (!eligibility.eligible) {
        notYetGeneratable++;
        logger.info(
          {
            contractId: contract._id,
            reservationId: contract.reservationId,
            approvalState: eligibility.approvalState,
            blocker: eligibility.blockers[0]?.code,
            blockerCategory: eligibility.blockers[0]?.category,
            humanActionRequired: eligibility.blockers[0]?.humanActionRequired,
          },
          "reconcileMissingContractGeneration: not yet generatable — skipping (reservation approval incomplete)",
        );
        continue;
      }

      attempted++;
      const movedIn = reservation.status === "moveIn";
      const actorId = contract.updatedBy || contract.createdBy;
      try {
        const { autoGenerateMoveInContract, autoGenerateDepositSettledContract } = await import(
          "../services/autoContractOrchestratorService.js"
        );
        const result = movedIn
          ? await autoGenerateMoveInContract({
              reservationId: contract.reservationId,
              actualMoveInDate: reservation.confirmedMoveInDate || reservation.moveInDate || new Date(),
              actorId,
            })
          : await autoGenerateDepositSettledContract({
              reservationId: contract.reservationId,
              actorId,
            });

        if (result?.success && !result?.incomplete) recovered++;
      } catch (genErr) {
        logger.warn(
          { err: genErr, contractId: contract._id, reservationId: contract.reservationId },
          "reconcileMissingContractGeneration: retry failed for one Contract (will retry next run)",
        );
      }
    }

    if (attempted > 0 || notYetGeneratable > 0) {
      logger.info(
        { scanned, attempted, recovered, notYetGeneratable },
        "reconcileMissingContractGeneration: pass complete",
      );
    }
  } catch (error) {
    logger.error({ err: error }, "reconcileMissingContractGeneration: job failed");
  }
}

// ─── Scheduler Startup ──────────────────────────────────────────────────

const scheduledJobs = [];

const shouldRunWarmupJobs = (override) => {
  if (typeof override === "boolean") {
    return override;
  }

  const configured = String(process.env.RUN_SCHEDULER_WARMUP || "").trim().toLowerCase();
  if (!configured) {
    return false;
  }

  return !["0", "false", "no", "off"].includes(configured);
};

// ─── Job 14: Consecutive Overdue Detection (daily at 01:20) ─────────────

async function detectConsecutiveOverdueMonths() {
  try {
    const activeReservations = await Reservation.find({
      status: "moveIn",
      isArchived: { $ne: true },
    }).populate("roomId", "branch name roomNumber");

    let totalFlagged = 0;
    const now = new Date();

    for (const reservation of activeReservations) {
      if (!reservation.userId) continue;

      const bills = await Bill.find({
        $or: [
          { reservationId: reservation._id },
          { userId: reservation.userId },
        ],
        isArchived: false,
      })
        .sort({ billingMonth: -1, createdAt: -1 })
        .lean();

      if (bills.length === 0) continue;

      const monthlyStatusMap = new Map();
      for (const bill of bills) {
        if (!bill.billingMonth) continue;
        const monthKey = dayjs(bill.billingMonth).format("YYYY-MM");
        if (!monthlyStatusMap.has(monthKey)) {
          monthlyStatusMap.set(monthKey, []);
        }
        monthlyStatusMap.get(monthKey).push(bill);
      }

      const sortedMonths = Array.from(monthlyStatusMap.keys()).sort((a, b) => (a < b ? 1 : -1));
      let consecutiveCount = 0;

      for (const monthKey of sortedMonths) {
        const monthBills = monthlyStatusMap.get(monthKey);
        const hasOverdueInMonth = monthBills.some((b) => {
          const isOverdueStatus = b.status === "overdue";
          const isPastDueWithBalance =
            b.status !== "paid" &&
            b.dueDate &&
            new Date(b.dueDate) < now &&
            (b.totalAmount || 0) - (b.amountPaid || 0) > 0;
          return isOverdueStatus || isPastDueWithBalance;
        });

        if (hasOverdueInMonth) {
          consecutiveCount++;
        } else {
          break;
        }
      }

      const isEligible = consecutiveCount >= 3;
      const wasEligible = Boolean(reservation.eligibleForTermination);

      if (isEligible && !wasEligible) {
        reservation.consecutiveOverdueMonths = consecutiveCount;
        reservation.eligibleForTermination = true;
        reservation.terminationEligibilityDetectedAt = new Date();
        reservation.terminationEligibilityAlertSentAt = new Date();
        await reservation.save();

        totalFlagged++;

        const branch = reservation.roomId?.branch;
        const tenantName = reservation.userId
          ? `${reservation.userId.firstName || ""} ${reservation.userId.lastName || ""}`.trim()
          : "Tenant";
        const roomLabel = reservation.roomId?.name || reservation.roomId?.roomNumber || "room";

        try {
          const adminQuery = {
            role: { $in: ["branch_admin", "owner"] },
            isArchived: false,
            accountStatus: "active",
          };
          if (branch) adminQuery.branch = branch;
          const admins = await User.find(adminQuery).select("_id").lean();

          for (const admin of admins) {
            notify.general(
              admin._id,
              "Termination Eligibility Alert",
              `Tenant ${tenantName} (${roomLabel}) has ${consecutiveCount} consecutive months of overdue bills. Contract termination is eligible for administrative review.`,
              { entityType: "reservation", entityId: reservation._id },
            );
          }
        } catch (adminNotifyErr) {
          logger.warn({ err: adminNotifyErr }, "Failed to alert admins on termination eligibility");
        }
      } else if (!isEligible && wasEligible) {
        reservation.eligibleForTermination = false;
        reservation.consecutiveOverdueMonths = consecutiveCount;
        await reservation.save();
      } else if (reservation.consecutiveOverdueMonths !== consecutiveCount) {
        reservation.consecutiveOverdueMonths = consecutiveCount;
        await reservation.save();
      }
    }

    if (totalFlagged > 0) {
      logger.info({ count: totalFlagged }, "Consecutive overdue termination eligibility flags updated");
    }
  } catch (error) {
    logger.error({ err: error }, "Consecutive overdue detection failed");
  }
}

// ─── Job 16: Maintenance 7-Day Auto-Completion (daily at 02:30) ────────
// Auto-completes tickets in "resolved" status after 7 days (168 hours) of no movement.

async function autoCompleteResolvedTickets() {
  try {
    const now = dayjs();
    const cutoffDate = now.subtract(7, "day").toDate();

    const resolvedTickets = await MaintenanceRequest.find({
      status: "resolved",
      isArchived: false,
      $or: [
        { resolved_at: { $lte: cutoffDate } },
        { resolvedAt: { $lte: cutoffDate } },
        {
          resolved_at: null,
          resolvedAt: null,
          updated_at: { $lte: cutoffDate },
        },
      ],
    });

    let completedCount = 0;

    for (const ticket of resolvedTickets) {
      const completionDate = now.toDate();
      ticket.status = "completed";
      ticket.closed_at = ticket.closed_at || completionDate;
      ticket.completedAt = ticket.completedAt || completionDate;

      const history = Array.isArray(ticket.statusHistory) ? ticket.statusHistory : [];
      history.push({
        event: "auto_completed_after_7_days",
        status: "completed",
        actor_id: "system_cron",
        actor_name: "LilyCrest Automated Scheduler",
        actor_role: "system",
        note: "Maintenance ticket automatically marked completed after 7 days of inactivity in resolved status.",
        timestamp: completionDate,
      });
      ticket.statusHistory = history;

      await ticket.save();
      completedCount++;

      try {
        const { emitToAdmins } = await import("./socket.js");
        emitToAdmins("ticket:updated", {
          requestId: String(ticket._id),
          status: "completed",
          autoCompleted: true,
        });
      } catch {
        // non-fatal
      }

      if (ticket.userId || ticket.user_id) {
        try {
          notify.general(
            ticket.userId || ticket.user_id,
            "Maintenance Request Completed",
            `Your maintenance request (${ticket.ticketNumber || ticket.request_id}) has been automatically finalized as Completed after the 7-day observation period.`,
            { entityType: "maintenance", entityId: ticket._id }
          );
        } catch {
          // notification error non-fatal
        }
      }
    }

    if (completedCount > 0) {
      logger.info({ count: completedCount }, "Resolved maintenance tickets auto-completed after 7 days");
    }
  } catch (error) {
    logger.error({ err: error }, "Maintenance 7-day auto-completion job failed");
  }
}

// ─── Job 17: Support Chat Inactivity Auto-Close (every 5 min) ───────────────

async function runAutoCloseInactiveChats() {
  try {
    const closedCount = await autoCloseInactiveChatConversations({ inactivityMinutes: 15 });
    if (closedCount > 0) {
      logger.info({ count: closedCount }, "Inactive support chat conversations auto-closed");
    }
  } catch (error) {
    logger.error({ err: error }, "Inactive chat auto-close job failed");
  }
}

export function startScheduler(options = {}) {
  if (scheduledJobs.length > 0) {
    logger.warn(
      { count: scheduledJobs.length },
      "Scheduler already started; skipping duplicate startup",
    );
    return scheduledJobs.length;
  }

  if (shouldRunWarmupJobs(options.runWarmup)) {
    setImmediate(() => {
      void cleanupExpiredBedLocks();
      void markOverdueBills();
      void detectConsecutiveOverdueMonths();
      void runAutoCloseInactiveChats();
    });
  }

  // Job 0: Automated Rent Bills — daily at midnight (Asia/Manila)
  scheduledJobs.push(
    cron.schedule('0 0 * * *', generateAutomatedRentBills, {
      scheduled: true,
      timezone: process.env.APP_TIMEZONE || "Asia/Manila",
      name: 'automated-rent-generation',
    }),
  );

  // Job 1: Overdue move-in detection — daily at 08:30
  scheduledJobs.push(
    cron.schedule("30 8 * * *", detectOverdueMoveIns, {
      scheduled: true,
      timezone: process.env.APP_TIMEZONE || "Asia/Manila",
      name: "overdue-movein-detection",
    }),
  );

  // Job 2: Bed lock cleanup — every 2 minutes
  scheduledJobs.push(
    cron.schedule("*/2 * * * *", cleanupExpiredBedLocks, {
      scheduled: true,
      timezone: process.env.APP_TIMEZONE || "Asia/Manila",
      name: "bed-lock-cleanup",
    }),
  );

  // Job 3: Overdue bill marking — daily at 01:00 (1 hour after midnight rent generation, Asia/Manila)
  scheduledJobs.push(
    cron.schedule("0 1 * * *", markOverdueBills, {
      scheduled: true,
      timezone: process.env.APP_TIMEZONE || "Asia/Manila",
      name: "overdue-bill-marking",
    }),
  );

  // Job 4: Auto-compute penalties — daily at 01:10 (after overdue marking, Asia/Manila)
  scheduledJobs.push(
    cron.schedule("10 1 * * *", computeOverduePenalties, {
      scheduled: true,
      timezone: process.env.APP_TIMEZONE || "Asia/Manila",
      name: "overdue-penalty-computation",
    }),
  );

  // Job 4b: Consecutive overdue detection — daily at 01:20 (after penalties, Asia/Manila)
  scheduledJobs.push(
    cron.schedule("20 1 * * *", detectConsecutiveOverdueMonths, {
      scheduled: true,
      timezone: process.env.APP_TIMEZONE || "Asia/Manila",
      name: "consecutive-overdue-detection",
    }),
  );

  // Job 5: Payment due reminders — daily at 08:00
  scheduledJobs.push(
    cron.schedule("0 8 * * *", sendPaymentReminders, {
      scheduled: true,
      timezone: process.env.APP_TIMEZONE || "Asia/Manila",
      name: "payment-due-reminders",
    }),
  );

  // Job 6: Contract expiration alerts — daily at 09:00
  scheduledJobs.push(
    cron.schedule("0 9 * * *", checkContractExpirations, {
      scheduled: true,
      timezone: process.env.APP_TIMEZONE || "Asia/Manila",
      name: "contract-expiration-alerts",
    }),
  );

  // Job 7: Firebase ↔ MongoDB sync cleanup — daily at 03:00
  scheduledJobs.push(
    cron.schedule("0 3 * * *", cleanupOrphanedAccounts, {
      scheduled: true,
      timezone: process.env.APP_TIMEZONE || "Asia/Manila",
      name: "firebase-mongodb-sync",
    }),
  );

  // Job 8: Auto-expire stale reservations — every 5 minutes
  scheduledJobs.push(
    cron.schedule("*/5 * * * *", expireStaleReservations, {
      scheduled: true,
      timezone: process.env.APP_TIMEZONE || "Asia/Manila",
      name: "stale-reservation-expiry",
    }),
  );

  // Job 9: Auto-cancel no-show reservations — daily at 10:00
  scheduledJobs.push(
    cron.schedule("0 10 * * *", cancelNoShowReservations, {
      scheduled: true,
      timezone: process.env.APP_TIMEZONE || "Asia/Manila",
      name: "noshow-reservation-cancel",
    }),
  );

  // Job 10: Warn admins about stale visit_pending reservations — daily at 08:00
  scheduledJobs.push(
    cron.schedule("0 8 * * *", warnStaleVisitPending, {
      scheduled: true,
      timezone: process.env.APP_TIMEZONE || "Asia/Manila",
      name: "stale-visit-pending-warning",
    }),
  );

  // Job 11: Auto-archive old cancelled reservations — daily at 02:00
  scheduledJobs.push(
    cron.schedule("0 2 * * *", archiveStaleCancelled, {
      scheduled: true,
      timezone: process.env.APP_TIMEZONE || "Asia/Manila",
      name: "archive-stale-cancelled",
    }),
  );

  // Job 12: Dispatch due scheduled announcements — every minute
  scheduledJobs.push(
    cron.schedule("* * * * *", dispatchScheduledAnnouncements, {
      scheduled: true,
      timezone: process.env.APP_TIMEZONE || "Asia/Manila",
      name: "scheduled-announcement-dispatch",
    }),
  );

  // Job 13: SLA breach detection — daily at 06:00
  // Groups alerts per branch (not per request) to minimise admin notification noise.
  scheduledJobs.push(
    cron.schedule("0 6 * * *", detectSlaBreaches, {
      scheduled: true,
      timezone: process.env.APP_TIMEZONE || "Asia/Manila",
      name: "sla-breach-detection",
    }),
  );

  // Job 15: Nightly occupancy integrity reconciliation — daily at 04:00
  // Safety-net that runs AFTER the Firebase sync job (03:00) to catch any
  // drift caused by deletion races, failed bed releases, or scheduler bugs.
  scheduledJobs.push(
    cron.schedule("0 4 * * *", () =>
      retryJobOperation(reconcileOccupancyIntegrity, { label: "Job 15: Occupancy reconciliation" }),
    {
      scheduled: true,
      timezone: process.env.APP_TIMEZONE || "Asia/Manila",
      name: "occupancy-integrity-reconciliation",
    }),
  );

  // Job 16: Maintenance 7-Day Auto-Completion — daily at 02:30
  // Automatically completes resolved tickets after 7 days of inactivity.
  scheduledJobs.push(
    cron.schedule("30 2 * * *", autoCompleteResolvedTickets, {
      scheduled: true,
      timezone: process.env.APP_TIMEZONE || "Asia/Manila",
      name: "maintenance-7day-auto-completion",
    }),
  );

  // Job 17: Support Chat Inactivity Auto-Close — every 5 minutes
  // Automatically closes conversations in waiting_tenant / resolved after 15m of inactivity
  scheduledJobs.push(
    cron.schedule("*/5 * * * *", runAutoCloseInactiveChats, {
      scheduled: true,
      timezone: process.env.APP_TIMEZONE || "Asia/Manila",
      name: "support-chat-inactivity-autoclose",
    }),
  );

  // Job 18: Renewal successor Contract activation — daily at 09:05
  // Flips a renewal successor Contract from FINAL+SCHEDULED (published,
  // leaseStartDate in the future) to ACTIVE once its effective date
  // arrives, and its predecessor from active to replaced in the same
  // transaction. See contractRenewalActivationService.js for the full
  // finality-vs-effectivity rationale. Idempotent — safe to retry.
  scheduledJobs.push(
    cron.schedule("5 9 * * *", () =>
      retryJobOperation(activateDueRenewalContracts, { label: "Job 18: Renewal Contract activation" }),
    {
      scheduled: true,
      timezone: process.env.APP_TIMEZONE || "Asia/Manila",
      name: "renewal-contract-activation",
    }),
  );

  // Job 19: Missing contract generation reconciliation — daily at 04:10
  // Runs after the occupancy reconciliation (04:00) — retries
  // autoGenerateMoveInContract/autoGenerateDepositSettledContract for any
  // moved-in or deposit-settled reservation whose Contract never got a
  // prepared PDF, so a one-off failure in the inline trigger doesn't leave a
  // tenant permanently stuck on "Preparing Contract".
  scheduledJobs.push(
    cron.schedule("10 4 * * *", () =>
      retryJobOperation(reconcileMissingContractGeneration, { label: "Job 19: Missing contract generation reconciliation" }),
    {
      scheduled: true,
      timezone: process.env.APP_TIMEZONE || "Asia/Manila",
      name: "missing-contract-generation-reconciliation",
    }),
  );

  // Job 20: Scheduled Room Transfer — due-date REMINDER, daily at 00:10
  // (Asia/Manila). This job NO LONGER performs the physical cutover. The
  // cutover is admin-driven (`completeRoomTransfer`: meter reading →
  // settlement → settle → transferStayWorkflow). All this job does is send a
  // one-time "ready to complete" reminder to branch admins for each OPEN
  // scheduled transfer whose Manila effective date/time has been reached; the
  // "Complete transfer →" Action Needed CTA is derived from the date/time, not
  // from a status flip. retryJobOperation handles a transient PROCESS failure
  // (whole-scan re-run) — the notification is deduped so a re-run is safe.
  scheduledJobs.push(
    cron.schedule("10 0 * * *", () =>
      retryJobOperation(
        async () => {
          const { nudgeDueScheduledRoomTransfers } = await import(
            "../services/scheduledRoomTransferExecutor.js"
          );
          return nudgeDueScheduledRoomTransfers();
        },
        { label: "Job 20: Scheduled room transfer due-date reminder" },
      ),
    {
      scheduled: true,
      timezone: process.env.APP_TIMEZONE || "Asia/Manila",
      name: "scheduled-room-transfer-due-reminder",
    }),
  );

  return scheduledJobs.length;
}

/** Stop all cron jobs (for graceful shutdown) */
export function stopScheduler() {
  for (const job of scheduledJobs) {
    job.stop();
  }
  scheduledJobs.length = 0;
}

export {
  detectOverdueMoveIns,
  cleanupExpiredBedLocks,
  markOverdueBills,
  computeOverduePenalties,
  sendPaymentReminders,
  checkContractExpirations,
  cleanupOrphanedAccounts,
  expireStaleReservations,
  cancelNoShowReservations,
  warnStaleVisitPending,
  archiveStaleCancelled,
  dispatchScheduledAnnouncements,
  detectSlaBreaches,
  detectConsecutiveOverdueMonths,
  reconcileOccupancyIntegrity,
  autoCompleteResolvedTickets,
  runAutoCloseInactiveChats,
  reconcileMissingContractGeneration,
};

export default { startScheduler, stopScheduler };
