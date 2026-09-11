/**
 * ============================================================================
 * NOTIFICATION SERVICE
 * ============================================================================
 *
 * Centralized service for creating and dispatching notifications.
 */

import Notification from "../../models/Notification.js";
import User from "../../models/User.js";
import {
  buildMaintenanceNotificationBody,
  buildMaintenanceNotificationTitle,
} from "../../config/maintenance.js";
import logger from "../../middleware/logger.js";
import { sendMobilePushBill, sendMobilePushToRecipients } from "./mobilePushService.js";
import { emitToUser } from "../../utils/socket.js";

async function resolveRoleAtCreation(userId, options = {}) {
  const explicit = String(options.roleAtCreation || options.role_at_creation || "").trim();
  if (explicit) return explicit;
  try {
    const user = await User.findById(userId).select("role").lean();
    return String(user?.role || "").trim();
  } catch {
    // Notification delivery remains available if the denormalized role
    // snapshot cannot be resolved. The mobile bridge has safe legacy inference.
    return "";
  }
}

async function createNotification(userId, type, title, message, options = {}) {
  try {
    const roleAtCreation = await resolveRoleAtCreation(userId, options);
    const notification = new Notification({
      userId,
      type,
      title,
      message,
      actionUrl: options.actionUrl || null,
      data: options.data || undefined,
      entityType: options.entityType || "",
      entityId: options.entityId || null,
      roleAtCreation,
    });
    await notification.save();
    if (options.emitRealtime !== false) {
      try {
        emitToUser(userId, "notification:new", buildRealtimeNotificationPayload(notification));
      } catch (emitError) {
        logger.warn(
          {
            err: emitError,
            userId: String(userId || ""),
            type,
          },
          "[Notification] Realtime delivery failed",
        );
      }
    }
    return notification;
  } catch (error) {
    console.error("⚠️ Failed to create notification:", error.message);
    return null;
  }
}

// Same as createNotification, but the row is only ever written once per
// dedupeKey — a second call with the same key is a no-op (not an error),
// covering retries, redeploy-triggered re-runs, and duplicate admin
// submissions. Concurrency safety comes from the DB-level unique sparse
// index on dedupeKey (see Notification.js), not an in-memory check: two
// concurrent inserts with the same key race at the database, and exactly
// one wins — an app-level "find then insert" check would have a race
// window here that this doesn't.
async function createNotificationOnce(userId, type, title, message, dedupeKey, options = {}) {
  try {
    const roleAtCreation = await resolveRoleAtCreation(userId, options);
    const notification = new Notification({
      userId,
      type,
      title,
      message,
      actionUrl: options.actionUrl || null,
      data: options.data || undefined,
      entityType: options.entityType || "",
      entityId: options.entityId || null,
      roleAtCreation,
      dedupeKey,
    });
    await notification.save();
    if (options.emitRealtime !== false) {
      try {
        emitToUser(userId, "notification:new", buildRealtimeNotificationPayload(notification));
      } catch (emitError) {
        logger.warn(
          { err: emitError, userId: String(userId || ""), type },
          "[Notification] Realtime delivery failed",
        );
      }
    }
    return { notification, created: true };
  } catch (error) {
    if (error?.code === 11000) {
      logger.info(
        { userId: String(userId || ""), type, dedupeKey },
        "[Notification] Duplicate event suppressed (dedupeKey already delivered)",
      );
      return { notification: null, created: false };
    }
    console.error("⚠️ Failed to create notification:", error.message);
    return { notification: null, created: false };
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
  let notification;
  let created = true;
  if (options.dedupeKey) {
    ({ notification, created } = await createNotificationOnce(userId, type, title, message, options.dedupeKey, options));
  } else {
    notification = await createNotification(userId, type, title, message, options);
  }

  // The database row is the canonical event. Never deliver an orphan push
  // if persistence failed, because the Notification Center could not later
  // reconcile that device alert to authoritative state.
  if (!notification) {
    return null;
  }

  // A duplicate event (same dedupeKey already delivered) must not also
  // re-send the OS push — the tenant already saw this in-app and/or on
  // their device the first time.
  if (!created) {
    return notification;
  }

  if (typeof pushSender !== "function") {
    return notification;
  }

  try {
    const pushIdentity = {
      notification_id: notification?._id ? String(notification._id) : "",
      event_key: String(options.dedupeKey || notification?._id || ""),
    };
    const delivered = await pushSender(notification, pushIdentity);
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

const buildRealtimeNotificationPayload = (notification) => {
  if (!notification) return null;

  const payload = notification?.toObject ? notification.toObject() : notification;
  return {
    ...payload,
    _id: payload?._id ? String(payload._id) : payload?._id,
    userId: payload?.userId ? String(payload.userId) : payload?.userId,
    isRead: Boolean(payload?.isRead),
  };
};

const buildMaintenanceUpdateMessage = (
  requestType,
  status,
  {
    statusChanged = true,
    hasAdminNote = false,
    hasProgressEntry = false,
    hasProgressAttachments = false,
  } = {},
) => {
  if (statusChanged) {
    return buildMaintenanceNotificationBody(requestType, status);
  }

  if (hasProgressEntry && hasProgressAttachments) {
    return "Admin replied with a progress update and attachment(s) for your maintenance request.";
  }

  if (hasProgressAttachments) {
    return "Admin added new attachment(s) to your maintenance request.";
  }

  if (hasAdminNote || hasProgressEntry) {
    return "Admin replied to your maintenance request.";
  }

  return "Your maintenance request has been updated.";
};

const formatCode = (code) => {
  if (!code || code === "N/A" || code === "—" || code === "-") return "";
  return String(code).trim();
};

const buildEventDedupeKey = (eventType, sourceId, eventId) => {
  const normalizedSourceId = String(sourceId || "").trim();
  const normalizedEventId = eventId instanceof Date
    ? eventId.toISOString()
    : String(eventId || "").trim();
  if (!normalizedSourceId || !normalizedEventId) return null;
  return `${eventType}:${normalizedSourceId}:${normalizedEventId}`;
};

const notify = {
  reservationConfirmed: (userId, reservationCode, roomName) => {
    const code = formatCode(reservationCode);
    const codeStr = code ? ` ${code}` : "";
    const roomStr = roomName ? ` for ${roomName}` : "";
    return createNotification(userId, "reservation_confirmed", "Reservation Confirmed",
      `Your reservation${codeStr}${roomStr} has been confirmed.`,
      { entityType: "reservation" });
  },

  reservationCancelled: (userId, reservationCode, reason) => {
    const code = formatCode(reservationCode);
    const codeStr = code ? ` ${code}` : "";
    const reasonStr = reason ? `. Reason: ${reason}` : "";
    return createNotification(userId, "reservation_cancelled", "Reservation Cancelled",
      `Your reservation${codeStr} has been cancelled${reasonStr}.`,
      { entityType: "reservation" });
  },

  cancellationRequested: (userId, reservationCode) => {
    const code = formatCode(reservationCode);
    const codeStr = code ? ` ${code}` : "";
    return createNotification(userId, "reservation_cancellation_requested", "Cancellation Request Submitted",
      `Your cancellation request for reservation${codeStr} is pending admin review.`,
      { entityType: "reservation", actionUrl: "/applicant/profile" });
  },

  cancellationApproved: (userId, reservationCode) => {
    const code = formatCode(reservationCode);
    const codeStr = code ? ` ${code}` : "";
    return createNotification(userId, "reservation_cancelled", "Reservation Cancelled",
      `Your reservation${codeStr} has been cancelled. The reservation fee is non-refundable.`,
      { entityType: "reservation" });
  },

  cancellationRejected: (userId, reservationCode, note) => {
    const code = formatCode(reservationCode);
    const codeStr = code ? ` ${code}` : "";
    return createNotification(userId, "reservation_cancellation_rejected", "Cancellation Request Not Approved",
      `Your cancellation request for reservation${codeStr} was not approved.${note ? ` Admin note: ${note}` : ""}`,
      { entityType: "reservation" });
  },

  cancellationRequestAlert: (adminUserId, tenantName, reservationCode, reservationId = null) => {
    const code = formatCode(reservationCode);
    const codeStr = code ? ` for reservation ${code}` : " for reservation";
    return createNotification(adminUserId, "reservation_cancellation_requested", "Cancellation Request Received",
      `${tenantName} has requested cancellation${codeStr}. Review required. The reservation fee is non-refundable.`,
      {
        entityType: "reservation",
        entityId: reservationId ? String(reservationId) : null,
        actionUrl: reservationId
          ? `/admin/reservations?reservationId=${String(reservationId)}&focus=cancellation`
          : "/admin/reservations",
      });
  },

  cancellationRequestWithdrawnAlert: (adminUserId, tenantName, reservationCode, reservationId = null) => {
    const code = formatCode(reservationCode);
    const codeStr = code ? ` for reservation ${code}` : " for reservation";
    return createNotification(adminUserId, "reservation_cancellation_withdrawn", "Cancellation Request Withdrawn",
      `${tenantName} has withdrawn their cancellation request${codeStr}. The reservation remains active.`,
      {
        entityType: "reservation",
        entityId: reservationId ? String(reservationId) : null,
        actionUrl: reservationId
          ? `/admin/reservations?reservationId=${String(reservationId)}`
          : "/admin/reservations",
      });
  },

  visitScheduledAlert: (
    adminUserId,
    {
      tenantName = "An applicant",
      roomName = "a room",
      branch = "",
      visitDate = "",
      visitTime = "",
      reservationId = null,
      viewingPreference = "physical_visit",
      isReschedule = false,
    } = {},
  ) => {
    let title = isReschedule ? "Visit Rescheduled" : "New Visit Schedule";
    let message = `${tenantName} ${isReschedule ? "rescheduled a visit" : "scheduled a visit"} for ${roomName}`;
    if (visitDate) {
      const dateLabel = new Date(visitDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      message += ` on ${dateLabel}${visitTime ? ` at ${visitTime}` : ""}`;
    }
    if (viewingPreference === "remote_2d_viewing") {
      title = "2D Remote Viewing Request";
      message = `${tenantName} requested photo-based remote viewing for ${roomName}`;
    } else if (viewingPreference === "urgent_move_in_review") {
      title = "Priority Viewing Review Request";
      message = `${tenantName} requested priority viewing review for ${roomName}`;
    }
    message += ".";

    const actionUrl = reservationId
      ? `/admin/reservations?reservationId=${encodeURIComponent(String(reservationId))}&tab=visits`
      : "/admin/reservations?tab=visits";

    return createNotification(adminUserId, "visit_requested", title, message, {
      entityType: "reservation",
      entityId: reservationId ? String(reservationId) : null,
      actionUrl,
    });
  },

  visitApproved: (userId, branchName) =>
    createNotification(userId, "visit_approved", "Visit Schedule Confirmed",
      `Your physical visit schedule for ${branchName} has been confirmed.`,
      { entityType: "reservation" }),

  visitRejected: (userId, reason) =>
    createNotification(userId, "visit_rejected", "Visit Schedule Update",
      `Your visit request could not be confirmed. ${reason || "Please select another schedule."}`,
      { entityType: "reservation" }),

  paymentApproved: (userId, billingMonth, amount, options = {}) => {
    const title = "Payment Confirmed";
    const formattedAmount = typeof amount === "number" ? amount.toLocaleString() : amount;
    const message = `Your payment of ₱${formattedAmount} for ${billingMonth} has been received and confirmed.`;
    const billId = options.billId || null;
    const dedupeKey = buildEventDedupeKey(
      "payment_confirmed",
      billId || "account",
      options.eventId,
    );

    return createNotificationWithPush(
      userId,
      "payment_confirmed",
      title,
      message,
      {
        entityType: "bill",
        entityId: billId ? String(billId) : null,
        actionUrl: billId ? `/billing?billId=${String(billId)}` : "/billing",
        dedupeKey,
      },
      (_notification, pushIdentity) =>
        sendMobilePushToRecipients([userId], {
          title,
          body: message,
          data: {
            ...pushIdentity,
            type: "payment_confirmed",
            billing_id: billId ? String(billId) : "",
            screen: "billing",
            url: billId ? `/bill-details?billId=${String(billId)}` : "/(tabs)/billing",
          },
        }),
    );
  },

  paymentConfirmed: (userId, billingMonth, amount, options = {}) =>
    notify.paymentApproved(userId, billingMonth, amount, options),

  billingNotice: (
    userId,
    {
      notificationType = "bill_due_reminder",
      title = "Billing Notice",
      message = "You have a billing update.",
      billId = null,
      actionUrl = "/billing",
      pushType = "billing_notice",
      eventId = null,
    } = {},
  ) =>
    createNotificationWithPush(
      userId,
      notificationType,
      title,
      message,
      {
        entityType: "bill",
        entityId: billId ? String(billId) : null,
        actionUrl,
        dedupeKey: buildEventDedupeKey(
          notificationType,
          billId,
          eventId,
        ),
      },
      (_notification, pushIdentity) =>
        sendMobilePushToRecipients([userId], {
          title,
          body: message,
          data: {
            ...pushIdentity,
            type: pushType,
            billing_id: billId ? String(billId) : "",
            screen: "billing",
            url: billId ? `/bill-details?billId=${String(billId)}` : "/(tabs)/billing",
          },
        }),
    ),

  paymentRejected: (userId, billingMonth, reason, options = {}) => {
    const title = "Payment Rejected";
    const message = `Your payment for ${billingMonth} was rejected. ${reason || "Please resubmit."}`;
    const billId = options.billId || null;
    const dedupeKey = buildEventDedupeKey(
      "payment_rejected",
      billId || "account",
      options.eventId,
    );

    return createNotificationWithPush(
      userId,
      "payment_rejected",
      title,
      message,
      {
        entityType: "bill",
        entityId: billId ? String(billId) : null,
        actionUrl: billId ? `/billing?billId=${String(billId)}` : "/billing",
        dedupeKey,
      },
      (_notification, pushIdentity) =>
        sendMobilePushToRecipients([userId], {
          title,
          body: message,
          data: {
            ...pushIdentity,
            type: "payment_rejected",
            billing_id: billId ? String(billId) : "",
            screen: "billing",
            url: billId ? `/bill-details?billId=${String(billId)}` : "/(tabs)/billing",
          },
        }),
    );
  },

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
        dedupeKey: buildEventDedupeKey(
          "bill_released",
          options.billId,
          options.eventId,
        ),
      },
      (_notification, pushIdentity) => sendMobilePushBill(userId, null, {
        billingMonth,
        totalAmount,
        dueDate,
        billId: options.billId || null,
        billType: options.billType || "bill",
        data: pushIdentity,
      }),
    ),

  // NOTE: previously used createNotification() (DB record + realtime socket
  // event only, no push) and never attached entityId/billId at all. Every
  // electricity/water bill release silently produced no OS push notification
  // and no deep-linkable reference to the specific bill — the root cause of
  // "tenant does not receive a notification" for utility bills specifically.
  // Now mirrors billGenerated()'s createNotificationWithPush + billId pattern.
  utilityChargeAvailable: (
    userId,
    utilityType,
    billingMonth,
    utilityAmount,
    totalAmount,
    dueDate,
    options = {},
  ) => {
    const billId = options.billId || null;
    const identity={billId:billId ? String(billId) : '',utilityType,
      utilityPeriodId:options.utilityPeriodId ? String(options.utilityPeriodId) : '',
      allocationIds:[...(options.allocationIds || [])].sort().join(',')};
    const title = `${utilityType === "water" ? "Water" : "Electricity"} Charge Available`;
    const message = `Your ${utilityType} charge for ${billingMonth} is ₱${utilityAmount}. Current bill total: ₱${totalAmount}. Due by ${dueDate}.`;

    return createNotificationWithPush(
      userId,
      "bill_generated",
      title,
      message,
      {
        data:{...identity,screen:"billing",url:billId ? `/bill-details?billId=${String(billId)}` : "/(tabs)/billing"},
        entityType: "bill",
        entityId: billId ? String(billId) : null,
        actionUrl: billId ? `/billing?billId=${String(billId)}` : "/applicant/billing",
        dedupeKey: buildEventDedupeKey(
          "utility_charge_available",
          billId,
          options.eventId || `${utilityType}:${identity.utilityPeriodId}:${identity.allocationIds}`,
        ),
      },
      (_notification, pushIdentity) =>
        sendMobilePushToRecipients([userId], {
          title,
          body: message,
          data: {
            ...pushIdentity,
            ...identity,
            type: "bill_generated",
            billing_id: billId ? String(billId) : "",
            screen: "billing",
            url: billId ? `/bill-details?billId=${String(billId)}` : "/(tabs)/billing",
          },
        }),
    );
  },

  // Fired once a contract document actually becomes available to the tenant
  // — after generatePreparedContractPdf() (contractController.js's
  // generatePreparedContract) or publishFinalContract() succeeds. Until this
  // existed, the tenant mobile app's Lease Contract screen could sit on
  // "Preparing Contract" indefinitely with zero signal that admin action had
  // actually happened — the tenant had to manually reopen the screen to find
  // out. Mirrors utilityChargeAvailable's createNotificationWithPush +
  // entityId pattern so the mobile app's push-tap routing (which already
  // knows how to deep-link entityType "contract") needs no changes.
  // `version` must uniquely identify the actual document that became
  // available (preparedDocument's generatedVersion, or finalDocument's
  // sourceVersion) — it is the entire idempotency guarantee: retrying the
  // same generate/publish call for the SAME version dedupes via the unique
  // dedupeKey below, while a genuinely new version (regeneration, a later
  // publish) is a distinct key and gets its own notification.
  contractDocumentReady: (userId, variant, contractId, version) => {
    const normalizedVariant = String(variant || "").trim().toLowerCase();
    const normalizedVersion = Number(version);
    if (
      !userId
      || !contractId
      || !["prepared", "final"].includes(normalizedVariant)
      || !Number.isInteger(normalizedVersion)
      || normalizedVersion < 1
    ) {
      return Promise.reject(new Error("A tenant, contract, prepared/final variant, and positive document version are required."));
    }

    const isFinal = normalizedVariant === "final";
    const title = isFinal ? "Final Contract Ready" : "Contract Ready for Signing";
    const message = isFinal
      ? "Your final lease contract is now available to view and download."
      : "Your lease contract has been prepared and is ready for your review and in-person signing.";
    const normalizedContractId = String(contractId);
    // The unique index is { userId, dedupeKey }, so an identical contract
    // reference in another tenant's scope remains an independent event.
    const dedupeKey = `contract_document_ready:${normalizedContractId}:${normalizedVariant}:${normalizedVersion}`;

    return createNotificationWithPush(
      userId,
      "contract_document_ready",
      title,
      message,
      {
        entityType: "contract",
        entityId: normalizedContractId,
        actionUrl: "/applicant/contracts",
        dedupeKey,
      },
      (_notification, pushIdentity) =>
        sendMobilePushToRecipients([userId], {
          title,
          body: message,
          data: {
            ...pushIdentity,
            type: "contract_document_ready",
            contract_id: normalizedContractId,
            screen: "contract",
            url: "/contract-viewer",
          },
        }),
    );
  },

  // Fired once by contractRenewalActivationService.activateDueRenewalContracts
  // when a renewal successor Contract transitions published -> active at its
  // effective (leaseStartDate) date. dedupeKey is keyed off the contract
  // alone (not a date) since activation happens exactly once per contract.
  renewalEffective: (userId, roomName, contractId) => {
    if (!userId || !contractId) {
      return Promise.reject(new Error("A tenant and contract are required."));
    }
    const normalizedContractId = String(contractId);
    return createNotificationWithPush(
      userId,
      "renewal_effective",
      "Lease Renewal Now Active",
      `Your renewed lease for ${roomName || "your room"} is now active.`,
      {
        entityType: "contract",
        entityId: normalizedContractId,
        actionUrl: "/applicant/contracts",
        dedupeKey: `renewal_effective:${normalizedContractId}`,
      },
      (_notification, pushIdentity) =>
        sendMobilePushToRecipients([userId], {
          title: "Lease Renewal Now Active",
          body: `Your renewed lease for ${roomName || "your room"} is now active.`,
          data: {
            ...pushIdentity,
            type: "renewal_effective",
            contract_id: normalizedContractId,
            screen: "contract",
            url: "/contract-viewer",
          },
        }),
    );
  },

  overdueMoveIn: (userId, reservationCode, roomName, tenantName, daysOverdue, options = {}) => {
    const code = formatCode(reservationCode);
    const codeStr = code ? ` (${code})` : "";
    const todayStr = new Date().toISOString().slice(0, 10);
    const dedupeKey = options.dedupeKey || (userId ? `overdue_move_in:${String(userId)}:${todayStr}` : undefined);
    return createNotificationWithPush(
      userId,
      "grace_period_warning",
      "Overdue Move-In",
      `${tenantName}${codeStr} is ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue for move-in to ${roomName}. Please extend or cancel.`,
      { entityType: "reservation", dedupeKey, ...options },
    );
  },

  accountSuspended: (userId, reason) =>
    createNotification(userId, "account_suspended", "Account Suspended",
      `Your account has been suspended. ${reason || "Contact support for details."}`,
      { entityType: "user" }),

  accountReactivated: (userId) =>
    createNotification(userId, "account_reactivated", "Account Reactivated",
      "Your account has been reactivated. You can now log in and use the system.",
      { entityType: "user" }),

  billDueReminder: (userId, billingMonth, totalAmount, daysUntilDue, options = {}) => {
    const isDueToday = Number(daysUntilDue) === 0;
    const isDueTomorrow = Number(daysUntilDue) === 1;
    const title = isDueToday ? "Bill Due Today" : "Payment Reminder";
    const message = isDueToday
      ? `Your bill of ₱${totalAmount.toLocaleString()} for ${billingMonth} is due today. Please settle promptly.`
      : isDueTomorrow
        ? `Your bill of ₱${totalAmount.toLocaleString()} for ${billingMonth} is due tomorrow.`
        : `Your bill of ₱${totalAmount.toLocaleString()} for ${billingMonth} is due in ${daysUntilDue} days.`;
    const billId = options.billId || null;
    const todayStr = new Date().toISOString().slice(0, 10);
    const dedupeKey = options.dedupeKey || (billId ? `bill_due_reminder:${String(billId)}:${daysUntilDue}:${todayStr}` : undefined);

    return createNotificationWithPush(
      userId,
      "bill_due_reminder",
      title,
      message,
      {
        entityType: "bill",
        entityId: billId ? String(billId) : null,
        actionUrl: billId ? `/billing?billId=${String(billId)}` : "/billing",
        dedupeKey:
          buildEventDedupeKey("bill_due_reminder", billId, options.eventId) ||
          dedupeKey,
        ...options,
      },
      (_notification, pushIdentity) =>
        sendMobilePushToRecipients([userId], {
          title,
          body: message,
          data: {
            ...pushIdentity,
            type: "bill_due_reminder",
            billing_id: billId ? String(billId) : "",
            screen: "billing",
            url: billId ? `/bill-details?billId=${String(billId)}` : "/(tabs)/billing",
          },
        }),
    );
  },

  penaltyApplied: (userId, billingMonth, penaltyAmount, daysLate, options = {}) => {
    const title = "Late Payment Penalty";
    const message = `A penalty of ₱${penaltyAmount.toLocaleString()} (${daysLate} day${daysLate === 1 ? "" : "s"} late) has been applied to your ${billingMonth} bill.`;
    const billId = options.billId || null;
    const todayStr = new Date().toISOString().slice(0, 10);
    const dedupeKey = options.dedupeKey || (billId ? `penalty_applied:${String(billId)}:${daysLate}:${todayStr}` : undefined);

    return createNotificationWithPush(
      userId,
      "penalty_applied",
      title,
      message,
      {
        entityType: "bill",
        entityId: billId ? String(billId) : null,
        actionUrl: billId ? `/billing?billId=${String(billId)}` : "/billing",
        dedupeKey:
          buildEventDedupeKey("penalty_applied", billId, options.eventId) ||
          dedupeKey,
        ...options,
      },
      (_notification, pushIdentity) =>
        sendMobilePushToRecipients([userId], {
          title,
          body: message,
          data: {
            ...pushIdentity,
            type: "penalty_applied",
            billing_id: billId ? String(billId) : "",
            screen: "billing",
            url: billId ? `/bill-details?billId=${String(billId)}` : "/(tabs)/billing",
          },
        }),
    );
  },

  contractExpiring: (userId, roomName, daysRemaining) => {
    const title = "Lease Expiring Soon";
    const message = `Your lease for ${roomName} expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}. Please contact the admin to renew or arrange move-out.`;

    return createNotificationWithPush(
      userId,
      "contract_expiring",
      title,
      message,
      { entityType: "reservation", actionUrl: "/applicant/profile" },
      (_notification, pushIdentity) =>
        sendMobilePushToRecipients([userId], {
          title,
          body: message,
          data: {
            ...pushIdentity,
            type: "contract_expiring",
            screen: "home",
          },
        }),
    );
  },

  reservationExpired: (userId, reservationCode, roomName) => {
    const code = formatCode(reservationCode);
    const codeStr = code ? ` ${code}` : "";
    const roomStr = roomName ? ` for ${roomName}` : "";
    return createNotification(userId, "reservation_expired", "Reservation Expired",
      `Your reservation${codeStr}${roomStr} has expired due to inactivity. The bed has been released.`,
      { entityType: "reservation" });
  },

  reservationNoShow: (userId, reservationCode, roomName, daysOverdue) => {
    const code = formatCode(reservationCode);
    const codeStr = code ? ` ${code}` : "";
    const roomStr = roomName ? ` for ${roomName}` : "";
    return createNotification(userId, "reservation_noshow", "Reservation Cancelled — No Show",
      `Your reservation${codeStr}${roomStr} has been cancelled. You did not move in within ${daysOverdue} days of your deadline.`,
      { entityType: "reservation" });
  },

  stalePendingVisitWarning: (adminUserId, tenantName, roomName, daysPending, options = {}) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const dedupeKey = options.dedupeKey || `stale_visit_warning:${String(adminUserId)}:${String(tenantName)}:${todayStr}`;
    return createNotificationWithPush(
      adminUserId,
      "general",
      "Unactioned Visit Request",
      `${tenantName} has a visit request for ${roomName} pending for ${daysPending} days. It will auto-expire in ${14 - daysPending} day${(14 - daysPending) === 1 ? "" : "s"} if not acted on.`,
      { entityType: "reservation", actionUrl: "/admin/reservations?tab=visits", dedupeKey, ...options },
    );
  },

  slaBreachAlert: (adminUserId, branch, delayedCount, urgencyBreakdown, options = {}) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const dedupeKey = options.dedupeKey || `sla_breach:${String(adminUserId)}:${String(branch)}:${todayStr}`;
    const branchParam = branch ? `&branch=${encodeURIComponent(branch)}` : "";
    return createNotificationWithPush(
      adminUserId,
      "sla_breach",
      `SLA Breach — ${delayedCount} Request${delayedCount > 1 ? "s" : ""} Overdue`,
      `${delayedCount} maintenance request${delayedCount > 1 ? "s" : ""} in ${branch} ${delayedCount > 1 ? "have" : "has"} breached SLA. (${urgencyBreakdown}). Immediate attention required.`,
      { actionUrl: `/admin/maintenance?quickFilter=delayed${branchParam}`, entityType: "maintenance", dedupeKey, ...options },
    );
  },

  chatUnresponded: (adminUserId, branch, conversationCount, options = {}) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const dedupeKey = options.dedupeKey || `chat_unresponded:${String(adminUserId)}:${String(branch)}:${todayStr}`;
    return createNotificationWithPush(
      adminUserId,
      "chat_unresponded",
      `${conversationCount} Chat${conversationCount > 1 ? "s" : ""} Awaiting Response`,
      `${conversationCount} open conversation${conversationCount > 1 ? "s" : ""} in ${branch} ${conversationCount > 1 ? "have" : "has"} not received an admin reply in over 4 hours.`,
      { actionUrl: "/admin/chat", entityType: "chat", dedupeKey, ...options },
    );
  },

  moveOutComplete: (userId, roomName) =>
    createNotificationWithPush(
      userId,
      "general",
      "Move-Out Complete",
      `You have been moved out from ${roomName}. Thank you for staying at Lilycrest!`,
      { entityType: "stay" },
      (_notification, pushIdentity) =>
        sendMobilePushToRecipients([userId], {
          title: "Move-Out Complete",
          body: `You have been moved out from ${roomName}. Thank you for staying at Lilycrest!`,
          data: {
            ...pushIdentity,
            type: "move_out",
            screen: "home",
          },
        }),
    ),

  general: (userId, title, message, options = {}) =>
    createNotification(userId, "general", title, message, options),

  generalOnce: async (userId, title, message, dedupeKey, options = {}) => {
    const result = await createNotificationOnce(
      userId,
      "general",
      title,
      message,
      dedupeKey,
      options,
    );
    return result.notification;
  },

  roomTransferLifecycleOnce: (
    userId,
    title,
    message,
    dedupeKey,
    options = {},
  ) => createNotificationWithPush(
    userId,
    "general",
    title,
    message,
    {
      entityType: "reservation",
      actionUrl: "/applicant/profile?tab=stays&section=room-transfer",
      ...options,
      dedupeKey,
    },
    (_notification, pushIdentity) => sendMobilePushToRecipients([userId], {
      title,
      body: message,
      data: {
        ...pushIdentity,
        type: options.pushType || "room_transfer",
        event: options.event || "updated",
        screen: "room_transfer",
        url: "/room-transfer",
        ...(options.entityId ? { reservation_id: String(options.entityId) } : {}),
      },
    }),
  ),

  adminReply: (userId, conversationId, messageId) => {
    if (!userId || !conversationId || !messageId) {
      return Promise.reject(new Error("A tenant, conversation, and persisted message are required."));
    }

    const normalizedConversationId = String(conversationId);
    const normalizedMessageId = String(messageId);
    const title = "New Admin Reply";
    const message = "You received a reply from LilyCrest Admin. Confirm whether your concern was resolved.";

    return createNotificationWithPush(
      userId,
      "chat_reply",
      title,
      message,
      {
        entityType: "chat",
        entityId: normalizedConversationId,
        actionUrl: "/(tabs)/chatbot",
        dedupeKey: `chat_reply:${normalizedConversationId}:${normalizedMessageId}`,
      },
      (_notification, pushIdentity) =>
        sendMobilePushToRecipients([userId], {
          title,
          body: message,
          data: {
            ...pushIdentity,
            type: "chat_reply",
            conversation_id: normalizedConversationId,
            message_id: normalizedMessageId,
            screen: "chat",
            url: `/(tabs)/chatbot?conversationId=${encodeURIComponent(normalizedConversationId)}`,
          },
        }),
    );
  },

  maintenanceUpdated: async (userId, requestType, status, requestId, options = {}) => {
    const title = buildMaintenanceNotificationTitle(requestType);
    const message = buildMaintenanceUpdateMessage(requestType, status, options);
    const normalizedRequestId = requestId ? String(requestId) : null;
    return createNotificationWithPush(
      userId,
      "maintenance_update",
      title,
      message,
      {
        entityType: "maintenance",
        entityId: normalizedRequestId,
        actionUrl: "/applicant/maintenance",
        dedupeKey: buildEventDedupeKey(
          "maintenance_update",
          normalizedRequestId,
          options.eventId,
        ),
      },
      (_notification, pushIdentity) =>
        sendMobilePushToRecipients([userId], {
          title,
          body: message,
          data: {
            ...pushIdentity,
            type: "maintenance_update",
            request_id: normalizedRequestId || "",
            screen: "maintenance",
          },
        }),
    );
  },

  maintenanceProviderAssigned: (
    userId,
    requestType,
    tenantVisibleProviderLabel,
    requestId,
    options = {},
  ) => {
    const normalizedRequestId = requestId ? String(requestId) : null;
    const safeProviderLabel = String(tenantVisibleProviderLabel || "the maintenance team").trim();
    const title = buildMaintenanceNotificationTitle(requestType);
    const message = `${safeProviderLabel} has been assigned to your maintenance request.`;
    return createNotificationWithPush(
      userId,
      "maintenance_update",
      title,
      message,
      {
        entityType: "maintenance",
        entityId: normalizedRequestId,
        actionUrl: "/applicant/maintenance",
        dedupeKey: buildEventDedupeKey(
          "maintenance_provider_assigned",
          normalizedRequestId,
          options.eventId,
        ),
      },
      (_notification, pushIdentity) =>
        sendMobilePushToRecipients([userId], {
          title,
          body: message,
          data: {
            ...pushIdentity,
            type: "maintenance_update",
            request_id: normalizedRequestId || "",
            screen: "maintenance",
          },
        }),
    );
  },

  newMaintenanceTicket: (branch, tenantName, roomName, urgency, category, requestId) => {
    const isEmergency = urgency === "emergency" || urgency === "high";
    const title = isEmergency
      ? `CRITICAL: Emergency Maintenance Request`
      : `New Maintenance Request`;
    const message = `${tenantName} in ${roomName || "assigned room"} filed a ${urgency ? urgency.toUpperCase() : "NORMAL"} maintenance request (${category || "General"}).`;
    return notifyBranchAdmins(branch, "maintenance_new", title, message, {
      entityType: "maintenance",
      entityId: requestId ? String(requestId) : null,
      actionUrl: requestId ? `/admin/maintenance?requestId=${String(requestId)}` : "/admin/maintenance",
    });
  },

  maintenanceScheduled: (userId, requestType, scheduledDate, _notes, requestId, options = {}) => {
    const formattedDate = scheduledDate instanceof Date ? scheduledDate.toLocaleString() : String(scheduledDate || "");
    const title = "Maintenance Visit Scheduled";
    const message = `Service visit for your ${requestType || "maintenance"} request has been scheduled for ${formattedDate}.`;
    return createNotificationWithPush(
      userId,
      "maintenance_update",
      title,
      message,
      {
        entityType: "maintenance",
        entityId: requestId ? String(requestId) : null,
        actionUrl: "/applicant/maintenance",
        dedupeKey: buildEventDedupeKey(
          "maintenance_scheduled",
          requestId,
          options.eventId,
        ),
      },
      (_notification, pushIdentity) =>
        sendMobilePushToRecipients([userId], {
          title,
          body: message,
          data: {
            ...pushIdentity,
            type: "maintenance_status",
            request_id: requestId ? String(requestId) : "",
            screen: "maintenance",
          },
        }),
    );
  },

  maintenanceReportFinalized: (userId, requestType, requestId, options = {}) => {
    const title = "Official Completion Report Ready";
    const message = `The official completion report for your ${requestType || "maintenance"} request is now ready for your review.`;
    return createNotificationWithPush(
      userId,
      "maintenance_update",
      title,
      message,
      {
        entityType: "maintenance",
        entityId: requestId ? String(requestId) : null,
        actionUrl: "/applicant/maintenance",
        dedupeKey: buildEventDedupeKey(
          "maintenance_report_finalized",
          requestId,
          options.eventId,
        ),
      },
      (_notification, pushIdentity) =>
        sendMobilePushToRecipients([userId], {
          title,
          body: message,
          data: {
            ...pushIdentity,
            type: "maintenance_status",
            request_id: requestId ? String(requestId) : "",
            screen: "maintenance",
          },
        }),
    );
  },

  maintenanceTenantReply: (branch, tenantName, requestId) =>
    notifyBranchAdmins(branch, "maintenance_new", "Maintenance Reply Received",
      `${tenantName} replied to maintenance request.`,
      {
        entityType: "maintenance",
        entityId: requestId ? String(requestId) : null,
        actionUrl: requestId ? `/admin/maintenance?requestId=${String(requestId)}` : "/admin/maintenance",
      }),

  maintenanceReopened: (branch, tenantName, requestId) =>
    notifyBranchAdmins(branch, "maintenance_new", "Maintenance Ticket Re-opened",
      `${tenantName} re-opened maintenance request. Action required.`,
      {
        entityType: "maintenance",
        entityId: requestId ? String(requestId) : null,
        actionUrl: requestId ? `/admin/maintenance?requestId=${String(requestId)}` : "/admin/maintenance",
      }),

  newApplicationSubmitted: (branch, applicantName, roomName, reservationId) =>
    notifyBranchAdmins(branch, "application_submitted", "New Application Received",
      `New application submitted by ${applicantName} for ${roomName || "room"}. Document review required.`,
      {
        entityType: "reservation",
        entityId: reservationId ? String(reservationId) : null,
        actionUrl: reservationId ? `/admin/reservations?reservationId=${String(reservationId)}` : "/admin/reservations",
      }),

  contractSignedByTenant: (branch, tenantName, roomName, contractId) =>
    notifyBranchAdmins(branch, "contract_signed", "Lease Contract Signed",
      `${tenantName} has signed the lease contract for ${roomName || "room"}. Ready for admin verification.`,
      {
        entityType: "contract",
        entityId: contractId ? String(contractId) : null,
        actionUrl: "/admin/contracts",
      }),

  paymentProofSubmitted: (branch, tenantName, billingMonth, amount, billId) => {
    const formattedAmount = typeof amount === "number" ? amount.toLocaleString() : amount;
    return notifyBranchAdmins(branch, "payment_proof_submitted", "Payment Verification Pending",
      `${tenantName} submitted payment proof of ₱${formattedAmount} for ${billingMonth}. Verification required.`,
      {
        entityType: "bill",
        entityId: billId ? String(billId) : null,
        actionUrl: billId ? `/admin/billing?billId=${String(billId)}` : "/admin/billing",
      });
  },

  newVisitRequested: (branch, applicantName, roomName, visitDate, visitTime, options = {}) => {
    const reservationId = options.reservationId || options.entityId || null;
    const viewingPreference = options.viewingPreference || "physical_visit";
    const isReschedule = options.isReschedule === true;

    let title = isReschedule ? "Visit Rescheduled" : "New Visit Scheduled";
    let message = `${applicantName} ${isReschedule ? "rescheduled a viewing visit" : "scheduled a viewing visit"} for ${roomName || "room"}`;
    if (visitDate && visitDate !== "TBD") {
      message += ` on ${visitDate}${visitTime ? ` at ${visitTime}` : ""}`;
    }
    if (viewingPreference === "remote_2d_viewing") {
      title = "2D Remote Viewing Request";
      message = `${applicantName} requested photo-based remote viewing for ${roomName || "room"}`;
    } else if (viewingPreference === "urgent_move_in_review") {
      title = "Priority Viewing Review Request";
      message = `${applicantName} requested priority viewing review for ${roomName || "room"}`;
    }
    message += ".";

    const actionUrl = reservationId
      ? `/admin/reservations?reservationId=${encodeURIComponent(String(reservationId))}&tab=visits`
      : "/admin/reservations?tab=visits";

    return notifyBranchAdmins(branch, "visit_requested", title, message, {
      entityType: "reservation",
      entityId: reservationId ? String(reservationId) : null,
      actionUrl,
      ...options,
    });
  },
};

export async function notifyBranchAdmins(branch, type, title, message, options = {}) {
  try {
    const rawBranch = String(branch || "").trim();
    const branchSlug = rawBranch.toLowerCase().replace(/\s+/g, "-");
    const branchDisplay =
      branchSlug === "gil-puyat"
        ? "Gil Puyat"
        : branchSlug === "guadalupe"
          ? "Guadalupe"
          : rawBranch;

    const branchMatches = Array.from(
      new Set([rawBranch, branchSlug, branchDisplay].filter(Boolean)),
    );

    const adminRecipients = branchMatches.length > 0
      ? [
          { role: "branch_admin", branch: { $in: branchMatches } },
          { role: "owner" },
        ]
      : [
          { role: "branch_admin" },
          { role: "owner" },
        ];

    const adminUsers = await User.find({
      $or: adminRecipients,
      accountStatus: "active",
      isArchived: { $ne: true },
    }).select("_id branch role").lean();

    const notifications = await Promise.all(
      adminUsers.map(async (admin) => {
        if (options.dedupeKey) {
          const result = await createNotificationOnce(
            admin._id,
            type,
            title,
            message,
            options.dedupeKey,
            options,
          );
          return result.notification;
        }
        return createNotification(admin._id, type, title, message, options);
      }),
    );

    return notifications.filter(Boolean);
  } catch (error) {
    logger.warn(
      { err: error, branch, type },
      "[Notification] Failed to notify branch admins",
    );
    return [];
  }
}

export { createNotification, notify };
export default notify;
