/**
 * ============================================================================
 * NOTIFICATION SERVICE
 * ============================================================================
 *
 * Centralized helper for creating notifications.
 * Import this in any controller that needs to notify users.
 *
 * Usage:
 *   import { notify } from "../utils/notificationService.js";
 *   await notify.reservationConfirmed(userId, reservationCode, roomName);
 *
 * ============================================================================
 */

import Notification from "../models/Notification.js";
import {
  buildMaintenanceNotificationBody,
  buildMaintenanceNotificationTitle,
} from "../config/maintenance.js";
import logger from "../middleware/logger.js";
import { sendMobilePushBill } from "./mobilePushService.js";

/**
 * Create a notification (generic)
 * @param {ObjectId} userId - Target user
 * @param {string} type - Notification type enum value
 * @param {string} title - Short title
 * @param {string} message - Full message body
 * @param {Object} options - Optional { actionUrl, entityType, entityId }
 */
async function createNotification(userId, type, title, message, options = {}) {
  try {
    const notification = new Notification({
      userId,
      type,
      title,
      message,
      actionUrl: options.actionUrl || null,
      entityType: options.entityType || "",
      entityId: options.entityId || null,
    });
    await notification.save();
    return notification;
  } catch (error) {
    // Non-fatal — don't break the calling flow
    console.error("⚠️ Failed to create notification:", error.message);
    return null;
  }
}

async function createNotificationWithPush(
  userId,
  type,
  title,
  message,
  options = {},
  pushSender = null,
) {
  const notification = await createNotification(userId, type, title, message, options);

  if (typeof pushSender !== "function") {
    return notification;
  }

  try {
    const delivered = await pushSender();
    logger.info(
      {
        userId: String(userId || ""),
        type,
        delivered,
      },
      "[Notification] Mobile push delivery completed",
    );
  } catch (error) {
    logger.warn(
      {
        err: error,
        userId: String(userId || ""),
        type,
      },
      "[Notification] Mobile push delivery failed",
    );
  }

  return notification;
}

// ============================================================================
// PRE-BUILT NOTIFICATION HELPERS
// ============================================================================

const notify = {
  /**
   * Reservation confirmed
   */
  reservationConfirmed: (userId, reservationCode, roomName) =>
    createNotification(userId, "reservation_confirmed", "Reservation Confirmed",
      `Your reservation ${reservationCode} for ${roomName} has been confirmed.`,
      { entityType: "reservation" }),

  /**
   * Reservation cancelled
   */
  reservationCancelled: (userId, reservationCode, reason) =>
    createNotification(userId, "reservation_cancelled", "Reservation Cancelled",
      `Your reservation ${reservationCode} has been cancelled. ${reason ? `Reason: ${reason}` : ""}`,
      { entityType: "reservation" }),

  /**
   * Visit approved
   */
  visitApproved: (userId, branchName) =>
    createNotification(userId, "visit_approved", "Visit Approved",
      `Your visit to ${branchName} has been approved. Please proceed to the dormitory.`,
      { entityType: "reservation" }),

  /**
   * Visit rejected
   */
  visitRejected: (userId, reason) =>
    createNotification(userId, "visit_rejected", "Visit Schedule Rejected",
      `Your visit schedule has been rejected. ${reason || "Please reschedule."}`,
      { entityType: "reservation" }),

  /**
   * Payment approved
   */
  paymentApproved: (userId, billingMonth, amount) =>
    createNotification(userId, "payment_approved", "Payment Approved",
      `Your payment of ₱${amount} for ${billingMonth} has been approved.`,
      { entityType: "bill" }),

  /**
   * Payment rejected
   */
  paymentRejected: (userId, billingMonth, reason) =>
    createNotification(userId, "payment_rejected", "Payment Rejected",
      `Your payment for ${billingMonth} was rejected. ${reason || "Please resubmit."} `,
      { entityType: "bill" }),

  /**
   * Bill generated
   */
  billGenerated: async (userId, billingMonth, totalAmount, dueDate, options = {}) =>
    createNotificationWithPush(
      userId,
      "bill_generated",
      "New Bill Available",
      options.billType === "rent"
        ? "Your rent bill is now available"
        : `Your bill for ${billingMonth} is ₱${totalAmount}. Due by ${dueDate}.`,
      {
        entityType: "bill",
        entityId: options.billId || null,
        actionUrl: options.actionUrl || null,
      },
      () => sendMobilePushBill(userId, null, {
        billingMonth,
        totalAmount,
        dueDate,
        billId: options.billId || null,
        billType: options.billType || "bill",
      }),
    ),

  utilityChargeAvailable: (
    userId,
    utilityType,
    billingMonth,
    utilityAmount,
    totalAmount,
    dueDate,
  ) =>
    createNotification(
      userId,
      "bill_generated",
      `${utilityType === "water" ? "Water" : "Electricity"} Charge Available`,
      `Your ${utilityType} charge for ${billingMonth} is â‚±${utilityAmount}. Current bill total: â‚±${totalAmount}. Due by ${dueDate}.`,
      { entityType: "bill" },
    ),

  /**
   * Overdue move-in alert (admin + tenant notification)
   */
  overdueMoveIn: (userId, reservationCode, roomName, tenantName, daysOverdue) =>
    createNotification(userId, "grace_period_warning", "Overdue Move-In",
      `${tenantName} (${reservationCode}) is ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue for move-in to ${roomName}. Please extend or cancel.`,
      { entityType: "reservation" }),

  /**
   * Account suspended
   */
  accountSuspended: (userId, reason) =>
    createNotification(userId, "account_suspended", "Account Suspended",
      `Your account has been suspended. ${reason || "Contact support for details."}`,
      { entityType: "user" }),

  /**
   * Account reactivated
   */
  accountReactivated: (userId) =>
    createNotification(userId, "account_reactivated", "Account Reactivated",
      "Your account has been reactivated. You can now log in and use the system.",
      { entityType: "user" }),

  /**
   * Bill due reminder
   */
  billDueReminder: (userId, billingMonth, totalAmount, daysUntilDue) =>
    createNotification(userId, "bill_due_reminder", "Payment Reminder",
      `Your bill of ₱${totalAmount.toLocaleString()} for ${billingMonth} is due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}.`,
      { entityType: "bill" }),

  /**
   * Penalty applied to overdue bill
   */
  penaltyApplied: (userId, billingMonth, penaltyAmount, daysLate) =>
    createNotification(userId, "penalty_applied", "Late Payment Penalty",
      `A penalty of ₱${penaltyAmount.toLocaleString()} (${daysLate} day${daysLate === 1 ? "" : "s"} late) has been applied to your ${billingMonth} bill.`,
      { entityType: "bill" }),

  /**
   * Contract expiring soon
   */
  contractExpiring: (userId, roomName, daysRemaining) =>
    createNotification(userId, "contract_expiring", "Lease Expiring Soon",
      `Your lease for ${roomName} expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}. Please contact the admin to renew or arrange move-out.`,
      { entityType: "reservation" }),

  /**
   * Reservation auto-expired (unpaid / stale)
   */
  reservationExpired: (userId, reservationCode, roomName) =>
    createNotification(userId, "reservation_expired", "Reservation Expired",
      `Your reservation ${reservationCode} for ${roomName} has expired due to inactivity. The bed has been released.`,
      { entityType: "reservation" }),

  /**
   * Reservation auto-cancelled (no-show after move-in deadline)
   */
  reservationNoShow: (userId, reservationCode, roomName, daysOverdue) =>
    createNotification(userId, "reservation_noshow", "Reservation Cancelled — No Show",
      `Your reservation ${reservationCode} for ${roomName} has been cancelled. You did not move in within ${daysOverdue} days of your deadline.`,
      { entityType: "reservation" }),

  /**
   * Admin warning: unactioned visit_pending reservation approaching auto-expiry
   */
  stalePendingVisitWarning: (adminUserId, tenantName, roomName, daysPending) =>
    createNotification(adminUserId, "general", "Unactioned Visit Request",
      `${tenantName} has a visit request for ${roomName} pending for ${daysPending} days. It will auto-expire in ${14 - daysPending} day${(14 - daysPending) === 1 ? "" : "s"} if not acted on.`,
      { entityType: "reservation" }),

  /**
   * SLA breach alert — sent to branch admins when requests exceed their SLA window.
   * One notification per admin per branch batch (not per request) to reduce noise.
   */
  slaBreachAlert: (adminUserId, branch, delayedCount, urgencyBreakdown) =>
    createNotification(
      adminUserId,
      "sla_breach",
      `SLA Breach — ${delayedCount} Request${delayedCount > 1 ? "s" : ""} Overdue`,
      `${delayedCount} maintenance request${delayedCount > 1 ? "s" : ""} in ${branch} ${delayedCount > 1 ? "have" : "has"} breached SLA. (${urgencyBreakdown}). Immediate attention required.`,
      { actionUrl: "/admin/maintenance?quickFilter=delayed", entityType: "maintenance" },
    ),

  /**
   * Chat SLA alert — sent to branch admins when a conversation goes unresponded past threshold.
   */
  chatUnresponded: (adminUserId, branch, conversationCount) =>
    createNotification(
      adminUserId,
      "chat_unresponded",
      `${conversationCount} Chat${conversationCount > 1 ? "s" : ""} Awaiting Response`,
      `${conversationCount} open conversation${conversationCount > 1 ? "s" : ""} in ${branch} ${conversationCount > 1 ? "have" : "has"} not received an admin reply in over 4 hours.`,
      { actionUrl: "/admin/chat", entityType: "chat" },
    ),

  /**
   * General notification
   */
  general: (userId, title, message, options = {}) =>
    createNotification(userId, "general", title, message, options),

  /**
   * Maintenance request status update
   */
  maintenanceUpdated: (userId, requestType, status, requestId) =>
    createNotification(
      userId,
      "maintenance_update",
      buildMaintenanceNotificationTitle(requestType),
      buildMaintenanceNotificationBody(requestType, status),
      {
        entityType: "maintenance",
        entityId: requestId || null,
      },
    ),
};

export { createNotification, notify };
export default notify;
