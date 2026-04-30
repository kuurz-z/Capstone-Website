/**
 * ============================================================================
 * MAINTENANCE REQUEST CONTROLLER
 * ============================================================================
 *
 * Contract-aligned maintenance controllers for tenant and admin workflows.
 * Canonical routes live under /api/m/maintenance/* and are temporarily aliased
 * under /api/maintenance/* for compatibility.
 *
 * ============================================================================
 */

import mongoose from "mongoose";
import {
    ADMIN_MAINTENANCE_STATUSES,
    MAINTENANCE_REQUEST_TYPES,
    MAINTENANCE_URGENCY_LEVELS,
    MIN_MAINTENANCE_DESCRIPTION_LENGTH,
    OPEN_MAINTENANCE_STATUSES,
    REOPENABLE_MAINTENANCE_STATUSES,
    canAdminTransitionMaintenanceStatus,
    formatMaintenanceTypeLabel,
    getResolutionEstimate,
    isAdminMutableMaintenanceStatus,
    isValidMaintenanceStatus,
    normalizeMaintenanceStatus,
    normalizeMaintenanceType,
    normalizeMaintenanceUrgency,
} from "../config/maintenance.js";
import {
    AppError,
    sendSuccess,
} from "../middleware/errorHandler.js";
import { MaintenanceRequest, Reservation, User } from "../models/index.js";
import {
    CURRENT_RESIDENT_STATUS_QUERY,
} from "../utils/lifecycleNaming.js";
import { buildLegacyDescription } from "../utils/maintenanceMigration.js";
import { notify } from "../utils/notificationService.js";
import { clean } from "../utils/sanitize.js";
import { DELETED_ACCOUNT_LABEL } from "../utils/userReference.js";

const USER_SELECT_FIELDS =
  "user_id firstName lastName email phone branch role";

const MAINTENANCE_LIMIT_MAX = 200;
const SLA_TARGET_HOURS = Object.freeze({
  low: 120,
  normal: 48,
  high: 24,
});
const DUPLICATE_REQUEST_WINDOW_HOURS = 12;
const CLOSED_MAINTENANCE_STATUSES = new Set([
  "resolved",
  "completed",
  "rejected",
  "cancelled",
  "closed",
]);

const parseLimit = (value, fallback = 100) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, MAINTENANCE_LIMIT_MAX);
};

const toOptionalText = (value) => {
  if (value == null) return null;
  const sanitized = clean(String(value)).trim();
  return sanitized ? sanitized : null;
};

const buildActorSnapshot = (user) => ({
  actor_id: user?.user_id || null,
  actor_name:
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    user?.email ||
    user?.user_id ||
    null,
  actor_role: user?.role || null,
});

const appendStatusHistory = (request, event) => {
  request.statusHistory = [
    ...(Array.isArray(request.statusHistory) ? request.statusHistory : []),
    event,
  ];
};

const appendWorkLogEntry = (request, entry) => {
  request.work_log = [
    ...(Array.isArray(request.work_log) ? request.work_log : []),
    entry,
  ];
};

const getSlaState = (request) => {
  const urgency = normalizeMaintenanceUrgency(request?.urgency) || "normal";
  const baseTimestamp = request?.reopened_at || request?.created_at;
  const targetHours = SLA_TARGET_HOURS[urgency] || SLA_TARGET_HOURS.normal;
  const targetAt = baseTimestamp
    ? new Date(new Date(baseTimestamp).getTime() + targetHours * 60 * 60 * 1000)
    : null;
  const isClosed = CLOSED_MAINTENANCE_STATUSES.has(
    normalizeMaintenanceStatus(request?.status),
  );
  const isDelayed =
    Boolean(targetAt) && !isClosed && Date.now() > targetAt.getTime();
  let label = "on_track";
  if (isClosed) {
    label = "closed";
  } else if (isDelayed) {
    label = "delayed";
  } else if (urgency === "high") {
    label = "priority";
  }

  return {
    targetHours,
    targetAt,
    isDelayed,
    isHighPriorityUnresolved: urgency === "high" && !isClosed,
    label,
  };
};

const normalizeAttachments = (attachments) => {
  if (!Array.isArray(attachments)) return [];

  return attachments
    .map((entry) => ({
      name: toOptionalText(entry?.name),
      uri: toOptionalText(entry?.uri),
      type: toOptionalText(entry?.type),
    }))
    .filter((entry) => entry.name && entry.uri && entry.type);
};

const buildRequestIdentifierQuery = (requestId) => {
  const identifier = String(requestId || "").trim();
  if (!identifier) {
    return { request_id: "__missing__" };
  }

  if (mongoose.Types.ObjectId.isValid(identifier)) {
    return {
      $or: [
        { request_id: identifier },
        { _id: identifier },
      ],
    };
  }

  return { request_id: identifier };
};

const getDbUser = async (firebaseUid) => {
  const user = await User.findOne({ firebaseUid }).select(USER_SELECT_FIELDS).lean();
  if (!user) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }
  return user;
};

const ensureTenantAccess = (request, dbUser) => {
  if (request.user_id !== dbUser.user_id) {
    throw new AppError("Access denied", 403, "FORBIDDEN");
  }
};

const ensureAdminAccess = (request, req) => {
  if (req.isOwner) return;

  if (!req.branchFilter || request.branch !== req.branchFilter) {
    throw new AppError("Access denied", 403, "FORBIDDEN");
  }
};

const serializeTenantSummary = (user, request) => {
  if (!user) {
    return {
      user_id: request.user_id,
      full_name: request.user_id ? DELETED_ACCOUNT_LABEL : "Unknown Tenant",
      branch: request.branch || null,
      email: null,
      phone: null,
    };
  }

  return {
    user_id: user.user_id,
    full_name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Unknown Tenant",
    branch: user.branch || request.branch || null,
    email: user.email || null,
    phone: user.phone || null,
    role: user.role || null,
  };
};

const serializeMaintenanceRequest = (request, tenant = null) => ({
  id: request.request_id,
  _id: request._id,
  request_id: request.request_id,
  user_id: request.user_id,
  request_type: request.request_type,
  description: request.description,
  urgency: request.urgency,
  status: request.status,
  assigned_to: request.assigned_to ?? null,
  notes: request.notes ?? null,
  attachments: Array.isArray(request.attachments) ? request.attachments : [],
  reopen_note: request.reopen_note ?? null,
  reopen_history: Array.isArray(request.reopen_history) ? request.reopen_history : [],
  statusHistory: Array.isArray(request.statusHistory) ? request.statusHistory : [],
  slaState: getSlaState(request),
  assignment: {
    assignedTo: request.assigned_to ?? null,
    assignedAt: request.assigned_at ?? null,
    startedAt: request.work_started_at ?? null,
    resolvedAt: request.resolved_at ?? null,
  },
  workLog: Array.isArray(request.work_log) ? request.work_log : [],
  resolutionNote: request.resolution_note ?? null,
  created_at: request.created_at,
  updated_at: request.updated_at,
  cancelled_at: request.cancelled_at ?? null,
  reopened_at: request.reopened_at ?? null,
  resolved_at: request.resolved_at ?? null,
  closed_at: request.closed_at ?? null,
  estimated_resolution: getResolutionEstimate(request.urgency),
  tenant,
  branch: request.branch || null,
  roomId: request.roomId || null,
  reservationId: request.reservationId || null,

  // Compatibility aliases for legacy consumers still in the repo.
  title: `${formatMaintenanceTypeLabel(request.request_type)} Request`,
  category: request.request_type,
  date: request.created_at,
  assignedTo: request.assigned_to ?? null,
  completionNote: request.resolution_note ?? request.notes ?? null,
});

const loadTenantMap = async (requests) => {
  const userIds = [...new Set(requests.map((entry) => entry.user_id).filter(Boolean))];
  if (userIds.length === 0) return new Map();

  const users = await User.find({ user_id: { $in: userIds } })
    .select(USER_SELECT_FIELDS)
    .lean();

  return new Map(users.map((user) => [user.user_id, user]));
};

const findAccessibleRequest = async (requestId) => {
  const request = await MaintenanceRequest.findOne(
    buildRequestIdentifierQuery(requestId),
  );

  if (!request || request.isArchived) {
    throw new AppError("Maintenance request not found", 404, "REQUEST_NOT_FOUND");
  }

  return request;
};

const resolveAdminBranchFilter = (req) => {
  const requestedBranch = toOptionalText(req.query.branch);
  if (req.isOwner) {
    return requestedBranch || null;
  }

  return req.branchFilter || null;
};

const ensureMinimumDescriptionLength = (description) =>
  String(description || "").trim().length >= MIN_MAINTENANCE_DESCRIPTION_LENGTH;

const buildAdminDisplayName = (adminUser) =>
  `${adminUser?.firstName || ""} ${adminUser?.lastName || ""}`.trim() ||
  adminUser?.email ||
  adminUser?.user_id ||
  "Admin";

const normalizeAdminUpdatePayload = (payload = {}) => {
  const hasAssignedField = Object.prototype.hasOwnProperty.call(payload, "assigned_to");

  return {
    nextStatus: normalizeMaintenanceStatus(payload.status),
    nextNotes: payload.notes !== undefined ? toOptionalText(payload.notes) : undefined,
    nextAssignedTo: hasAssignedField ? toOptionalText(payload.assigned_to) : undefined,
    hasAssignedField,
    workLogNote: toOptionalText(
      payload.work_log_note !== undefined ? payload.work_log_note : payload.workLogNote,
    ),
  };
};

const applyAdminUpdateToRequest = ({ request, adminUser, payload }) => {
  if (normalizeMaintenanceStatus(request.status) === "closed") {
    throw new AppError(
      "Closed maintenance requests cannot be updated",
      409,
      "REQUEST_CLOSED",
    );
  }

  const {
    nextStatus,
    nextNotes,
    nextAssignedTo,
    hasAssignedField,
    workLogNote,
  } = normalizeAdminUpdatePayload(payload);

  if (hasAssignedField && nextAssignedTo && nextAssignedTo.length < 2) {
    throw new AppError("Assigned staff name is too short", 400, "INVALID_ASSIGNEE");
  }

  if (!nextStatus || !isAdminMutableMaintenanceStatus(nextStatus)) {
    throw new AppError(
      `Status must be one of: ${ADMIN_MAINTENANCE_STATUSES.join(", ")}`,
      400,
      "INVALID_ADMIN_STATUS",
    );
  }

  if (!canAdminTransitionMaintenanceStatus(request.status, nextStatus)) {
    throw new AppError(
      `Invalid maintenance status transition: ${request.status} -> ${nextStatus}`,
      409,
      "INVALID_STATUS_TRANSITION",
    );
  }

  const requiresNotes = [
    "resolved",
    "completed",
    "rejected",
    "waiting_tenant",
    "closed",
  ].includes(nextStatus);
  if (requiresNotes && !nextNotes) {
    throw new AppError(
      "Admin response is required for this status update",
      400,
      "ADMIN_RESPONSE_REQUIRED",
    );
  }

  const statusChanged = request.status !== nextStatus;
  let assignmentChanged =
    hasAssignedField && request.assigned_to !== nextAssignedTo;
  const notesChanged = nextNotes !== undefined && request.notes !== nextNotes;
  const eventTimestamp = new Date();

  request.status = nextStatus;

  // Reset SLA breach notification flag on any status change so the job
  // can re-alert if the request becomes delayed again after being actioned.
  if (statusChanged) {
    request.slaBreachNotified = false;
  }

  if (nextNotes !== undefined) {
    request.notes = nextNotes;
  }
  if (hasAssignedField) {
    request.assigned_to = nextAssignedTo;
    request.assigned_at = nextAssignedTo ? eventTimestamp : null;
  }

  if (statusChanged && nextStatus === "in_progress" && !request.work_started_at) {
    request.work_started_at = eventTimestamp;
  }

  if (statusChanged && ["resolved", "completed", "closed"].includes(nextStatus)) {
    request.resolved_at = eventTimestamp;
    request.resolution_note = nextNotes ?? request.notes ?? null;
    if (nextStatus === "closed") {
      request.closed_at = eventTimestamp;
    }
  }

  if (statusChanged && ["pending", "viewed", "in_progress", "waiting_tenant"].includes(nextStatus)) {
    request.cancelled_at = null;
    request.closed_at = null;
    if (!["resolved", "completed"].includes(nextStatus)) {
      request.resolved_at = null;
      request.resolution_note = null;
    }
  }

  if (statusChanged && nextStatus === "rejected") {
    request.resolved_at = eventTimestamp;
    request.resolution_note = nextNotes ?? request.notes ?? null;
  }

  if (statusChanged && nextStatus === "in_progress" && !request.assigned_to) {
    request.assigned_to = buildAdminDisplayName(adminUser);
    request.assigned_at = eventTimestamp;
    assignmentChanged = true;
  }

  if (statusChanged || assignmentChanged || notesChanged) {
    appendStatusHistory(request, {
      event: statusChanged
        ? "status_changed"
        : assignmentChanged
          ? "assignment_updated"
          : "note_updated",
      status: request.status,
      ...buildActorSnapshot(adminUser),
      note: nextNotes ?? workLogNote ?? null,
      timestamp: eventTimestamp,
    });
  }

  if (workLogNote) {
    appendWorkLogEntry(request, {
      note: workLogNote,
      ...buildActorSnapshot(adminUser),
      logged_at: eventTimestamp,
    });
  }

  return {
    statusChanged,
  };
};

/**
 * GET /api/m/maintenance/me
 * GET /api/maintenance/my-requests (compat)
 */
export const getMyRequests = async (req, res, next) => {
  try {
    const dbUser = await getDbUser(req.user.uid);
    const status = normalizeMaintenanceStatus(req.query.status);
    const limit = parseLimit(req.query.limit, 100);

    const query = {
      user_id: dbUser.user_id,
      isArchived: false,
    };

    if (status) {
      if (!isValidMaintenanceStatus(status)) {
        throw new AppError("Invalid maintenance status filter", 400, "INVALID_STATUS");
      }
      query.status = status;
    }

    const requests = await MaintenanceRequest.find(query)
      .sort({ created_at: -1 })
      .limit(limit)
      .lean();

    sendSuccess(res, {
      count: requests.length,
      requests: requests.map((request) =>
        serializeMaintenanceRequest(request, serializeTenantSummary(dbUser, request)),
      ),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/m/maintenance/admin/all
 * GET /api/maintenance/branch (compat)
 */
export const getAdminAll = async (req, res, next) => {
  try {
    const query = { isArchived: false };
    const limit = parseLimit(req.query.limit, MAINTENANCE_LIMIT_MAX);
    const branch = resolveAdminBranchFilter(req);
    const status = normalizeMaintenanceStatus(req.query.status);
    const requestType = normalizeMaintenanceType(
      req.query.request_type || req.query.category,
    );
    const urgency = normalizeMaintenanceUrgency(req.query.urgency);
    const userId = toOptionalText(req.query.user_id);
    const dateFrom = toOptionalText(req.query.date_from);
    const dateTo = toOptionalText(req.query.date_to);

    if (branch) query.branch = branch;
    if (status) {
      if (!isValidMaintenanceStatus(status)) {
        throw new AppError("Invalid maintenance status filter", 400, "INVALID_STATUS");
      }
      query.status = status;
    }
    if (requestType) {
      if (!MAINTENANCE_REQUEST_TYPES.includes(requestType)) {
        throw new AppError("Invalid maintenance request type filter", 400, "INVALID_REQUEST_TYPE");
      }
      query.request_type = requestType;
    }
    if (urgency) {
      if (!MAINTENANCE_URGENCY_LEVELS.includes(urgency)) {
        throw new AppError("Invalid maintenance urgency filter", 400, "INVALID_URGENCY");
      }
      query.urgency = urgency;
    }
    if (userId) query.user_id = userId;
    if (dateFrom || dateTo) {
      query.created_at = {};
      if (dateFrom) {
        const parsedFrom = new Date(dateFrom);
        if (Number.isNaN(parsedFrom.getTime())) {
          throw new AppError("Invalid date_from value", 400, "INVALID_DATE_RANGE");
        }
        query.created_at.$gte = parsedFrom;
      }
      if (dateTo) {
        const parsedTo = new Date(dateTo);
        if (Number.isNaN(parsedTo.getTime())) {
          throw new AppError("Invalid date_to value", 400, "INVALID_DATE_RANGE");
        }
        parsedTo.setHours(23, 59, 59, 999);
        query.created_at.$lte = parsedTo;
      }
    }

    const requests = await MaintenanceRequest.find(query)
      .sort({ created_at: -1 })
      .limit(limit)
      .lean();
    const tenantMap = await loadTenantMap(requests);

    sendSuccess(res, {
      count: requests.length,
      requests: requests.map((request) =>
        serializeMaintenanceRequest(
          request,
          serializeTenantSummary(tenantMap.get(request.user_id), request),
        ),
      ),
    });
  } catch (error) {
    next(error);
  }
};

const buildMaintenanceDocument = ({
  dbUser,
  reservation,
  requestType,
  description,
  urgency,
  attachments,
}) =>
  new MaintenanceRequest({
    user_id: dbUser.user_id,
    userId: dbUser._id,
    branch: reservation.branch,
    request_type: requestType,
    description,
    urgency,
    attachments,
    reservationId: reservation._id,
    roomId: reservation.roomId || null,
    statusHistory: [
      {
        event: "submitted",
        status: "pending",
        ...buildActorSnapshot(dbUser),
        note: null,
        timestamp: new Date(),
      },
    ],
  });

/**
 * POST /api/m/maintenance
 * POST /api/maintenance/requests (compat)
 */
export const createRequest = async (req, res, next) => {
  try {
    const dbUser = await User.findOne({ firebaseUid: req.user.uid })
      .select("_id user_id role branch firstName lastName email phone")
      .lean();

    if (!dbUser) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }

    const requestType = normalizeMaintenanceType(req.body.request_type);
    const description = toOptionalText(req.body.description);
    const urgency = normalizeMaintenanceUrgency(req.body.urgency || "normal") || "normal";
    const attachments = normalizeAttachments(req.body.attachments);

    if (!requestType || !MAINTENANCE_REQUEST_TYPES.includes(requestType)) {
      throw new AppError("Invalid maintenance request type", 400, "INVALID_REQUEST_TYPE");
    }
    if (!description) {
      throw new AppError("Description is required", 400, "MISSING_DESCRIPTION");
    }
    if (!ensureMinimumDescriptionLength(description)) {
      throw new AppError(
        `Description must be at least ${MIN_MAINTENANCE_DESCRIPTION_LENGTH} characters`,
        400,
        "DESCRIPTION_TOO_SHORT",
      );
    }
    if (!MAINTENANCE_URGENCY_LEVELS.includes(urgency)) {
      throw new AppError("Invalid maintenance urgency", 400, "INVALID_URGENCY");
    }

    const duplicateCutoff = new Date(
      Date.now() - DUPLICATE_REQUEST_WINDOW_HOURS * 60 * 60 * 1000,
    );
    const existingRequest = await MaintenanceRequest.findOne({
      user_id: dbUser.user_id,
      request_type: requestType,
      description,
      status: { $in: OPEN_MAINTENANCE_STATUSES },
      created_at: { $gte: duplicateCutoff },
      isArchived: false,
    })
      .sort({ created_at: -1 })
      .lean();

    if (existingRequest) {
      return res.status(409).json({
        error: "A similar maintenance request is already open.",
        code: "DUPLICATE_REQUEST",
        request: serializeMaintenanceRequest(
          existingRequest,
          serializeTenantSummary(dbUser, existingRequest),
        ),
      });
    }

    const reservation = await Reservation.findOne({
      userId: dbUser._id,
      status: { $in: CURRENT_RESIDENT_STATUS_QUERY },
      isArchived: { $ne: true },
    })
      .select("_id branch roomId")
      .lean();

    if (!reservation) {
      throw new AppError("No active stay found", 404, "NO_ACTIVE_STAY");
    }

    const request = buildMaintenanceDocument({
      dbUser,
      reservation,
      requestType,
      description,
      urgency,
      attachments,
    });

    await request.save();

    sendSuccess(
      res,
      {
        request: serializeMaintenanceRequest(
          request.toObject(),
          serializeTenantSummary(dbUser, request),
        ),
      },
      201,
    );
  } catch (error) {
    next(error);
  }
};

export const createRequestCompat = async (req, res, next) => {
  req.body = {
    request_type: normalizeMaintenanceType(req.body.category || "other"),
    description: buildLegacyDescription(req.body.title, req.body.description),
    urgency: normalizeMaintenanceUrgency(req.body.urgency || "normal") || "normal",
    attachments: req.body.attachments,
  };
  return createRequest(req, res, next);
};

/**
 * GET /api/m/maintenance/:requestId
 * GET /api/maintenance/requests/:requestId (compat)
 */
export const getRequestById = async (req, res, next) => {
  try {
    const dbUser = await getDbUser(req.user.uid);
    const request = await findAccessibleRequest(req.params.requestId);

    if (dbUser.role === "owner" || dbUser.role === "branch_admin") {
      if (dbUser.role !== "owner" && request.branch !== dbUser.branch) {
        throw new AppError("Access denied", 403, "FORBIDDEN");
      }
    } else {
      ensureTenantAccess(request, dbUser);
    }

    const tenantUser =
      request.user_id === dbUser.user_id
        ? dbUser
        : await User.findOne({ user_id: request.user_id }).select(USER_SELECT_FIELDS).lean();

    sendSuccess(res, {
      request: serializeMaintenanceRequest(
        request.toObject(),
        serializeTenantSummary(tenantUser, request),
      ),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/m/maintenance/:requestId
 */
export const updateMyRequest = async (req, res, next) => {
  try {
    const dbUser = await getDbUser(req.user.uid);
    const request = await findAccessibleRequest(req.params.requestId);
    ensureTenantAccess(request, dbUser);

    if (request.status !== "pending") {
      throw new AppError(
        "Only pending maintenance requests can be edited",
        409,
        "REQUEST_NOT_EDITABLE",
      );
    }

    const requestType =
      req.body.request_type !== undefined
        ? normalizeMaintenanceType(req.body.request_type)
        : request.request_type;
    const description =
      req.body.description !== undefined
        ? toOptionalText(req.body.description)
        : request.description;
    const urgency =
      req.body.urgency !== undefined
        ? normalizeMaintenanceUrgency(req.body.urgency)
        : request.urgency;

    if (!requestType || !MAINTENANCE_REQUEST_TYPES.includes(requestType)) {
      throw new AppError("Invalid maintenance request type", 400, "INVALID_REQUEST_TYPE");
    }
    if (!description) {
      throw new AppError("Description is required", 400, "MISSING_DESCRIPTION");
    }
    if (!ensureMinimumDescriptionLength(description)) {
      throw new AppError(
        `Description must be at least ${MIN_MAINTENANCE_DESCRIPTION_LENGTH} characters`,
        400,
        "DESCRIPTION_TOO_SHORT",
      );
    }
    if (!urgency || !MAINTENANCE_URGENCY_LEVELS.includes(urgency)) {
      throw new AppError("Invalid maintenance urgency", 400, "INVALID_URGENCY");
    }

    request.request_type = requestType;
    request.description = description;
    request.urgency = urgency;

    if (req.body.attachments !== undefined) {
      request.attachments = normalizeAttachments(req.body.attachments);
    }

    await request.save();

    sendSuccess(res, {
      request: serializeMaintenanceRequest(
        request.toObject(),
        serializeTenantSummary(dbUser, request),
      ),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/m/maintenance/:requestId/cancel
 */
export const cancelMyRequest = async (req, res, next) => {
  try {
    const dbUser = await getDbUser(req.user.uid);
    const request = await findAccessibleRequest(req.params.requestId);
    ensureTenantAccess(request, dbUser);

    if (request.status !== "pending") {
      throw new AppError(
        "Only pending maintenance requests can be cancelled",
        409,
        "REQUEST_NOT_CANCELLABLE",
      );
    }

    request.status = "cancelled";
    request.cancelled_at = new Date();
    appendStatusHistory(request, {
      event: "cancelled",
      status: "cancelled",
      ...buildActorSnapshot(dbUser),
      note: null,
      timestamp: request.cancelled_at,
    });
    await request.save();

    sendSuccess(res, {
      request: serializeMaintenanceRequest(
        request.toObject(),
        serializeTenantSummary(dbUser, request),
      ),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/m/maintenance/:requestId/reopen
 */
export const reopenMyRequest = async (req, res, next) => {
  try {
    const dbUser = await getDbUser(req.user.uid);
    const request = await findAccessibleRequest(req.params.requestId);
    ensureTenantAccess(request, dbUser);

    if (!REOPENABLE_MAINTENANCE_STATUSES.includes(request.status)) {
      throw new AppError(
        "Only resolved or completed maintenance requests can be reopened",
        409,
        "REQUEST_NOT_REOPENABLE",
      );
    }

    const note = toOptionalText(req.body.note || req.body.reopen_note);
    const reopenedAt = new Date();

    request.reopen_note = note;
    request.reopened_at = reopenedAt;
    request.reopen_history = [
      ...(request.reopen_history || []),
      {
        reopened_at: reopenedAt,
        previous_status: request.status,
        note,
      },
    ];
    request.status = "pending";
    request.resolved_at = null;
    request.work_started_at = null;
    request.resolution_note = null;
    appendStatusHistory(request, {
      event: "reopened",
      status: "pending",
      ...buildActorSnapshot(dbUser),
      note,
      timestamp: reopenedAt,
    });

    await request.save();

    sendSuccess(res, {
      request: serializeMaintenanceRequest(
        request.toObject(),
        serializeTenantSummary(dbUser, request),
      ),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/m/maintenance/admin/:requestId/status
 * PATCH /api/maintenance/requests/:requestId (compat)
 */
export const updateAdminRequestStatus = async (req, res, next) => {
  try {
    const request = await findAccessibleRequest(req.params.requestId);
    ensureAdminAccess(request, req);
    const adminUser = await getDbUser(req.user.uid);

    const { statusChanged } = applyAdminUpdateToRequest({
      request,
      adminUser,
      payload: req.body,
    });

    await request.save();

    const tenantUser = await User.findOne({ user_id: request.user_id })
      .select("_id user_id firstName lastName email phone branch role")
      .lean();

    if (statusChanged && tenantUser?._id) {
      await notify.maintenanceUpdated(
        tenantUser._id,
        request.request_type,
        request.status,
        request.request_id,
      );
    }

    sendSuccess(res, {
      request: serializeMaintenanceRequest(
        request.toObject(),
        serializeTenantSummary(tenantUser, request),
      ),
    });
  } catch (error) {
    next(error);
  }
};

export const updateAdminRequestStatusCompat = async (req, res, next) => {
  req.body = {
    status: normalizeMaintenanceStatus(req.body.status),
    notes:
      req.body.notes !== undefined
        ? req.body.notes
        : req.body.completionNote,
    assigned_to:
      req.body.assigned_to !== undefined
        ? req.body.assigned_to
        : req.body.assignedTo,
  };

  return updateAdminRequestStatus(req, res, next);
};

/**
 * PATCH /api/m/maintenance/admin/bulk
 * Bulk update maintenance requests (status, assignment, notes).
 */
export const updateAdminBulkRequests = async (req, res, next) => {
  try {
    const adminUser = await getDbUser(req.user.uid);
    const requestIds = Array.isArray(req.body.requestIds)
      ? req.body.requestIds
      : Array.isArray(req.body.requests)
        ? req.body.requests
        : [];
    const payload = {
      status: req.body.status,
      notes: req.body.notes,
      assigned_to: req.body.assigned_to,
      work_log_note: req.body.work_log_note,
    };

    if (requestIds.length === 0) {
      throw new AppError("No maintenance requests selected", 400, "MISSING_REQUESTS");
    }
    if (requestIds.length > 50) {
      throw new AppError("Bulk updates are limited to 50 requests", 400, "BULK_LIMIT");
    }

    const hasPayload =
      payload.status !== undefined ||
      payload.notes !== undefined ||
      payload.assigned_to !== undefined ||
      payload.work_log_note !== undefined;
    if (!hasPayload) {
      throw new AppError("No update values provided", 400, "MISSING_UPDATE_VALUES");
    }

    const results = {
      updated: [],
      failed: [],
    };

    for (const requestId of requestIds) {
      try {
        const request = await findAccessibleRequest(requestId);
        ensureAdminAccess(request, req);

        const { statusChanged } = applyAdminUpdateToRequest({
          request,
          adminUser,
          payload,
        });

        await request.save();

        if (statusChanged) {
          const tenantUser = await User.findOne({ user_id: request.user_id })
            .select("_id")
            .lean();
          if (tenantUser?._id) {
            await notify.maintenanceUpdated(
              tenantUser._id,
              request.request_type,
              request.status,
              request.request_id,
            );
          }
        }

        results.updated.push(request.request_id);
      } catch (error) {
        results.failed.push({
          requestId,
          error: error?.message || "Update failed",
          code: error?.code || error?.errorCode || "UPDATE_FAILED",
        });
      }
    }

    sendSuccess(res, {
      updatedCount: results.updated.length,
      failedCount: results.failed.length,
      ...results,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/maintenance/stats/completion
 */
export const getCompletionStats = async (req, res, next) => {
  try {
    const branch = resolveAdminBranchFilter(req);
    const days = Math.max(1, Number.parseInt(req.query.days, 10) || 30);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const match = {
      isArchived: false,
      resolved_at: { $gte: startDate },
      status: { $in: ["resolved", "completed"] },
    };
    if (branch) match.branch = branch;

    const stats = await MaintenanceRequest.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$request_type",
          completedCount: { $sum: 1 },
          avgResolutionTimeMs: {
            $avg: { $subtract: ["$resolved_at", "$created_at"] },
          },
        },
      },
      { $sort: { completedCount: -1, _id: 1 } },
    ]);

    sendSuccess(res, {
      branch: branch || "all",
      period: `${days} days`,
      stats,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/maintenance/stats/issue-frequency
 */
export const getIssueFrequency = async (req, res, next) => {
  try {
    const branch = resolveAdminBranchFilter(req);
    const months = Math.max(1, Number.parseInt(req.query.months, 10) || 6);
    const limit = parseLimit(req.query.limit, 12);
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const match = {
      isArchived: false,
      created_at: { $gte: startDate },
    };
    if (branch) match.branch = branch;

    const frequency = await MaintenanceRequest.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            month: {
              $dateToString: { format: "%Y-%m", date: "$created_at" },
            },
            request_type: "$request_type",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.month": 1, "_id.request_type": 1 } },
      { $limit: limit },
    ]);

    sendSuccess(res, {
      branch: branch || "all",
      period: `${months} months`,
      frequency,
    });
  } catch (error) {
    next(error);
  }
};

export const getByBranch = getAdminAll;
export const getRequest = getRequestById;
export const updateRequest = updateAdminRequestStatusCompat;

export default {
  getMyRequests,
  getAdminAll,
  getByBranch,
  createRequest,
  createRequestCompat,
  getRequest,
  getRequestById,
  updateMyRequest,
  cancelMyRequest,
  reopenMyRequest,
  updateRequest,
  updateAdminRequestStatus,
  updateAdminRequestStatusCompat,
  updateAdminBulkRequests,
  getCompletionStats,
  getIssueFrequency,
};
