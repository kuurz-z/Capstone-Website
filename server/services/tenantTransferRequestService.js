import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import MoveOutClearance from "../models/MoveOutClearance.js";
import Reservation from "../models/Reservation.js";
import Room from "../models/Room.js";
import ScheduledRoomTransfer from "../models/ScheduledRoomTransfer.js";
import TerminationReview from "../models/TerminationReview.js";
import TenantTransferRequest from "../models/TenantTransferRequest.js";
import User from "../models/User.js";
import { OPEN_SCHEDULED_ROOM_TRANSFER_STATUSES } from "../models/ScheduledRoomTransfer.js";
import {
  resolveAuthoritativeCurrentContract,
  resolveCurrentStayForTenant,
} from "./tenantContractSelectionService.js";
import { notify, notifyBranchAdmins } from "./notifications/notificationService.js";
import { getManilaToday, toManilaStartOfDay } from "../utils/dateUtils.js";
import { hasReservationStatus } from "../utils/lifecycleNaming.js";
import { isValidTransferPredecessor } from "../utils/tenantActionService.js";
import { serializeScheduledRoomTransfer } from "./scheduledRoomTransferView.js";

const ROOM_TYPES = new Set(["private", "double-sharing", "quadruple-sharing"]);
const OPEN_REQUEST_STATUSES = ["pending", "scheduling", "scheduled"];
export const SCHEDULING_CLAIM_TTL_MS = 5 * 60 * 1000;

const serviceError = (message, code, statusCode = 400) =>
  Object.assign(new Error(message), { code, statusCode });

const id = (value) => (value ? String(value?._id || value) : null);

const cleanText = (value, maxLength) =>
  String(value ?? "").trim().slice(0, maxLength);

const tenantName = (user) =>
  cleanText(
    user?.name || user?.fullName || `${user?.firstName || ""} ${user?.lastName || ""}`,
    200,
  ) || "A tenant";

const normalizePreferredDate = (value) => {
  if (!value) return null;
  const requestedDay = toManilaStartOfDay(value);
  if (!requestedDay) {
    throw serviceError("Preferred transfer date is invalid.", "INVALID_PREFERRED_TRANSFER_DATE");
  }
  if (requestedDay.isBefore(getManilaToday(), "day")) {
    throw serviceError(
      "Preferred transfer date must be today or later.",
      "PREFERRED_TRANSFER_DATE_IN_PAST",
    );
  }
  return requestedDay.toDate();
};

const safeRoom = (room) => {
  if (!room) return null;
  return {
    id: id(room),
    name: room.name || "",
    roomNumber: room.roomNumber || "",
    type: room.type || "",
    branch: room.branch || "",
  };
};

export function deriveTenantTransferStatus(request, scheduledTransfer = null) {
  const scheduleStatus = scheduledTransfer?.recordStatus || scheduledTransfer?.status;
  if (["executed", "completed"].includes(scheduleStatus)) return "completed";
  if (scheduleStatus === "cancelled") return "cancelled";
  // A schedule is operationally authoritative. Its tenant/admin serializer may
  // expose derived values such as ready_for_transfer/action_required rather
  // than the stored enum, but those all remain "Scheduled" in this lifecycle.
  if (scheduledTransfer) return "scheduled";
  return request?.status === "scheduling" ? "pending" : request?.status || null;
}

const lifecycleTime = (record) => {
  if (!record) return 0;
  const status = record.recordStatus || record.status;
  const value = status === "executed" || status === "completed"
    ? record.executedAt || record.completedAt || record.updatedAt
    : status === "cancelled"
      ? record.cancelledAt || record.updatedAt
      : status === "declined"
        ? record.reviewedAt || record.updatedAt
        : record.scheduledAt || record.submittedAt || record.createdAt || record.updatedAt;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

const isOpenSchedule = (schedule) => OPEN_SCHEDULED_ROOM_TRANSFER_STATUSES.includes(
  schedule?.recordStatus || schedule?.status,
);

const sortNewest = (records = []) => [...records].sort((left, right) => (
  lifecycleTime(right) - lifecycleTime(left)
));

export function selectCanonicalTenantTransferLifecycle({ request = null, scheduledTransfers = [] } = {}) {
  const schedules = sortNewest(scheduledTransfers.filter(Boolean));
  const openSchedule = schedules.find(isOpenSchedule) || null;
  if (openSchedule) return { request, scheduledTransfer: openSchedule };

  const linkedSchedule = request?.scheduledRoomTransferId
    ? schedules.find((schedule) => id(schedule) === id(request.scheduledRoomTransferId)) || null
    : null;
  const latestSchedule = schedules[0] || null;
  if (!request) return { request: null, scheduledTransfer: latestSchedule };
  if (!latestSchedule) return { request, scheduledTransfer: null };

  // The link is authoritative for that lifecycle, but it does not mask a newer
  // Admin-only lifecycle. Actual event chronology decides between them.
  const candidate = linkedSchedule && lifecycleTime(linkedSchedule) >= lifecycleTime(latestSchedule)
    ? linkedSchedule
    : latestSchedule;
  const requestStartedAt = new Date(request.submittedAt || request.createdAt || 0).getTime();
  const scheduleStartedAt = new Date(candidate.scheduledAt || candidate.createdAt || 0).getTime();
  const linked = id(candidate) === id(request.scheduledRoomTransferId);
  return {
    request,
    scheduledTransfer: linked || scheduleStartedAt >= requestStartedAt ? candidate : null,
  };
}

async function reconcileRequestRecord(request, scheduledTransfer) {
  if (!request) return request;
  const requestDoc = typeof request.toObject === "function" ? request.toObject() : request;
  if (!scheduledTransfer) {
    const claimActivityAt = requestDoc.schedulingHeartbeatAt || requestDoc.schedulingStartedAt;
    const startedAt = claimActivityAt
      ? new Date(claimActivityAt).getTime()
      : 0;
    if (
      requestDoc.status === "scheduling" &&
      (!startedAt || Date.now() - startedAt >= SCHEDULING_CLAIM_TTL_MS)
    ) {
      const recovered = await TenantTransferRequest.findOneAndUpdate(
        {
          _id: requestDoc._id,
          status: "scheduling",
          schedulingHeartbeatAt: requestDoc.schedulingHeartbeatAt || null,
        },
        {
          $set: {
            status: "pending",
            schedulingToken: null,
            schedulingStartedAt: null,
            schedulingHeartbeatAt: null,
          },
        },
        { new: true },
      );
      return recovered || {
        ...requestDoc,
        status: "pending",
        schedulingStartedAt: null,
        schedulingHeartbeatAt: null,
      };
    }
    return request;
  }

  const schedule = typeof scheduledTransfer.toObject === "function"
    ? scheduledTransfer.toObject()
    : scheduledTransfer;
  if (id(requestDoc.reservationId) !== id(schedule.reservationId)) {
    const sameTenant = id(requestDoc.tenantId) && id(requestDoc.tenantId) === id(schedule.tenantId);
    const requestStartedAt = new Date(requestDoc.submittedAt || requestDoc.createdAt || 0).getTime();
    const scheduleStartedAt = new Date(schedule.scheduledAt || schedule.createdAt || 0).getTime();
    if (
      sameTenant &&
      OPEN_REQUEST_STATUSES.includes(requestDoc.status) &&
      scheduleStartedAt >= requestStartedAt
    ) {
      const superseded = await TenantTransferRequest.findOneAndUpdate(
        { _id: requestDoc._id, status: { $in: OPEN_REQUEST_STATUSES } },
        {
          $set: {
            status: "cancelled",
            cancelledAt: new Date(),
            schedulingToken: null,
            schedulingStartedAt: null,
            schedulingHeartbeatAt: null,
          },
        },
        { new: true },
      );
      return superseded || request;
    }
    return request;
  }
  const scheduleStatus = schedule.recordStatus || schedule.status;
  const nextStatus = ["executed", "completed"].includes(scheduleStatus)
    ? "completed"
    : scheduleStatus === "cancelled"
      ? "cancelled"
      : isOpenSchedule(schedule)
        ? "scheduled"
        : null;
  if (!nextStatus) return request;

  const linked = id(requestDoc.scheduledRoomTransferId) === id(schedule);
  const requestStartedAt = new Date(requestDoc.submittedAt || requestDoc.createdAt || 0).getTime();
  const scheduleStartedAt = new Date(schedule.scheduledAt || schedule.createdAt || 0).getTime();
  if (!linked && scheduleStartedAt < requestStartedAt) return request;
  if (![...OPEN_REQUEST_STATUSES, nextStatus].includes(requestDoc.status)) return request;

  const update = {
    status: nextStatus,
    scheduledRoomTransferId: schedule._id,
    schedulingToken: null,
    schedulingStartedAt: null,
    schedulingHeartbeatAt: null,
    ...(nextStatus === "completed" ? { completedAt: schedule.executedAt || new Date() } : {}),
    ...(nextStatus === "cancelled" ? { cancelledAt: schedule.cancelledAt || new Date() } : {}),
  };
  const reconciled = await TenantTransferRequest.findOneAndUpdate(
    {
      _id: requestDoc._id,
      status: { $in: [...OPEN_REQUEST_STATUSES, nextStatus] },
      ...(linked ? {} : { submittedAt: { $lte: schedule.scheduledAt || schedule.createdAt || new Date() } }),
    },
    { $set: update },
    { new: true },
  );
  return reconciled || request;
}

export async function resolveTenantTransferLifecycleRecords({
  tenantId = null,
  reservationId = null,
  request: suppliedRequest,
  scheduledTransfers: suppliedSchedules,
  reconcile = true,
} = {}) {
  const request = suppliedRequest !== undefined
    ? suppliedRequest
    : await TenantTransferRequest.findOne({ ...(reservationId ? { reservationId } : { tenantId }) })
        .sort({ submittedAt: -1, createdAt: -1 })
        .populate("preferredRoomId", "name roomNumber type branch")
        .select("+schedulingToken");
  const schedules = suppliedSchedules !== undefined
    ? suppliedSchedules
    : await ScheduledRoomTransfer.find({
        ...(reservationId ? { reservationId } : { tenantId }),
        isArchived: { $ne: true },
      })
        .sort({ scheduledAt: -1, createdAt: -1 })
        .populate("destinationRoomId", "name roomNumber type branch");

  let selected = selectCanonicalTenantTransferLifecycle({ request, scheduledTransfers: schedules });
  if (reconcile && selected.request) {
    const reconciledRequest = await reconcileRequestRecord(selected.request, selected.scheduledTransfer);
    selected = { ...selected, request: reconciledRequest };
  }
  return selected;
}

export function tenantTransferStatusLabel(status) {
  return {
    pending: "Pending Review",
    scheduled: "Scheduled",
    ready_for_transfer: "Ready for Transfer",
    awaiting_settlement: "Settlement Required",
    action_required: "Action Required",
    completed: "Completed",
    declined: "Declined",
    cancelled: "Cancelled",
  }[status] || "";
}

export async function serializeTenantScheduledTransfer(scheduledTransfer) {
  if (!scheduledTransfer) return null;
  const doc = typeof scheduledTransfer.toObject === "function"
    ? scheduledTransfer.toObject()
    : scheduledTransfer;
  const destinationRoom = doc.destinationRoomId && typeof doc.destinationRoomId === "object"
    ? doc.destinationRoomId
    : doc.destinationRoomId
      ? await Room.findById(doc.destinationRoomId).select("name roomNumber type branch").lean()
      : null;
  const canonical = await serializeScheduledRoomTransfer(doc);
  const status = canonical.status;
  const minutes = Number.isFinite(Number(doc.effectiveTransferTimeMinutes))
    ? Number(doc.effectiveTransferTimeMinutes)
    : 9 * 60;

  return {
    id: id(doc),
    reservationId: id(doc.reservationId),
    status,
    statusLabel: tenantTransferStatusLabel(status),
    effectiveTransferDate: doc.effectiveTransferDate || null,
    effectiveTransferTimeMinutes: minutes,
    effectiveTransferTimeLabel: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
    destinationRoom: safeRoom(destinationRoom),
    settlement: {
      required: canonical.transferBalance?.hasBill === true,
      status: canonical.transferBalance?.paymentState || "none",
      amountDue: Number(canonical.transferBalance?.amountDue || 0),
      amountPaid: Number(canonical.transferBalance?.amountPaid || 0),
      remaining: Number(canonical.transferBalance?.remaining || 0),
      billId: canonical.transferBalance?.billId || null,
    },
    actionRequiredReason: canonical.actionRequiredReason || null,
    tenantGuidance: status === "awaiting_settlement"
      ? "A room-transfer settlement is still due. Open Billing to review and settle the balance before the transfer can complete."
      : status === "ready_for_transfer"
        ? "Your transfer is ready. Lilycrest Administration will complete the room change."
        : status === "action_required"
          ? (canonical.actionRequiredMessage || "Lilycrest Administration needs to review this transfer before it can complete.")
          : status === "scheduled"
            ? "Your current room remains active until Lilycrest completes the scheduled transfer."
            : status === "completed"
              ? "The room transfer has been completed."
              : status === "cancelled"
                ? "This scheduled room transfer was cancelled."
                : "",
    utilitiesNote: canonical.utilitiesNote,
    addendum: canonical.addendum,
    scheduledAt: doc.scheduledAt || doc.createdAt || null,
    completedAt: doc.executedAt || null,
    cancelledAt: doc.cancelledAt || null,
  };
}

export async function serializeTenantTransferRequest(
  request,
  { scheduledTransfer = null, admin = false } = {},
) {
  if (!request) return null;
  const doc = typeof request.toObject === "function" ? request.toObject() : request;
  const effectiveStatus = deriveTenantTransferStatus(doc, scheduledTransfer);
  const preferredRoom = doc.preferredRoomId && typeof doc.preferredRoomId === "object"
    ? doc.preferredRoomId
    : doc.preferredRoomId
      ? await Room.findById(doc.preferredRoomId).select("name roomNumber type branch").lean()
      : null;
  const serialized = {
    id: id(doc),
    reservationId: id(doc.reservationId),
    stayId: id(doc.stayId),
    status: effectiveStatus,
    statusLabel: tenantTransferStatusLabel(effectiveStatus),
    preferredRoomType: doc.preferredRoomType,
    preferredRoom: safeRoom(preferredRoom),
    preferredTransferDate: doc.preferredTransferDate || null,
    reason: doc.reason || "",
    note: doc.note || "",
    submittedAt: doc.submittedAt || doc.createdAt || null,
    declineReason: doc.declineReason || null,
    canCancel: doc.status === "pending" && !scheduledTransfer && !doc.scheduledRoomTransferId,
    canReview: admin
      ? doc.status === "pending" && !scheduledTransfer && !doc.scheduledRoomTransferId
      : undefined,
    scheduledRoomTransferId: id(doc.scheduledRoomTransferId),
  };

  if (admin) {
    const tenant = doc.tenantId && typeof doc.tenantId === "object"
      ? doc.tenantId
      : await User.findById(doc.tenantId)
          .select("firstName lastName name fullName email")
          .lean();
    serialized.tenant = tenant
      ? { id: id(tenant), name: tenantName(tenant), email: tenant.email || "" }
      : null;
    serialized.currentRoom = doc.currentRoomSnapshot || null;
    serialized.currentBed = doc.currentBedSnapshot || null;
    serialized.reviewedBy = id(doc.reviewedBy);
    serialized.reviewedAt = doc.reviewedAt || null;
  }

  return serialized;
}

export async function getTenantRoomTransferPreferences(tenantId) {
  const stay = await resolveCurrentStayForTenant(tenantId).lean();
  if (!stay) {
    throw serviceError(
      "A valid active stay is required to view room preferences.",
      "ACTIVE_STAY_REQUIRED",
      409,
    );
  }
  const rooms = await Room.find({
    branch: stay.branch,
    _id: { $ne: stay.roomId },
    isArchived: { $ne: true },
  })
    .select("_id name roomNumber type branch")
    .sort({ roomNumber: 1, name: 1 })
    .lean();
  return rooms.map((room) => ({
    roomId: String(room._id),
    roomNumber: room.roomNumber || "",
    name: room.name || room.roomNumber || "",
    roomType: room.type || "",
    branch: room.branch || stay.branch,
    // A tenant is expressing a preference only. Live availability and any
    // destination hold remain exclusively in the Admin scheduling workflow.
    preferenceSelectable: true,
  }));
}

export async function getTenantTransferLifecycle(tenantId) {
  const { request, scheduledTransfer } = await resolveTenantTransferLifecycleRecords({ tenantId });

  if (!request && !scheduledTransfer) {
    return { status: null, statusLabel: "", request: null, scheduledRoomTransfer: null };
  }

  const tenantScheduledTransfer = await serializeTenantScheduledTransfer(scheduledTransfer);
  const status = tenantScheduledTransfer?.status || deriveTenantTransferStatus(request, scheduledTransfer);
  const linkedLifecycleSchedule = request && scheduledTransfer &&
    id(request.reservationId) === id(scheduledTransfer.reservationId)
    ? scheduledTransfer
    : null;
  return {
    status,
    statusLabel: tenantTransferStatusLabel(status),
    request: request
      ? await serializeTenantTransferRequest(request, { scheduledTransfer: linkedLifecycleSchedule })
      : null,
    scheduledRoomTransfer: tenantScheduledTransfer,
  };
}

export async function createTenantTransferRequest({ tenantId, payload = {} }) {
  const user = await User.findById(tenantId)
    .select("firstName lastName name fullName email role tenantStatus branch")
    .lean();
  if (!user || user.role !== "tenant" || user.tenantStatus !== "active") {
    throw serviceError(
      "Only active tenants may request a room transfer.",
      "ACTIVE_TENANT_REQUIRED",
      403,
    );
  }

  const preferredRoomType = cleanText(payload.preferredRoomType, 50).toLowerCase();
  if (!ROOM_TYPES.has(preferredRoomType)) {
    throw serviceError("Please select a valid preferred room type.", "INVALID_ROOM_TYPE");
  }
  const reason = cleanText(payload.reason, 500);
  if (!reason) {
    throw serviceError("Reason is required.", "REASON_REQUIRED");
  }

  const stay = await resolveCurrentStayForTenant(tenantId);
  if (!stay) {
    throw serviceError(
      "A valid active stay is required to request a room transfer.",
      "ACTIVE_STAY_REQUIRED",
      409,
    );
  }
  const [reservation, room] = await Promise.all([
    Reservation.findOne({ _id: stay.reservationId, userId: tenantId, isArchived: { $ne: true } }).lean(),
    Room.findById(stay.roomId).lean(),
  ]);
  if (!reservation || !room) {
    throw serviceError("Current stay details are unavailable.", "CURRENT_STAY_INVALID", 409);
  }
  if (!hasReservationStatus(reservation.status, "moveIn")) {
    throw serviceError(
      "Only active moved-in tenants may request a room transfer.",
      "INVALID_STATUS_FOR_TRANSFER",
      409,
    );
  }

  if (reservation.pendingExtensionRequestId) throw serviceError('Resolve the pending stay extension first.', 'EXTENSION_PENDING', 409);
  const preferredTransferDate = normalizePreferredDate(payload.preferredTransferDate);
  const [{ request: existingRequest, scheduledTransfer: existingSchedule }, moveOut, termination, predecessorContract] = await Promise.all([
    resolveTenantTransferLifecycleRecords({ tenantId }),
    MoveOutClearance.exists({ reservationId: reservation._id }),
    TerminationReview.exists({
      reservationId: reservation._id,
      $or: [
        { status: { $in: ["open", "under_review", "pending_response"] } },
        { executionStatus: "pending_execution" },
      ],
    }),
    resolveAuthoritativeCurrentContract({ reservationId: reservation._id, tenantId }),
  ]);
  if (existingSchedule && isOpenSchedule(existingSchedule)) {
    throw serviceError(
      "A room transfer is already scheduled for this tenancy.",
      "SCHEDULED_TRANSFER_ALREADY_EXISTS",
      409,
    );
  }
  if (existingRequest && OPEN_REQUEST_STATUSES.includes(existingRequest.status)) {
    throw serviceError(
      "You already have an open room transfer request.",
      "OPEN_TRANSFER_REQUEST_EXISTS",
      409,
    );
  }
  if (moveOut) {
    throw serviceError(
      "Room transfer is unavailable because move-out clearance has started.",
      "ROOM_TRANSFER_MOVE_OUT_CONFLICT",
      409,
    );
  }
  if (termination) {
    throw serviceError(
      "Room transfer is unavailable during an active termination review.",
      "ROOM_TRANSFER_TERMINATION_CONFLICT",
      409,
    );
  }
  if (!isValidTransferPredecessor(predecessorContract)) {
    throw serviceError(
      "Your current lease Contract is not eligible for a room transfer.",
      "ROOM_TRANSFER_PREDECESSOR_NOT_ACTIVE",
      409,
    );
  }
  const leaseEnd = stay.leaseEndDate || predecessorContract?.leaseEndDate || null;
  if (
    preferredTransferDate &&
    leaseEnd &&
    toManilaStartOfDay(preferredTransferDate).isAfter(toManilaStartOfDay(leaseEnd), "day")
  ) {
    throw serviceError(
      "Preferred transfer date cannot be after your current lease end date.",
      "PREFERRED_TRANSFER_DATE_AFTER_LEASE_END",
      409,
    );
  }

  let preferredRoom = null;
  if (payload.preferredRoomId) {
    if (!mongoose.isValidObjectId(payload.preferredRoomId)) {
      throw serviceError("Preferred room is invalid.", "INVALID_PREFERRED_ROOM");
    }
    if (String(payload.preferredRoomId) === String(stay.roomId)) {
      throw serviceError(
        "Preferred room must be different from your current room.",
        "PREFERRED_ROOM_IS_CURRENT_ROOM",
      );
    }
    preferredRoom = await Room.findOne({
      _id: payload.preferredRoomId,
      branch: stay.branch,
      isArchived: { $ne: true },
    }).lean();
    if (!preferredRoom) {
      throw serviceError("Preferred room is unavailable for this branch.", "INVALID_PREFERRED_ROOM");
    }
    if (preferredRoom.type !== preferredRoomType) {
      throw serviceError(
        "Preferred room does not match the selected room type.",
        "PREFERRED_ROOM_TYPE_MISMATCH",
      );
    }
  }

  const bed = (room.beds || []).find(
    (entry) => String(entry.id || entry._id) === String(stay.bedId),
  );
  const requestPayload = {
    tenantId,
    reservationId: stay.reservationId,
    stayId: stay._id,
    branch: stay.branch,
    currentRoomSnapshot: {
      roomId: room._id,
      name: room.name || "",
      roomNumber: room.roomNumber || "",
      type: room.type || "",
      branch: room.branch,
    },
    currentBedSnapshot: {
      bedId: stay.bedId || null,
      position: bed?.position || null,
      bunkBlock: stay.bunkBlock || bed?.bunkBlock || null,
      code: stay.bedCode || bed?.code || null,
    },
    preferredRoomType,
    preferredRoomId: preferredRoom?._id || null,
    preferredTransferDate,
    reason,
    note: cleanText(payload.note, 1000),
  };

  let request;
  try {
    request = await TenantTransferRequest.create(requestPayload);
  } catch (error) {
    if (error?.code === 11000) {
      throw serviceError(
        "You already have an open room transfer request.",
        "OPEN_TRANSFER_REQUEST_EXISTS",
        409,
      );
    }
    throw error;
  }

  const requestId = String(request._id);
  await Promise.allSettled([
    notify.roomTransferLifecycleOnce(
      tenantId,
      "Room Transfer Request Received",
      "Your room transfer request was received and is pending Admin review.",
      `tenant_transfer_request_received:${requestId}`,
      { entityId: String(stay.reservationId), event: "received" },
    ),
    notifyBranchAdmins(
      stay.branch,
      "general",
      "New Room Transfer Request",
      `${tenantName(user)} submitted a room transfer request. Review it in the Tenants workspace.`,
      {
        entityType: "reservation",
        entityId: String(stay.reservationId),
        actionUrl: `/admin/tenants?reservationId=${String(stay.reservationId)}&focus=transfer-request`,
        dedupeKey: `tenant_transfer_request_admin:${requestId}`,
      },
    ),
  ]);

  return serializeTenantTransferRequest(request);
}

export async function cancelTenantTransferRequest({ requestId, tenantId }) {
  if (!mongoose.isValidObjectId(requestId)) {
    throw serviceError("Room transfer request not found.", "TRANSFER_REQUEST_NOT_FOUND", 404);
  }
  const request = await TenantTransferRequest.findOneAndUpdate(
    {
      _id: requestId,
      tenantId,
      status: "pending",
      scheduledRoomTransferId: null,
    },
    { $set: { status: "cancelled", cancelledAt: new Date() } },
    { new: true },
  );
  if (!request) {
    const owned = await TenantTransferRequest.findOne({ _id: requestId, tenantId }).lean();
    if (!owned) {
      throw serviceError("Room transfer request not found.", "TRANSFER_REQUEST_NOT_FOUND", 404);
    }
    if (owned.status !== "scheduled" && !owned.scheduledRoomTransferId) {
      throw serviceError(
        "Only a pending room transfer request can be cancelled.",
        "TRANSFER_REQUEST_NOT_PENDING",
        409,
      );
    }
    throw serviceError(
      "Please coordinate with the Administration Office for changes to a scheduled room transfer.",
      "SCHEDULED_TRANSFER_CANNOT_BE_TENANT_CANCELLED",
      409,
    );
  }
  await Promise.allSettled([
    notify.roomTransferLifecycleOnce(
      tenantId,
      "Room Transfer Request Cancelled",
      "Your pending room transfer request has been cancelled.",
      `tenant_transfer_request_cancelled:${String(request._id)}`,
      { entityId: String(request.reservationId), event: "cancelled" },
    ),
    notifyBranchAdmins(
      request.branch,
      "general",
      "Room Transfer Request Cancelled",
      "A tenant cancelled a pending room transfer request.",
      {
        entityType: "reservation",
        entityId: String(request.reservationId),
        actionUrl: `/admin/tenants?reservationId=${String(request.reservationId)}`,
        dedupeKey: `tenant_transfer_request_cancelled_admin:${String(request._id)}`,
      },
    ),
  ]);
  return serializeTenantTransferRequest(request);
}

export async function claimTenantTransferRequestForScheduling({
  requestId,
  reservationId,
  actorId = null,
}) {
  if (!mongoose.isValidObjectId(requestId)) {
    throw serviceError("Room transfer request not found.", "TRANSFER_REQUEST_NOT_FOUND", 404);
  }

  // A prior worker may have committed the operational schedule and died before
  // reflecting it on the intent row, or may have died before scheduling at all.
  // Resolve that state before attempting a new compare-and-set claim.
  const existing = await TenantTransferRequest.findById(requestId)
    .select("+schedulingToken");
  if (!existing || id(existing.reservationId) !== id(reservationId)) {
    throw serviceError("Room transfer request not found.", "TRANSFER_REQUEST_NOT_FOUND", 404);
  }
  const schedules = await ScheduledRoomTransfer.find({
    reservationId,
    isArchived: { $ne: true },
  }).sort({ scheduledAt: -1, createdAt: -1 });
  await reconcileRequestRecord(
    existing,
    selectCanonicalTenantTransferLifecycle({ request: existing, scheduledTransfers: schedules }).scheduledTransfer,
  );

  const token = randomUUID();
  const claimed = await TenantTransferRequest.findOneAndUpdate(
    {
      _id: requestId,
      reservationId,
      status: "pending",
      scheduledRoomTransferId: null,
    },
    {
      $set: {
        status: "scheduling",
        schedulingToken: token,
        schedulingStartedAt: new Date(),
        schedulingHeartbeatAt: new Date(),
        reviewedBy: actorId || null,
        reviewedAt: new Date(),
      },
    },
    { new: true },
  ).select("+schedulingToken");
  if (!claimed) {
    const current = await TenantTransferRequest.findById(requestId).lean();
    if (current?.status === "scheduled" || current?.scheduledRoomTransferId) {
      throw serviceError(
        "This request already has an operational room transfer.",
        "TRANSFER_REQUEST_ALREADY_SCHEDULED",
        409,
      );
    }
    throw serviceError(
      "This request is no longer pending or is already being scheduled.",
      "TRANSFER_REQUEST_NOT_PENDING",
      409,
    );
  }
  return { request: claimed, token };
}

export async function refreshTenantTransferSchedulingClaim({
  requestId,
  reservationId,
  schedulingToken,
}) {
  if (!requestId || !schedulingToken) return false;
  const result = await TenantTransferRequest.updateOne(
    { _id: requestId, reservationId, status: "scheduling", schedulingToken },
    { $set: { schedulingHeartbeatAt: new Date() } },
  );
  return result.modifiedCount === 1 || result.matchedCount === 1;
}

export async function releaseTenantTransferSchedulingClaim({
  requestId,
  reservationId,
  schedulingToken,
}) {
  if (!requestId || !schedulingToken) return null;
  const operational = await ScheduledRoomTransfer.findOne({
    reservationId,
    status: { $in: [...OPEN_SCHEDULED_ROOM_TRANSFER_STATUSES] },
    isArchived: { $ne: true },
  }).sort({ scheduledAt: -1, createdAt: -1 });
  if (operational) {
    return linkScheduledTransferToRequest({
      reservationId,
      scheduledTransfer: operational,
      requestId,
      schedulingToken,
    });
  }
  return TenantTransferRequest.findOneAndUpdate(
    { _id: requestId, reservationId, status: "scheduling", schedulingToken },
    {
      $set: {
        status: "pending",
        schedulingToken: null,
        schedulingStartedAt: null,
        schedulingHeartbeatAt: null,
      },
    },
    { new: true },
  );
}

export async function getAdminTransferLifecycleForReservation(reservationId) {
  if (TenantTransferRequest.db?.readyState === 0) {
    return { request: null, scheduledTransfer: null };
  }
  const records = await resolveTenantTransferLifecycleRecords({ reservationId });
  return {
    request: records.request
      ? await serializeTenantTransferRequest(records.request, {
          scheduledTransfer: records.scheduledTransfer,
          admin: true,
        })
      : null,
    scheduledTransfer: isOpenSchedule(records.scheduledTransfer)
      ? records.scheduledTransfer
      : null,
  };
}

export async function getAdminTransferRequestForReservation(reservationId) {
  const lifecycle = await getAdminTransferLifecycleForReservation(reservationId);
  return lifecycle.request;
}

export async function declineTenantTransferRequest({
  requestId,
  actorId,
  actorRole = "",
  actorBranch = "",
  declineReason = "",
}) {
  if (!mongoose.isValidObjectId(requestId)) {
    throw serviceError("Room transfer request not found.", "TRANSFER_REQUEST_NOT_FOUND", 404);
  }
  const branchScope = actorRole === "branch_admin" ? { branch: actorBranch } : {};
  const request = await TenantTransferRequest.findOneAndUpdate(
    { _id: requestId, status: "pending", scheduledRoomTransferId: null, ...branchScope },
    {
      $set: {
        status: "declined",
        reviewedBy: actorId || null,
        reviewedAt: new Date(),
        declineReason: cleanText(declineReason, 1000),
      },
    },
    { new: true },
  );
  if (!request) {
    if (actorRole === "branch_admin") {
      throw serviceError(
        "Room transfer request not found for your branch.",
        "TRANSFER_REQUEST_NOT_FOUND",
        404,
      );
    }
    throw serviceError(
      "Only a pending, unscheduled request can be declined.",
      "TRANSFER_REQUEST_NOT_PENDING",
      409,
    );
  }
  const reasonText = request.declineReason ? ` Reason: ${request.declineReason}` : "";
  await notify.roomTransferLifecycleOnce(
    request.tenantId,
    "Room Transfer Request Declined",
    `Your room transfer request was declined.${reasonText}`,
    `tenant_transfer_request_declined:${String(request._id)}`,
    { entityId: String(request.reservationId), event: "declined" },
  );
  return serializeTenantTransferRequest(request, { admin: true });
}

export async function linkScheduledTransferToRequest({
  reservationId,
  scheduledTransfer,
  requestId = null,
  actorId = null,
  schedulingToken = null,
}) {
  const scheduledId = String(scheduledTransfer._id);
  const scheduledTenantId = scheduledTransfer.tenantId || null;
  if (scheduledTenantId) {
    await notify.roomTransferLifecycleOnce(
      scheduledTenantId,
      "Room Transfer Scheduled",
      "Your room transfer has been scheduled. Open My Stays to view the confirmed date and time.",
      `room_transfer_scheduled:${scheduledId}`,
      { entityId: String(reservationId), event: "scheduled" },
    );
  }
  let request = null;
  if (requestId) {
    request = await TenantTransferRequest.findOneAndUpdate(
      {
        _id: requestId,
        reservationId,
        status: "scheduling",
        schedulingToken,
        scheduledRoomTransferId: null,
      },
      {
        $set: {
          status: "scheduled",
          scheduledRoomTransferId: scheduledTransfer._id,
          schedulingToken: null,
          schedulingStartedAt: null,
          schedulingHeartbeatAt: null,
          reviewedBy: actorId || null,
          reviewedAt: new Date(),
        },
      },
      { new: true },
    );
    if (!request) {
      const repaired = await syncRequestFromScheduledTransfer(scheduledTransfer);
      if (!repaired || id(repaired) !== id(requestId)) {
        throw serviceError(
          "The operational transfer was created, but its request link needs reconciliation.",
          "TRANSFER_REQUEST_LINK_RECONCILIATION_REQUIRED",
          409,
        );
      }
      request = repaired;
    }
  }

  if (!scheduledTenantId && request?.tenantId) {
    await notify.roomTransferLifecycleOnce(
      request.tenantId,
      "Room Transfer Scheduled",
      "Your room transfer has been scheduled. Open My Stays to view the confirmed date and time.",
      `room_transfer_scheduled:${scheduledId}`,
      { entityId: String(reservationId), event: "scheduled" },
    );
  }
  return request;
}

export async function syncRequestFromScheduledTransfer(
  scheduledTransfer,
  { event = null } = {},
) {
  if (!scheduledTransfer) return null;
  const record = typeof scheduledTransfer.toObject === "function"
    ? scheduledTransfer.toObject()
    : scheduledTransfer;
  const nextStatus = record.status === "executed"
    ? "completed"
    : record.status === "cancelled"
      ? "cancelled"
      : "scheduled";
  const update = {
    status: nextStatus,
    scheduledRoomTransferId: record._id,
    schedulingToken: null,
    schedulingStartedAt: null,
    schedulingHeartbeatAt: null,
    ...(nextStatus === "completed" ? { completedAt: record.executedAt || new Date() } : {}),
    ...(nextStatus === "cancelled" ? { cancelledAt: record.cancelledAt || new Date() } : {}),
  };
  const request = await TenantTransferRequest.findOneAndUpdate(
    {
      $or: [
        { scheduledRoomTransferId: record._id },
        {
          reservationId: record.reservationId,
          status: { $in: OPEN_REQUEST_STATUSES },
          submittedAt: { $lte: record.scheduledAt || record.createdAt || new Date() },
        },
      ],
    },
    { $set: update },
    { new: true, sort: { submittedAt: -1 } },
  );

  const tenantId = record.tenantId || request?.tenantId;
  if (!tenantId) return request;
  const scheduledId = String(record._id);
  if (event === "rescheduled") {
    const historySize = Array.isArray(record.scheduleHistory) ? record.scheduleHistory.length : 0;
    await notify.roomTransferLifecycleOnce(
      tenantId,
      "Room Transfer Rescheduled",
      "Your room transfer schedule was updated. Open My Stays to view the new date and time.",
      `room_transfer_rescheduled:${scheduledId}:${historySize}`,
      { entityId: String(record.reservationId), event: "rescheduled" },
    );
  } else if (nextStatus === "completed") {
    await notify.roomTransferLifecycleOnce(
      tenantId,
      "Room Transfer Completed",
      "Your room transfer is complete. Your current room and Contract information have been refreshed.",
      `room_transfer_completed:${scheduledId}`,
      { entityId: String(record.reservationId), event: "completed", pushType: "transfer_complete" },
    );
  }
  return request;
}
