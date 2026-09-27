import { supportLifecycleEvents } from '../services/supportLifecycleEvents.js';
import { currentConversation, mutateConversation, persistMessage, reconcileSupport, assertTransition, conflict, createSupportRequest, rateSupportRequest, reopenSupportRequest } from '../services/supportRequestService.js';
import mongoose from "mongoose";
import {
  ChatConversation,
  ChatMessage,
  Contract,
  Reservation,
  User,
} from "../models/index.js";
import { ROOM_BRANCHES } from "../config/branches.js";
import { CURRENT_RESIDENT_STATUS_QUERY } from "../utils/lifecycleNaming.js";
import { notify } from "../utils/notificationService.js";
import { emitToChatAdmins, emitToUser } from "../utils/socket.js";
import { ADMIN_ROLE_VALUES, OWNER_ROLE_VALUES, isOwnerRole } from "../config/roles.js";
import {
  ensureChatTicketId,
  ensureChatTicketIds,
  generateChatTicketId,
} from "../services/chatTicketIdService.js";
import { MAX_SUPPORT_ATTACHMENTS } from "../config/supportAttachments.js";

const MAX_MESSAGE_CHARS = 1000;
const ADMIN_ROLES = new Set(ADMIN_ROLE_VALUES);
const ACTIVE_CONVERSATION_STATUSES = [
  "open",
  "in_review",
  "waiting_tenant",
  "resolved",
];
const VALID_STATUSES = new Set([...ACTIVE_CONVERSATION_STATUSES, "closed"]);
const VALID_CATEGORIES = new Set([
  "billing_concern",
  "maintenance_concern",
  "reservation_concern",
  "payment_concern",
  "general_inquiry",
  "urgent_issue",
]);
const CATEGORY_ALIASES = {
  "billing concern": "billing_concern",
  billing: "billing_concern",
  "maintenance concern": "maintenance_concern",
  maintenance: "maintenance_concern",
  "reservation concern": "reservation_concern",
  reservation: "reservation_concern",
  "payment concern": "payment_concern",
  payment: "payment_concern",
  "general inquiry": "general_inquiry",
  general: "general_inquiry",
  "urgent issue": "urgent_issue",
  urgent: "urgent_issue",
};
const VALID_PRIORITIES = new Set(["normal", "high", "urgent"]);
const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2 };

function createHttpError(message, statusCode = 400, code = "CHAT_ERROR") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function sendError(res, error, fallback = "Failed to process chat request.") {
  const statusCode = error.statusCode || 500;
  const message = statusCode >= 500 ? fallback : error.message;

  if (statusCode >= 500) {
    console.error("Chat controller error:", error);
  }

  return res.status(statusCode).json({
    error: message,
    code: error.code || "CHAT_ERROR",
  });
}

function normalizeMessage(rawMessage, hasAttachments = false) {
  if (rawMessage === undefined || rawMessage === null) {
    if (hasAttachments) return "";
    throw createHttpError("Message cannot be empty.", 400, "EMPTY_MESSAGE");
  }

  if (typeof rawMessage !== "string") {
    if (hasAttachments) return "";
    throw createHttpError("Message cannot be empty.", 400, "EMPTY_MESSAGE");
  }

  const message = rawMessage.replace(/\r\n?/g, "\n").replace(/\t/g, " ").trim();
  if (!message && !hasAttachments) {
    throw createHttpError("Message cannot be empty.", 400, "EMPTY_MESSAGE");
  }

  if (message.length > MAX_MESSAGE_CHARS) {
    throw createHttpError(
      `Message must be ${MAX_MESSAGE_CHARS} characters or fewer.`,
      400,
      "MESSAGE_TOO_LONG",
    );
  }

  return message;
}

async function normalizeAttachments(rawAttachments, conversationId) {
  if (!Array.isArray(rawAttachments) || rawAttachments.length === 0) return [];
  if (rawAttachments.length > MAX_SUPPORT_ATTACHMENTS) {
    throw createHttpError(
      `A message can contain at most ${MAX_SUPPORT_ATTACHMENTS} attachments.`,
      400,
      "TOO_MANY_ATTACHMENTS",
    );
  }

  const ids = rawAttachments.map((att) => att?.attachmentId || att?.id).filter(Boolean);
  if (ids.length !== rawAttachments.length || ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    throw createHttpError("Upload each attachment before sending it.", 400, "INVALID_CHAT_ATTACHMENT");
  }

  const { default: ChatAttachment } = await import("../models/ChatAttachment.js");
  const records = await ChatAttachment.find({
    _id: { $in: ids },
    conversationId: ensureObjectId(conversationId),
  }).lean();
  const byId = new Map(records.map((record) => [String(record._id), record]));
  if (byId.size !== ids.length) {
    throw createHttpError("An attachment does not belong to this conversation.", 403, "ATTACHMENT_ACCESS_DENIED");
  }

  return ids.map((id) => {
    const record = byId.get(String(id));
    const url = `/chat/${conversationId}/attachments/${id}`;
    return {
      attachmentId: record._id,
      url,
      fileUrl: url,
      name: record.originalName,
      fileName: record.originalName,
      type: record.mimeType,
      mimeType: record.mimeType,
      size: record.size,
    };
  });
}

function normalizeCategory(rawCategory, { required = false } = {}) {
  if (rawCategory === undefined || rawCategory === null || rawCategory === "") {
    if (required) {
      throw createHttpError("Category is required.", 400, "CATEGORY_REQUIRED");
    }
    return null;
  }

  const categoryKey = String(rawCategory)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const category = VALID_CATEGORIES.has(categoryKey)
    ? categoryKey
    : CATEGORY_ALIASES[String(rawCategory).trim().toLowerCase()];

  if (!category) {
    throw createHttpError("Category is required.", 400, "CATEGORY_REQUIRED");
  }

  return category;
}

const VALID_CONTEXT_ENTITY_TYPES = new Set(["contract"]);

// Never trusts a client-supplied context at face value — a tenant could
// otherwise attach any contractId to a conversation and have Admin see it
// as "their" contract concern. Ownership is verified server-side against
// the authenticated tenant before the reference is ever persisted; an
// invalid/unowned reference is silently dropped (falls back to no context)
// rather than failing the whole start-conversation request — starting a
// conversation must not fail because of a bad context hint.
async function resolveConversationContext(rawContext, tenantUser) {
  const entityType = String(rawContext?.entityType || "").trim().toLowerCase();
  const entityId = String(rawContext?.entityId || "").trim();
  if (!entityType || !entityId) return null;
  if (!VALID_CONTEXT_ENTITY_TYPES.has(entityType)) return null;
  if (!mongoose.Types.ObjectId.isValid(entityId)) return null;

  if (entityType === "contract") {
    const owned = await Contract.exists({ _id: entityId, tenantId: tenantUser._id });
    if (!owned) return null;
    return { entityType: "contract", entityId, sourceModule: "contract" };
  }

  return null;
}

function serializeContext(context) {
  if (!context?.entityType || !context?.entityId) return null;
  return {
    entityType: context.entityType,
    entityId: String(context.entityId),
    sourceModule: context.sourceModule || "",
  };
}

function normalizePriority(rawPriority, category = "") {
  if (rawPriority !== undefined && rawPriority !== null && rawPriority !== "") {
    const priority = String(rawPriority).trim().toLowerCase();
    if (!VALID_PRIORITIES.has(priority)) {
      throw createHttpError("Invalid priority.", 400, "INVALID_PRIORITY");
    }
    return priority;
  }

  return category === "urgent_issue" ? "urgent" : "normal";
}

function normalizeNote(rawNote, errorMessage = "Note is required.") {
  if (typeof rawNote !== "string") {
    throw createHttpError(errorMessage, 400, "NOTE_REQUIRED");
  }

  const note = rawNote.replace(/\r\n?/g, "\n").replace(/\t/g, " ").trim();
  if (!note) {
    throw createHttpError(errorMessage, 400, "NOTE_REQUIRED");
  }

  if (note.length > MAX_MESSAGE_CHARS) {
    throw createHttpError(
      `Note must be ${MAX_MESSAGE_CHARS} characters or fewer.`,
      400,
      "NOTE_TOO_LONG",
    );
  }

  return note;
}

function normalizeOptionalNote(rawNote) {
  if (rawNote === undefined || rawNote === null || rawNote === "") {
    return "";
  }

  return normalizeNote(rawNote, "Note is required.");
}

function ensureObjectId(value) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw createHttpError("Conversation not found.", 404, "CONVERSATION_NOT_FOUND");
  }
  return new mongoose.Types.ObjectId(value);
}

function displayName(user, fallback = "User") {
  if (!user) return fallback;
  return (
    `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
    user.name ||
    user.fullName ||
    user.email ||
    fallback
  );
}

function selectedBedLabel(reservation = {}) {
  const selectedBed = reservation?.selectedBed || {};
  const parts = [selectedBed.position, selectedBed.id].filter(Boolean);
  return parts.join(" ").trim();
}

/**
 * Auto-assign a newly created conversation to the most appropriate admin.
 *
 * Rules (applied in order, first match wins):
 *  1. maintenance_concern → admin with `manageMaintenance` permission on the branch
 *  2. Any category       → admin on the branch with the fewest open assigned conversations
 *
 * Silent failure: never throws — a missing assignee is non-fatal.
 */
async function autoAssignConversation(conversation) {
  try {
    const { branch } = conversation;
    if (!branch) return;

    let candidates = [];

    if (conversation.category === "maintenance_concern") {
      candidates = await User.find({
        role: { $in: ["branch_admin", "owner"] },
        branch,
        isArchived: false,
        "permissions.manageMaintenance": true,
      })
        .select("_id firstName lastName")
        .lean();
    }

    // Fallback: all branch admins on this branch
    if (candidates.length === 0) {
      candidates = await User.find({
        role: { $in: ["branch_admin", "owner"] },
        branch,
        isArchived: false,
      })
        .select("_id firstName lastName")
        .lean();
    }

    if (candidates.length === 0) return;

    // Pick the admin with the fewest currently open assigned conversations
    const candidateIds = candidates.map((c) => c._id);
    const loadCounts = await ChatConversation.aggregate([
      {
        $match: {
          assignedAdminId: { $in: candidateIds.map(String) },
          status: { $in: ["open", "in_review", "waiting_tenant"] },
        },
      },
      { $group: { _id: "$assignedAdminId", count: { $sum: 1 } } },
    ]);

    const loadMap = new Map(loadCounts.map((l) => [String(l._id), l.count]));
    const sorted = candidates.sort(
      (a, b) => (loadMap.get(String(a._id)) || 0) - (loadMap.get(String(b._id)) || 0),
    );
    const { _id: chosenId, firstName = "", lastName = "" } = sorted[0];

    conversation.assignedAdminId = String(chosenId);
    conversation.assignedAdminName =
      `${firstName} ${lastName}`.trim() || "Admin";
    if (conversation.request) {
      await mutateConversation(mongoose.connection.db, conversation._id, (doc) => {
        if (doc.status !== 'open' || doc.assignedAdminId) return null;
        return { assignedAdminId: String(chosenId), assignedAdminName: conversation.assignedAdminName };
      });
    } else {
      await conversation.save();
    }
  } catch (err) {
    // Non-fatal — log and continue
    console.error("autoAssignConversation failed (non-fatal):", err.message);
  }
}

/**
 * Resolves the tenant's profile image with fallback cascade:
 *  1. Live User.profileImage
 *  2. Reservation.selfiePhotoUrl / documentPrechecks.selfiePhoto.fileUrl
 *  3. Explicit/cached tenantProfileImage
 */
async function resolveTenantProfileImage({
  tenantId = null,
  tenantEmail = "",
  tenantUserId = "",
  tenantProfileImage = "",
  user = null,
  reservation = null,
} = {}) {
  try {
    if (user?.profileImage && typeof user.profileImage === "string" && user.profileImage.trim()) {
      return user.profileImage.trim();
    }

    const resPhoto = reservation?.selfiePhotoUrl || reservation?.documentPrechecks?.selfiePhoto?.fileUrl;
    if (resPhoto && typeof resPhoto === "string" && resPhoto.trim()) {
      return resPhoto.trim();
    }

    if (tenantProfileImage && typeof tenantProfileImage === "string" && tenantProfileImage.trim()) {
      return tenantProfileImage.trim();
    }

    const mongoId = tenantId && mongoose.Types.ObjectId.isValid(tenantId) ? new mongoose.Types.ObjectId(tenantId) : null;
    const normalizedEmail = tenantEmail ? String(tenantEmail).trim().toLowerCase() : "";

    let dbUser = null;
    if (mongoId && typeof User?.findById === "function") {
      dbUser = await User.findById(mongoId).select("profileImage email").lean();
    }
    if (!dbUser && normalizedEmail && typeof User?.findOne === "function") {
      dbUser = await User.findOne({ email: normalizedEmail }).select("profileImage email").lean();
    }
    if (dbUser?.profileImage && typeof dbUser.profileImage === "string" && dbUser.profileImage.trim()) {
      return dbUser.profileImage.trim();
    }

    const resConditions = [];
    if (mongoId) resConditions.push({ userId: mongoId });
    if (dbUser?._id) resConditions.push({ userId: dbUser._id });
    if (normalizedEmail) resConditions.push({ email: normalizedEmail });

    if (resConditions.length > 0 && typeof Reservation?.findOne === "function") {
      const resDoc = await Reservation.findOne({
        $or: resConditions,
        $and: [
          {
            $or: [
              { selfiePhotoUrl: { $exists: true, $ne: null, $ne: "" } },
              { "documentPrechecks.selfiePhoto.fileUrl": { $exists: true, $ne: null, $ne: "" } },
            ],
          },
        ],
      })
        .sort({ createdAt: -1 })
        .select("selfiePhotoUrl documentPrechecks.selfiePhoto.fileUrl")
        .lean();

      const photo = resDoc?.selfiePhotoUrl || resDoc?.documentPrechecks?.selfiePhoto?.fileUrl;
      if (photo && typeof photo === "string" && photo.trim()) {
        return photo.trim();
      }
    }

    // 6. Name-based Reservation fallback for legacy/orphaned chat records
    const targetName = String(user?.name || user?.fullName || "").trim();
    if (targetName && typeof Reservation?.findOne === "function") {
      const firstWord = targetName.split(/\s+/)[0];
      if (firstWord && firstWord.length >= 2) {
        const resByName = await Reservation.findOne({
          firstName: new RegExp(`^${firstWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
          selfiePhotoUrl: { $exists: true, $ne: null, $ne: "" },
        })
          .sort({ createdAt: -1 })
          .select("selfiePhotoUrl")
          .lean();

        if (resByName?.selfiePhotoUrl && typeof resByName.selfiePhotoUrl === "string" && resByName.selfiePhotoUrl.trim()) {
          return resByName.selfiePhotoUrl.trim();
        }
      }
    }

    return "";
  } catch (_) {
    return "";
  }
}

/**
 * Efficiently batch-resolves tenant profile photos across an array of conversation docs.
 */
async function batchResolveConversationPhotos(conversations = []) {
  try {
    if (!Array.isArray(conversations) || conversations.length === 0) return conversations;
    if (typeof User?.find !== "function" || typeof Reservation?.find !== "function") return conversations;

  const unresolved = conversations.filter((c) => {
    const tenantObj = c.tenantId && typeof c.tenantId === "object" ? c.tenantId : null;
    const currentPhoto = (tenantObj && tenantObj.profileImage) || c.tenantProfileImage || "";
    return !currentPhoto;
  });

  if (unresolved.length === 0) return conversations;

  const unresolvedEmails = [
    ...new Set(
      unresolved
        .map((c) => String(c.tenantEmail || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const unresolvedUserIds = [
    ...new Set(
      unresolved
        .map((c) => (c.tenantId && typeof c.tenantId === "object" ? c.tenantId._id : c.tenantId))
        .filter(Boolean)
        .map(String),
    ),
  ];
  const unresolvedFirstNames = [
    ...new Set(
      unresolved
        .map((c) => String(c.tenantName || "").trim().split(/\s+/)[0])
        .filter((name) => Boolean(name) && name.length >= 2),
    ),
  ];

  const [usersByEmail, reservations, reservationsByName] = await Promise.all([
    unresolvedEmails.length > 0
      ? User.find({
          email: { $in: unresolvedEmails },
          profileImage: { $exists: true, $ne: "" },
        })
          .select("_id email profileImage")
          .lean()
      : [],
    Reservation.find({
      $or: [
        ...(unresolvedUserIds.length > 0
          ? [{ userId: { $in: unresolvedUserIds.map((id) => new mongoose.Types.ObjectId(id)) } }]
          : []),
        ...(unresolvedEmails.length > 0 ? [{ email: { $in: unresolvedEmails } }] : []),
      ],
      $and: [
        {
          $or: [
            { selfiePhotoUrl: { $exists: true, $ne: null, $ne: "" } },
            { "documentPrechecks.selfiePhoto.fileUrl": { $exists: true, $ne: null, $ne: "" } },
          ],
        },
      ],
    })
      .sort({ createdAt: -1 })
      .select("userId email selfiePhotoUrl documentPrechecks.selfiePhoto.fileUrl")
      .lean(),
    unresolvedFirstNames.length > 0
      ? Reservation.find({
          firstName: { $in: unresolvedFirstNames.map((fn) => new RegExp(`^${fn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i")) },
          selfiePhotoUrl: { $exists: true, $ne: null, $ne: "" },
        })
          .sort({ createdAt: -1 })
          .select("firstName selfiePhotoUrl")
          .lean()
      : [],
  ]);

  const userEmailMap = new Map(usersByEmail.map((u) => [String(u.email).toLowerCase(), u.profileImage]));
  const resUserIdMap = new Map();
  const resEmailMap = new Map();
  const resNameMap = new Map();

  reservations.forEach((r) => {
    const photo = r.selfiePhotoUrl || r.documentPrechecks?.selfiePhoto?.fileUrl;
    if (photo && typeof photo === "string" && photo.trim()) {
      const cleanPhoto = photo.trim();
      if (r.userId && !resUserIdMap.has(String(r.userId))) {
        resUserIdMap.set(String(r.userId), cleanPhoto);
      }
      if (r.email && !resEmailMap.has(String(r.email).toLowerCase())) {
        resEmailMap.set(String(r.email).toLowerCase(), cleanPhoto);
      }
    }
  });

  reservationsByName.forEach((r) => {
    const fn = String(r.firstName || "").trim().toLowerCase();
    if (fn && r.selfiePhotoUrl && !resNameMap.has(fn)) {
      resNameMap.set(fn, r.selfiePhotoUrl.trim());
    }
  });

  unresolved.forEach((c) => {
    const tenantIdStr = c.tenantId && typeof c.tenantId === "object" ? String(c.tenantId._id) : String(c.tenantId || "");
    const emailStr = String(c.tenantEmail || "").trim().toLowerCase();
    const firstNameStr = String(c.tenantName || "").trim().split(/\s+/)[0].toLowerCase();
    const resolved =
      (emailStr && userEmailMap.get(emailStr)) ||
      (tenantIdStr && resUserIdMap.get(tenantIdStr)) ||
      (emailStr && resEmailMap.get(emailStr)) ||
      (firstNameStr && resNameMap.get(firstNameStr)) ||
      "";

    if (resolved) {
      c.tenantProfileImage = resolved;
      if (c.tenantId && typeof c.tenantId === "object" && !c.tenantId.profileImage) {
        c.tenantId.profileImage = resolved;
      }
      ChatConversation.updateOne({ _id: c._id }, { $set: { tenantProfileImage: resolved } }).catch(() => {});
    }
  });

    return conversations;
  } catch (_) {
    return conversations;
  }
}

export function serializeConversation(conversation) {
  if (!conversation) return null;
  const doc = currentConversation(typeof conversation.toObject === "function" ? conversation.toObject() : conversation);

  const tenantObj =
    doc.tenantId && typeof doc.tenantId === "object" ? doc.tenantId : null;
  const tenantIdStr = tenantObj
    ? String(tenantObj._id || tenantObj.id)
    : doc.tenantId
    ? String(doc.tenantId)
    : "";

  return {
    id: String(doc._id || doc.id),
    lifecycleEvents: supportLifecycleEvents(doc),
    request: doc.request || null,
    requestId: doc.request?.id || null,
    legacy: !doc.request,
    concern: doc.request?.concern || "",
    satisfaction: doc.request?.satisfaction || null,
    satisfactionRatedAt: doc.request?.satisfactionRatedAt || null,
    revision: doc.supportRevision || 0,
    ticketId: doc.ticketId || "",
    tenantId: tenantIdStr,
    tenantUserId: doc.tenantUserId || tenantObj?.user_id || '',
    tenantName:
      doc.tenantName ||
      (tenantObj ? displayName(tenantObj, "Tenant") : "Tenant"),
    tenantEmail: doc.tenantEmail || tenantObj?.email || "",
    tenantProfileImage:
      doc.tenantProfileImage || tenantObj?.profileImage || "",
    branch: doc.branch || "",
    roomNumber: doc.roomNumber || "",
    roomBed: doc.roomBed || "",
    status: doc.status || "open",
    category: doc.category || "general_inquiry",
    priority: doc.priority || "normal",
    assignedAdminId: doc.assignedAdminId ? String(doc.assignedAdminId) : "",
    assignedAdminName: doc.assignedAdminName || "",
    context: serializeContext(doc.context),
    lastMessage: doc.lastMessage || "",
    lastMessageAt: doc.lastMessageAt || doc.updatedAt || doc.createdAt || null,
    unreadAdminCount: doc.unreadAdminCount || 0,
    unreadTenantCount: doc.unreadTenantCount || 0,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
    closedAt: doc.closedAt || null,
    closedBy: doc.closedBy ? String(doc.closedBy) : null,
    closingNote: doc.closingNote || "",
    resolvedAt: doc.resolvedAt || null,
    resolvedBy: doc.resolvedBy ? String(doc.resolvedBy) : null,
    tenantResolutionConfirmed: Boolean(doc.tenantResolutionConfirmed || doc.request?.satisfaction),
    tenantResolutionAt: doc.tenantResolutionAt || doc.request?.satisfaction?.submittedAt || null,
    resolutionConfirmationSource: doc.resolutionConfirmationSource || "",
    firstAdminReplyAt: doc.firstAdminReplyAt || null,
    firstAdminReplyMinutes: doc.firstAdminReplyMinutes ?? null,
    resolutionDurationMinutes: doc.resolutionDurationMinutes ?? null,
    satisfactionRating: doc.satisfactionRating ?? null,
    satisfactionFeedback: doc.satisfactionFeedback || "",
    reopenedAt: doc.reopenedAt || null,
    reopenCount: Number(doc.reopenCount || 0),
    statusHistory: Array.isArray(doc.statusHistory)
      ? doc.statusHistory.map((entry) => ({
          eventId: entry.eventId || '',
          eventType: entry.eventType || '',
          rating: entry.rating ?? null,
          feedback: entry.feedback || '',
          resolvedAt: entry.resolvedAt || null,
          resolvedBy: entry.resolvedBy ? String(entry.resolvedBy) : null,
          resolutionNote: entry.resolutionNote || '',
          status: entry.status || "",
          note: entry.note || "",
          actorId: entry.actorId ? String(entry.actorId) : "",
          actorName: entry.actorName || "",
          createdAt: entry.createdAt || null,
        }))
      : [],
  };
}

function serializeMessage(message) {
  if (!message) return null;
  const doc =
    typeof message.toObject === "function" ? message.toObject() : message;

  const senderObj =
    doc.senderId && typeof doc.senderId === "object" ? doc.senderId : null;
  const senderIdStr = senderObj
    ? String(senderObj._id || senderObj.id)
    : doc.senderId
    ? String(doc.senderId)
    : "";

  return {
    id: String(doc._id || doc.id),
    conversationId: doc.conversationId ? String(doc.conversationId) : "",
    requestId: doc.requestId || null,
    senderId: senderIdStr,
    senderName:
      doc.senderName || (senderObj ? displayName(senderObj, "User") : ""),
    senderRole: doc.senderRole || "tenant",
    senderProfileImage:
      doc.senderProfileImage || senderObj?.profileImage || "",
    message: doc.message || "",
    attachments: Array.isArray(doc.attachments)
      ? doc.attachments.map((att) => ({
          attachmentId: att.attachmentId ? String(att.attachmentId) : "",
          url: att.attachmentId
            ? `/chat/${doc.conversationId}/attachments/${att.attachmentId}`
            : att.url || att.fileUrl || "",
          fileUrl: att.attachmentId
            ? `/chat/${doc.conversationId}/attachments/${att.attachmentId}`
            : att.fileUrl || att.url || "",
          name: att.name || att.fileName || "attachment",
          fileName: att.fileName || att.name || "attachment",
          type: att.type || att.mimeType || "application/octet-stream",
          mimeType: att.mimeType || att.type || "application/octet-stream",
          size: Number(att.size || 0),
        }))
      : [],
    readAt: doc.readAt || null,
    createdAt: doc.createdAt || null,
  };
}

async function getDbUser(req) {
  if (!req.authUser?._id) {
    throw createHttpError("Authentication failed.", 401, "AUTHENTICATION_FAILED");
  }

  const dbUser = await User.findById(req.authUser._id).lean();
  if (!dbUser) {
    throw createHttpError("Authentication failed.", 401, "AUTHENTICATION_FAILED");
  }
  return dbUser;
}

async function resolveTenantContext(req) {
  const dbUser = await getDbUser(req);
  const role = String(req.authUser?.role || "").toLowerCase();

  if (ADMIN_ROLES.has(role)) {
    throw createHttpError("No active tenant.", 403, "NO_ACTIVE_TENANT");
  }

  const activeReservation = await Reservation.findOne({
    userId: dbUser._id,
    status: { $in: CURRENT_RESIDENT_STATUS_QUERY },
    isArchived: false,
  })
    .sort({ moveInDate: -1, createdAt: -1 })
    .populate("roomId", "name roomNumber branch type floor")
    .lean();

  const room = activeReservation?.roomId || null;
  const branch = room?.branch || dbUser.branch || "";
  const hasTenantAccess =
    role === "tenant" ||
    dbUser.tenantStatus === "active" ||
    Boolean(activeReservation);

  if (!hasTenantAccess || !ROOM_BRANCHES.includes(branch)) {
    throw createHttpError("No active tenant.", 400, "NO_ACTIVE_TENANT");
  }

  return {
    user: dbUser,
    activeReservation,
    branch,
    roomNumber: room?.roomNumber || room?.name || "",
    roomBed: selectedBedLabel(activeReservation),
  };
}

async function resolveAdminContext(req) {
  const dbUser = req.authUser;
  const normalizedRole = String(dbUser?.role || "").toLowerCase();
  const isOwnerLike = isOwnerRole(normalizedRole);
  const isBranchAdmin = normalizedRole === "branch_admin";

  if (!isOwnerLike && !isBranchAdmin) {
    throw createHttpError(
      "Access denied. Admin privileges required.",
      403,
      "ADMIN_ACCESS_DENIED",
    );
  }

  const branch = isOwnerLike ? null : (req.branchFilter ?? dbUser?.branch);
  if (!isOwnerLike && (!ROOM_BRANCHES.includes(branch) || branch !== dbUser?.branch)) {
    throw createHttpError(
      "Admin branch is not assigned.",
      403,
      "ADMIN_BRANCH_REQUIRED",
    );
  }

  return {
    user: dbUser,
    role: normalizedRole,
    senderRole: isOwnerRole(normalizedRole) ? "owner" : "admin",
    branch,
    isOwnerLike,
    displayName: displayName(dbUser, "Admin"),
  };
}

async function findConversationForTenant(conversationId, tenantUser) {
  const conversation = await ChatConversation.findById(ensureObjectId(conversationId));
  if (!conversation) {
    throw createHttpError("Conversation not found.", 404, "CONVERSATION_NOT_FOUND");
  }

  if (String(conversation.tenantId) !== String(tenantUser._id)) {
    throw createHttpError(
      "You do not have access to this conversation.",
      403,
      "CONVERSATION_ACCESS_DENIED",
    );
  }

  return conversation;
}

function supportAdminScope(adminContext) {
  return [
    { 'request.branch': adminContext.branch },
    { request: { $exists: false }, branch: adminContext.branch },
    { 'request.assignedAdminId': { $in: [adminContext.user._id, String(adminContext.user._id)] } },
  ];
}

function assertAdminConversationAccess(conversation, adminContext) {
  if (!conversation) {
    throw createHttpError("Conversation not found.", 404, "CONVERSATION_NOT_FOUND");
  }

  if (!adminContext.isOwnerLike && (conversation.request?.branch || conversation.branch) !== adminContext.branch
      && String(conversation.request?.assignedAdminId || "") !== String(adminContext.user?._id)) {
    throw createHttpError(
      "Conversation not found.",
      404,
      "CONVERSATION_NOT_FOUND",
    );
  }
}

async function findConversationForAdmin(conversationId, adminContext) {
  const filter = { _id: ensureObjectId(conversationId) };
  if (!adminContext.isOwnerLike) filter.$or = supportAdminScope(adminContext);

  const conversation = await ChatConversation.findOne(filter);
  assertAdminConversationAccess(conversation, adminContext);
  return conversation;
}

async function createMessageAndUpdateConversation({
  conversation,
  sender,
  senderRole,
  message,
  attachments = [],
  unreadTarget,
  nextStatus = null,
  statusNote = "",
}) {
  const now = new Date();
  let senderPhoto = sender?.profileImage || "";
  if (!senderPhoto && senderRole === "tenant") {
    senderPhoto = await resolveTenantProfileImage({
      tenantId: sender?._id || conversation.tenantId,
      tenantEmail: sender?.email || conversation.tenantEmail,
      tenantUserId: sender?.user_id || conversation.tenantUserId,
      tenantProfileImage: conversation.tenantProfileImage,
      user: sender,
    });
  }

  const chatMessage = await ChatMessage.create({
    conversationId: conversation._id,
    senderId: sender?._id || null,
    senderUserId: sender?.user_id || "",
    senderName: sender?.name || sender?.displayName || displayName(sender, "User"),
    senderRole,
    senderProfileImage: senderPhoto,
    message: message || "",
    attachments: attachments || [],
    createdAt: now,
    updatedAt: now,
  });

  const lastMessagePreview = message || (
    attachments.some((a) => String(a.type || a.mimeType || "").startsWith("image"))
      ? "📷 Photo"
      : "📎 Attachment"
  );

  const update = {
    $set: {
      lastMessage: lastMessagePreview,
      lastMessageAt: now,
      ...(senderPhoto && !conversation.tenantProfileImage ? { tenantProfileImage: senderPhoto } : {}),
    },
  };

  if (["admin", "owner"].includes(senderRole) && !conversation.firstAdminReplyAt) {
    const createdAtTime = new Date(conversation.createdAt || now).getTime();
    const diffMinutes = Math.max(0, Math.round((now.getTime() - createdAtTime) / (60 * 1000)));
    update.$set.firstAdminReplyAt = now;
    update.$set.firstAdminReplyMinutes = diffMinutes;
  }

  if (nextStatus === "open") {
    update.$set.closedAt = null;
    update.$set.closedBy = null;
    update.$set.closingNote = "";
  }

  if (nextStatus && conversation.status !== nextStatus) {
    update.$set.status = nextStatus;
    update.$push = {
      statusHistory: {
        $each: [
          {
            status: nextStatus,
            note: statusNote,
            actorId: sender?._id || null,
            actorName: sender?.name || sender?.displayName || displayName(sender, "User"),
            createdAt: now,
          },
        ],
        $slice: -25,
      },
    };
  }

  if (unreadTarget === "admin") {
    update.$inc = { unreadAdminCount: 1 };
  } else if (unreadTarget === "tenant") {
    update.$inc = { unreadTenantCount: 1 };
  }

  const updatedConversation = await ChatConversation.findByIdAndUpdate(
    conversation._id,
    update,
    { new: true },
  );

  return { chatMessage, conversation: updatedConversation };
}

async function notifyAdminsOfTenantMessage(conversation) {
  try {
    const admins = await User.find({
      isArchived: false,
      accountStatus: "active",
      $or: [
        { role: { $in: OWNER_ROLE_VALUES } },
        { role: "branch_admin", branch: conversation.branch },
      ],
    })
      .select("_id")
      .lean();

    await Promise.all(
      admins.map(async (admin) => {
        const notification = await notify.general(
          admin._id,
          conversation.priority === "urgent"
            ? "Urgent Tenant Message"
            : "New Tenant Message",
          conversation.priority === "urgent"
            ? `${conversation.tenantName} sent an urgent support message.`
            : `${conversation.tenantName} sent a message.`,
          {
            actionUrl: "/admin/chat",
            entityId: String(conversation._id),
          },
        );
        if (notification) {
          emitToUser(admin._id, "notification:new", notification);
        }
      }),
    );
  } catch (error) {
    console.warn("Chat admin notification failed:", error.message);
  }
}

async function notifyTenantOfAdminReply(conversation, chatMessage) {
  try {
    await notify.adminReply(
      conversation.tenantId,
      conversation._id,
      chatMessage._id,
    );
  } catch (error) {
    console.warn("Chat tenant notification failed:", error.message);
  }
}

async function markTenantMessagesRead(conversationId) {
  const now = new Date();
  const [conv] = await Promise.all([
    ChatConversation.findByIdAndUpdate(
      conversationId,
      { $set: { unreadAdminCount: 0 } },
      { new: true },
    ),
    ChatMessage.updateMany(
      { conversationId, senderRole: "tenant", readAt: null },
      { $set: { readAt: now } },
    ),
  ]);

  if (conv?.tenantId) {
    emitToUser(conv.tenantId, "chat:messages-read", {
      conversationId: String(conversationId),
      readerRole: "admin",
      readAt: now.toISOString(),
    });
  }
  if (conv?.branch) {
    emitToChatAdmins(conv.branch, "chat:messages-read", {
      conversationId: String(conversationId),
      readerRole: "admin",
      readAt: now.toISOString(),
    });
  }
}

async function markAdminMessagesRead(conversationId) {
  const now = new Date();
  const [conv] = await Promise.all([
    ChatConversation.findByIdAndUpdate(
      conversationId,
      { $set: { unreadTenantCount: 0 } },
      { new: true },
    ),
    ChatMessage.updateMany(
      {
        conversationId,
        senderRole: { $in: ["admin", ...OWNER_ROLE_VALUES] },
        readAt: null,
      },
      { $set: { readAt: now } },
    ),
  ]);

  if (conv?.branch) {
    emitToChatAdmins(conv.branch, "chat:messages-read", {
      conversationId: String(conversationId),
      readerRole: "tenant",
      readAt: now.toISOString(),
    });
  }
}

async function appendInitialTenantMessage({ conversation, tenantUser, rawMessage }) {
  if (typeof rawMessage !== "string" || !rawMessage.trim()) return null;

  const message = normalizeMessage(rawMessage);
  const latest = await ChatMessage.findOne({ conversationId: conversation._id })
    .sort({ createdAt: -1 })
    .lean();
  const latestCreatedAt = latest?.createdAt ? new Date(latest.createdAt).getTime() : 0;
  const isRecentRetry = latest?.senderRole === "tenant"
    && latest?.message === message
    && latestCreatedAt > 0
    && Date.now() - latestCreatedAt < 30_000;
  if (isRecentRetry) return null;

  const result = await createMessageAndUpdateConversation({
    conversation,
    sender: tenantUser,
    senderRole: "tenant",
    message,
    unreadTarget: "admin",
    nextStatus: "open",
    statusNote: "Tenant shared a support concern.",
  });
  await notifyAdminsOfTenantMessage(result.conversation);

  const serializedMessage = serializeMessage(result.chatMessage);
  const serializedConversation = serializeConversation(result.conversation);
  emitToChatAdmins(result.conversation.branch, "chat:message-new", {
    message: serializedMessage,
    conversationId: String(result.conversation._id),
  });
  emitToChatAdmins(
    result.conversation.branch,
    "chat:conversation-updated",
    serializedConversation,
  );
  return {
    message: serializedMessage,
    conversation: result.conversation,
  };
}

/**
 * POST /chat/:conversationId/typing
 *
 * Lightweight endpoint — no DB write.
 * Resolves the caller's role and name, then emits chat:typing to all branch
 * admins so the other side can render a "… is typing" indicator.
 * Fire-and-forget from the client every ~2s while composing.
 */
export async function broadcastTyping(req, res) {
  try {
    const { conversationId } = req.params;
    if (!conversationId) return res.status(400).json({ error: "Missing conversationId." });

    // Determine caller identity without heavy DB work —
    // the token already carries the role and we only need displayName.
    const dbUser = await getDbUser(req);
    const conversation = await ChatConversation.findById(
      ensureObjectId(conversationId),
    );
    if (!conversation) {
      throw createHttpError("Conversation not found.", 404, "CONVERSATION_NOT_FOUND");
    }

    const role = String(req.authUser?.role || "").toLowerCase();
    const isAdmin = ADMIN_ROLES.has(role);
    if (isAdmin) {
      const adminContext = await resolveAdminContext(req);
      assertAdminConversationAccess(conversation, adminContext);
    } else if (String(conversation.tenantId) !== String(dbUser._id)) {
      throw createHttpError(
        "You do not have access to this conversation.",
        403,
        "CONVERSATION_ACCESS_DENIED",
      );
    }

    const senderName = displayName(dbUser, isAdmin ? "Admin" : "Tenant");
    const senderRole = isAdmin ? role : "tenant";

    emitToChatAdmins(conversation.branch, "chat:typing", {
      conversationId,
      senderRole,
      senderName,
    });

    return res.json({ ok: true });
  } catch (error) {
    return sendError(res, error, "Failed to broadcast typing event.");
  }
}

export async function startConversation(req, res) {
  try {
    const tenantContext = await resolveTenantContext(req);
    const tenantName = displayName(tenantContext.user, "Tenant");
    const tenantProfileImage = await resolveTenantProfileImage({
      tenantId: tenantContext.user._id,
      tenantEmail: tenantContext.user.email,
      tenantUserId: tenantContext.user.user_id,
      tenantProfileImage: tenantContext.user.profileImage,
      user: tenantContext.user,
      reservation: tenantContext.activeReservation,
    });

    const context = await resolveConversationContext(req.body?.context, tenantContext.user);

    if (req.body?.clientRequestId !== undefined) {
      const key = req.body.clientRequestId;
      if (typeof key !== 'string' || !key.trim() || key.length > 128) {
        throw createHttpError('A valid concern operation key is required.', 400, 'INVALID_REQUEST_KEY');
      }
      const concern = normalizeMessage(req.body.initialMessage);
      const category = normalizeCategory(req.body.category, { required: true });
      const started = await createSupportRequest(mongoose.connection.db,
        { _id: tenantContext.user._id, user_id: tenantContext.user.user_id, name: tenantName, role: tenantContext.user.role }, key,
        { concern, category, priority: normalizePriority(req.body.priority, category), context: context || undefined,
          tenantName, tenantEmail: tenantContext.user.email || '', tenantProfileImage,
          branch: tenantContext.branch, roomNumber: tenantContext.roomNumber, roomBed: tenantContext.roomBed,
          unreadAdminCount: 0, unreadTenantCount: 0, lastMessage: '',
          statusHistory: [{ status: 'open', note: 'Conversation started.', actorId: tenantContext.user._id,
            actorName: tenantName, createdAt: new Date() }] });
      await autoAssignConversation(started.conversation);
      await reconcileSupport(mongoose.connection.db, started.conversation._id);
      const fresh = await ensureChatTicketId(await ChatConversation.findById(started.conversation._id).lean());
      if (!started.reusedExisting) await notifyAdminsOfTenantMessage(fresh);
      const initial = await ChatMessage.findOne({ conversationId: fresh._id }).sort({ createdAt: 1 }).lean();
      const serialized = serializeConversation(fresh);
      emitToChatAdmins(serialized.branch, 'chat:conversation-updated', serialized);
      return res.json({ conversation: serialized, message: serializeMessage(initial), reusedExisting: started.reusedExisting });
    }

    // With a context (e.g. "this concerns Contract X"), only reuse/reopen an
    // existing conversation about that SAME entity — never silently attach
    // to an unrelated open thread. Without a context, preserve the original
    // behavior of reusing the tenant's most recent active conversation, but
    // scoped to other context-less conversations so a generic "talk to
    // admin" request can never hijack an existing contract-specific thread.
    const reuseFilter = context
      ? {
          tenantId: tenantContext.user._id,
          status: { $in: ["open", "in_review", "waiting_tenant"] },
          "context.entityType": context.entityType,
          "context.entityId": context.entityId,
        }
      : {
          tenantId: tenantContext.user._id,
          status: { $in: ["open", "in_review", "waiting_tenant"] },
          $or: [
            { "context.entityType": "" },
            { "context.entityType": { $exists: false } },
          ],
        };

    reuseFilter.request = { $exists: false };
    let conversation = await ChatConversation.findOne(reuseFilter).sort({ updatedAt: -1 });
    const reusedExisting = Boolean(conversation);

    if (conversation) {
      conversation.tenantName = tenantName;
      conversation.tenantEmail = tenantContext.user.email || "";
      if (tenantProfileImage) {
        conversation.tenantProfileImage = tenantProfileImage;
      }
      conversation.branch = tenantContext.branch;
      conversation.roomNumber = tenantContext.roomNumber;
      conversation.roomBed = tenantContext.roomBed;
      if (!conversation.category) conversation.category = "general_inquiry";
      if (!conversation.priority) conversation.priority = "normal";
      await conversation.save();
      conversation = await ensureChatTicketId(conversation);
    } else {
      const category = normalizeCategory(req.body?.category, { required: true });
      const priority = normalizePriority(req.body?.priority, category);
      conversation = await ChatConversation.create({
        ticketId: await generateChatTicketId(),
        tenantId: tenantContext.user._id,
        tenantUserId: tenantContext.user.user_id || "",
        tenantName,
        tenantEmail: tenantContext.user.email || "",
        tenantProfileImage,
        branch: tenantContext.branch,
        roomNumber: tenantContext.roomNumber,
        roomBed: tenantContext.roomBed,
        status: "open",
        category,
        priority,
        context: context || undefined,
        statusHistory: [
          {
            status: "open",
            note: "Conversation started.",
            actorId: tenantContext.user._id,
            actorName: tenantName,
            createdAt: new Date(),
          },
        ],
      });

      // Auto-assign based on category — reduces manual assignment workload
      await autoAssignConversation(conversation);
    }

    const initial = await appendInitialTenantMessage({
      conversation,
      tenantUser: tenantContext.user,
      rawMessage: req.body?.initialMessage,
    });
    if (initial?.conversation) conversation = initial.conversation;

    return res.json({
      conversation: serializeConversation(conversation),
      message: initial?.message || null,
      reusedExisting,
    });
  } catch (error) {
    return sendError(res, error, "Failed to start chat.");
  }
}

export async function getMyConversations(req, res) {
  try {
    const tenantContext = await resolveTenantContext(req);
    let conversations = await ChatConversation.find({
      tenantId: tenantContext.user._id,
    })
      .populate("tenantId", "profileImage firstName lastName email user_id")
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(50)
      .lean();

    conversations = await ensureChatTicketIds(conversations);
    await batchResolveConversationPhotos(conversations);

    return res.json({
      conversations: conversations.map(serializeConversation),
    });
  } catch (error) {
    return sendError(res, error, "Failed to load conversations.");
  }
}

export async function getConversationMessages(req, res) {
  try {
    const tenantContext = await resolveTenantContext(req);
    let conversation = await findConversationForTenant(
      req.params.conversationId,
      tenantContext.user,
    );
    if (conversation.request) {
      await reconcileSupport(mongoose.connection.db, conversation._id).catch((error) => console.warn('Support delivery pending:', error.message));
      conversation = await ChatConversation.findById(conversation._id);
    }
    conversation = await ensureChatTicketId(conversation);

    await markAdminMessagesRead(conversation._id);

    const messages = await ChatMessage.find({ conversationId: conversation._id })
      .populate("senderId", "profileImage firstName lastName role")
      .sort({ createdAt: 1 })
      .lean();

    const tenantPhoto = conversation.tenantProfileImage || (await resolveTenantProfileImage({
      tenantId: conversation.tenantId,
      tenantEmail: conversation.tenantEmail,
      tenantUserId: conversation.tenantUserId,
      tenantProfileImage: conversation.tenantProfileImage,
    }));

    if (tenantPhoto && !conversation.tenantProfileImage) {
      conversation.tenantProfileImage = tenantPhoto;
      ChatConversation.updateOne({ _id: conversation._id }, { $set: { tenantProfileImage: tenantPhoto } }).catch(() => {});
    }

    messages.forEach((m) => {
      if (m.senderRole === "tenant" && !m.senderProfileImage && tenantPhoto) {
        m.senderProfileImage = tenantPhoto;
      }
    });

    return res.json({
      messages: messages.map(serializeMessage),
      conversation: serializeConversation(conversation),
    });
  } catch (error) {
    return sendError(res, error, "Failed to load messages.");
  }
}

export async function sendTenantMessage(req, res) {
  try {
    const tenantContext = await resolveTenantContext(req);
    const conversation = await findConversationForTenant(
      req.params.conversationId,
      tenantContext.user,
    );
    if (!conversation.request && conversation.satisfactionRating != null) throw conflict('Historical ratings are immutable.', 'ALREADY_RATED');

    const attachments = await normalizeAttachments(req.body?.attachments, conversation._id);
    const message = normalizeMessage(req.body?.message, attachments.length > 0);
    if (conversation.request) {
      const result = await persistMessage(mongoose.connection.db, currentConversation(conversation.toObject()),
        tenantContext.user, { message, attachments, clientMessageId: String(req.body?.clientMessageId || '') });
      if (!result.idempotentReplay) await notifyAdminsOfTenantMessage(result.conversation);
      const serialized = serializeConversation(result.conversation);
      const sent = serializeMessage(result.message);
      emitToChatAdmins(serialized.branch, 'chat:message-new', { message: sent, conversationId: serialized.id });
      emitToChatAdmins(serialized.branch, 'chat:conversation-updated', serialized);
      return res.json({ message: sent, conversation: serialized });
    }
    const result = await createMessageAndUpdateConversation({
      conversation,
      sender: tenantContext.user,
      senderRole: "tenant",
      message,
      attachments,
      unreadTarget: "admin",
      nextStatus: "open",
      statusNote: ["resolved", "closed"].includes(conversation.status)
        ? "Tenant replied because the concern persists; conversation reopened."
        : "Tenant replied.",
    });

    if (["resolved", "closed"].includes(conversation.status)) {
      result.conversation.reopenedAt = new Date();
      result.conversation.reopenCount = Number(conversation.reopenCount || 0) + 1;
      await result.conversation.save();
    }

    await notifyAdminsOfTenantMessage(result.conversation);

    const serializedMessage = serializeMessage(result.chatMessage);
    const serializedConversation = serializeConversation(result.conversation);

    // Emit both the lightweight message payload and the full conversation update.
    // message-new lets admin chat panels append the message without a full reload.
    // conversation-updated refreshes unread counts and list ordering.
    emitToChatAdmins(result.conversation.branch, "chat:message-new", {
      message: serializedMessage,
      conversationId: String(result.conversation._id),
    });
    emitToChatAdmins(
      result.conversation.branch,
      "chat:conversation-updated",
      serializedConversation,
    );

    return res.json({
      message: serializedMessage,
      conversation: serializedConversation,
    });
  } catch (error) {
    return sendError(res, error, "Failed to send message.");
  }
}

export async function reopenTenantConversation(req, res) {
  try {
    const tenantContext = await resolveTenantContext(req);
    const conversation = await findConversationForTenant(
      req.params.conversationId,
      tenantContext.user,
    );
    if (!conversation.request && conversation.satisfactionRating != null) throw conflict('Historical ratings are immutable.', 'ALREADY_RATED');

    if (conversation.request) return await reopenTenantSupport(req, res, conversation, tenantContext.user);

    if (!["resolved", "closed"].includes(conversation.status)) {
      return res.json({ conversation: serializeConversation(conversation) });
    }

    const note = String(req.body?.note || "").trim().slice(0, 500)
      || "Tenant reports that the concern persists; conversation reopened.";
    const now = new Date();
    const result = await createMessageAndUpdateConversation({
      conversation,
      sender: tenantContext.user,
      senderRole: "tenant",
      message: note,
      unreadTarget: "admin",
      nextStatus: "open",
      statusNote: "Tenant reopened the resolved concern in the same thread.",
    });
    result.conversation.reopenedAt = now;
    result.conversation.reopenCount = Number(conversation.reopenCount || 0) + 1;
    await result.conversation.save();

    await notifyAdminsOfTenantMessage(result.conversation);

    const serializedMessage = serializeMessage(result.chatMessage);
    const serializedConversation = serializeConversation(result.conversation);
    emitToChatAdmins(result.conversation.branch, "chat:message-new", {
      message: serializedMessage,
      conversationId: String(result.conversation._id),
    });
    emitToChatAdmins(
      conversation.branch,
      "chat:conversation-updated",
      serializedConversation,
    );

    return res.json({ message: serializedMessage, conversation: serializedConversation });
  } catch (error) {
    return sendError(res, error, "Failed to reopen conversation.");
  }
}

export async function closeTenantConversation(req, res) {
  try {
    const tenantContext = await resolveTenantContext(req);
    const conversation = await findConversationForTenant(
      req.params.conversationId,
      tenantContext.user,
    );
    if (!conversation.request && conversation.satisfactionRating != null) throw conflict('Historical ratings are immutable.', 'ALREADY_RATED');

    if (conversation.request) throw conflict('Confirm resolution and submit a rating to close this inquiry.', 'TENANT_CONFIRMATION_REQUIRED');

    if (conversation.status === "closed") {
      return res.json({ conversation: serializeConversation(conversation) });
    }

    const note = normalizeOptionalNote(req.body?.note) || "Tenant closed the conversation.";
    const now = new Date();
    conversation.status = "closed";
    conversation.closedAt = now;
    conversation.closedBy = tenantContext.user._id;
    conversation.closingNote = note;
    conversation.statusHistory.push({
      status: "closed",
      note,
      actorId: tenantContext.user._id,
      actorName: displayName(tenantContext.user, "Tenant"),
      createdAt: now,
    });
    await conversation.save();

    const serializedConversation = serializeConversation(conversation);
    emitToChatAdmins(
      conversation.branch,
      "chat:conversation-updated",
      serializedConversation,
    );
    return res.json({ conversation: serializedConversation });
  } catch (error) {
    return sendError(res, error, "Failed to close conversation.");
  }
}

async function reopenTenantSupport(req, res, conversation, user) {
  const updated = await reopenSupportRequest(mongoose.connection.db, conversation, user, req.body);
  await reconcileSupport(mongoose.connection.db, conversation._id).catch((error) => console.warn('Support delivery pending:', error.message));
  const serialized = serializeConversation(updated);
  emitToChatAdmins(serialized.branch, 'chat:conversation-updated', serialized);
  return res.json({ conversation: serialized });
}

// The explicit rating endpoint confirms an existing admin resolution; it never resolves an inquiry.
export async function rateTenantSupport(req, res) {
  if (!Number.isSafeInteger(req.body?.revision) || req.body.revision < 0) {
    return res.status(400).json({ error: 'Refresh this inquiry before submitting your rating.', code: 'REVISION_REQUIRED' });
  }
  req.body = { ...req.body, resolved: true };
  return confirmTenantResolution(req, res);
}

export async function confirmTenantResolution(req, res) {
  try {
    const tenantContext = await resolveTenantContext(req);
    const conversation = await findConversationForTenant(
      req.params.conversationId,
      tenantContext.user,
    );
    if (conversation.request) {
      if (req.body?.resolved === false) return await reopenTenantSupport(req, res, conversation, tenantContext.user);
      const updated = await rateSupportRequest(mongoose.connection.db, conversation, tenantContext.user, req.body);
      await reconcileSupport(mongoose.connection.db, conversation._id).catch((error) => console.warn('Support delivery pending:', error.message));
      const serialized = serializeConversation(updated);
      emitToChatAdmins(serialized.branch, 'chat:conversation-updated', serialized);
      return res.json({ conversation: serialized });
    }
    throw conflict('An admin must mark this inquiry as resolved before you can confirm it.', 'NOT_RESOLVED');
  } catch (error) {
    return sendError(res, error, "Failed to confirm resolution.");
  }
}

export async function uploadChatAttachment(req, res) {
  try {
    const [{ default: ChatAttachment }, { uploadAttachmentFile }] = await Promise.all([
      import("../models/ChatAttachment.js"),
      import("../services/attachmentUploadService.js"),
    ]);
    const role = String(req.authUser?.role || "").toLowerCase();
    let conversation;
    let uploaderRole = "tenant";
    let uploader;
    if (ADMIN_ROLES.has(role)) {
      const adminContext = await resolveAdminContext(req);
      conversation = await findConversationForAdmin(req.params.conversationId, adminContext);
      uploaderRole = adminContext.senderRole;
      uploader = adminContext.user;
    } else {
      const tenantContext = await resolveTenantContext(req);
      conversation = await findConversationForTenant(req.params.conversationId, tenantContext.user);
      uploader = tenantContext.user;
    }

    if (conversation.status === "closed") {
      throw createHttpError("This conversation is closed.", 400, "CONVERSATION_CLOSED");
    }

    const stored = await uploadAttachmentFile({
      req,
      file: req.file,
      options: {
        context: "chat_attachment",
        conversationId: String(conversation._id),
        relatedId: String(conversation._id),
        visibility: "tenant_admin",
        senderRole: uploaderRole,
      },
    });
    const attachment = await ChatAttachment.create({
      conversationId: conversation._id,
      branch: conversation.branch,
      uploadedBy: uploader._id,
      uploaderRole,
      originalName: stored.originalName || stored.name,
      mimeType: stored.mimeType || stored.type,
      size: stored.size,
      provider: stored.provider,
      storagePath: stored.storagePath,
      storageUrl: stored.downloadUrl || stored.url,
    });
    const url = `/chat/${conversation._id}/attachments/${attachment._id}`;
    return res.status(201).json({
      attachment: {
        attachmentId: String(attachment._id),
        id: String(attachment._id),
        name: attachment.originalName,
        fileName: attachment.originalName,
        mimeType: attachment.mimeType,
        type: attachment.mimeType,
        size: attachment.size,
        url,
        fileUrl: url,
      },
    });
  } catch (error) {
    return sendError(res, error, "Failed to upload attachment.");
  }
}

export async function downloadChatAttachment(req, res) {
  try {
    const [
      { default: ChatAttachment },
      { default: admin, resolveFirebaseStorageBucket },
      { default: fs },
      { default: path },
      { fileURLToPath },
    ] = await Promise.all([
      import("../models/ChatAttachment.js"),
      import("../config/firebase.js"),
      import("fs"),
      import("path"),
      import("url"),
    ]);
    const controllerDir = path.dirname(fileURLToPath(import.meta.url));
    const role = String(req.authUser?.role || "").toLowerCase();
    let conversation;
    if (ADMIN_ROLES.has(role)) {
      const adminContext = await resolveAdminContext(req);
      conversation = await findConversationForAdmin(req.params.conversationId, adminContext);
    } else {
      const tenantContext = await resolveTenantContext(req);
      conversation = await findConversationForTenant(req.params.conversationId, tenantContext.user);
    }

    const attachment = await ChatAttachment.findOne({
      _id: ensureObjectId(req.params.attachmentId),
      conversationId: conversation._id,
    }).select("+storageUrl");
    if (!attachment) {
      throw createHttpError("Attachment not found.", 404, "ATTACHMENT_NOT_FOUND");
    }

    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
    );
    res.setHeader("Cache-Control", "private, max-age=300");

    if (attachment.provider === "local") {
      const uploadRoot = path.resolve(controllerDir, "..", "uploads");
      const relativePath = String(attachment.storagePath).replace(/^uploads[\\/]/, "");
      const resolvedPath = path.resolve(uploadRoot, relativePath);
      if (!resolvedPath.startsWith(`${uploadRoot}${path.sep}`)) {
        throw createHttpError("Attachment path is invalid.", 400, "ATTACHMENT_PATH_INVALID");
      }
      return fs.createReadStream(resolvedPath)
        .on("error", () => {
          if (!res.headersSent) res.status(404).json({ error: "Attachment not found." });
          else res.destroy();
        })
        .pipe(res);
    }

    const bucketName = resolveFirebaseStorageBucket();
    if (!admin.apps.length || !bucketName) {
      throw createHttpError("Attachment storage is unavailable.", 503, "ATTACHMENT_STORAGE_UNAVAILABLE");
    }
    return admin.storage().bucket(bucketName).file(attachment.storagePath).createReadStream()
      .on("error", () => {
        if (!res.headersSent) res.status(404).json({ error: "Attachment not found." });
        else res.destroy();
      })
      .pipe(res);
  } catch (error) {
    return sendError(res, error, "Failed to download attachment.");
  }
}

export async function getAdminConversations(req, res) {
  try {
    const adminContext = await resolveAdminContext(req);
    const filter = {};

    if (adminContext.isOwnerLike) {
      if (ROOM_BRANCHES.includes(req.query.branch)) {
        (filter.$and ||= []).push({ $or: [{ 'request.branch': req.query.branch },
          { request: { $exists: false }, branch: req.query.branch }] });
      }
    } else {
      filter.$or = supportAdminScope(adminContext);
    }

    if (VALID_STATUSES.has(req.query.status)) {
      (filter.$and ||= []).push({ $or: [{ 'request.status': req.query.status }, { request: { $exists: false }, status: req.query.status }] });
    }

    if (VALID_PRIORITIES.has(req.query.priority)) {
      (filter.$and ||= []).push({ $or: [{ 'request.priority': req.query.priority }, { request: { $exists: false }, priority: req.query.priority }] });
    }

    if (VALID_CATEGORIES.has(req.query.category)) {
      (filter.$and ||= []).push({ $or: [{ 'request.category': req.query.category }, { request: { $exists: false }, category: req.query.category }] });
    }

    if (req.query.assigned === "me" && adminContext.user?._id) {
      (filter.$and ||= []).push({ $or: [
        { 'request.assignedAdminId': { $in: [adminContext.user._id, String(adminContext.user._id)] } },
        { request: { $exists: false }, assignedAdminId: adminContext.user._id },
      ] });
    }

    if (req.query.unread === "true") {
      filter.unreadAdminCount = { $gt: 0 };
    }

    const search = String(req.query.search || "").trim();
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      (filter.$and ||= []).push({ $or: [
        { "request.id": regex },
        { "request.concern": regex },
        { ticketId: regex },
        { tenantName: regex },
        { tenantEmail: regex },
        { roomNumber: regex },
        { roomBed: regex },
        { lastMessage: regex },
      ] });
    }

    if (req.query.requestId) filter["request.id"] = String(req.query.requestId);
    if (req.query.conversationId) filter._id = ensureObjectId(req.query.conversationId);
    let conversations = await ChatConversation.find(filter)
      .populate("tenantId", "profileImage firstName lastName email user_id")
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(200)
      .lean();

    conversations = await ensureChatTicketIds(conversations);
    await batchResolveConversationPhotos(conversations);

    conversations.sort((left, right) => {
      const priorityDiff =
        (PRIORITY_RANK[currentConversation(left).priority || "normal"] ?? 2) -
        (PRIORITY_RANK[currentConversation(right).priority || "normal"] ?? 2);
      if (priorityDiff !== 0) return priorityDiff;

      const unreadDiff =
        (right.unreadAdminCount || 0) - (left.unreadAdminCount || 0);
      if (unreadDiff !== 0) return unreadDiff;

      const leftDate = new Date(left.lastMessageAt || left.updatedAt || 0).getTime();
      const rightDate = new Date(right.lastMessageAt || right.updatedAt || 0).getTime();
      return rightDate - leftDate;
    });

    return res.json({
      conversations: conversations.map(serializeConversation),
      access: {
        role: adminContext.role,
        branch: adminContext.branch,
        canViewAllBranches: adminContext.isOwnerLike,
        adminId: adminContext.user?._id ? String(adminContext.user._id) : "",
        adminName: adminContext.displayName,
      },
    });
  } catch (error) {
    return sendError(res, error, "Failed to load admin conversations.");
  }
}

export async function getAdminConversationMessages(req, res) {
  try {
    const adminContext = await resolveAdminContext(req);
    let conversation = await findConversationForAdmin(
      req.params.conversationId,
      adminContext,
    );
    conversation = await ensureChatTicketId(conversation);

    if (conversation.request) {
      await reconcileSupport(mongoose.connection.db, conversation._id).catch((error) => console.warn('Support delivery pending:', error.message));
      conversation = await ChatConversation.findById(conversation._id);
    }
    await markTenantMessagesRead(conversation._id);

    const messages = await ChatMessage.find({ conversationId: conversation._id })
      .populate("senderId", "profileImage firstName lastName role")
      .sort({ createdAt: 1 })
      .lean();

    const tenantPhoto = conversation.tenantProfileImage || (await resolveTenantProfileImage({
      tenantId: conversation.tenantId,
      tenantEmail: conversation.tenantEmail,
      tenantUserId: conversation.tenantUserId,
      tenantProfileImage: conversation.tenantProfileImage,
    }));

    if (tenantPhoto && !conversation.tenantProfileImage) {
      conversation.tenantProfileImage = tenantPhoto;
      ChatConversation.updateOne({ _id: conversation._id }, { $set: { tenantProfileImage: tenantPhoto } }).catch(() => {});
    }

    messages.forEach((m) => {
      if (m.senderRole === "tenant" && !m.senderProfileImage && tenantPhoto) {
        m.senderProfileImage = tenantPhoto;
      }
    });

    return res.json({ conversation: serializeConversation(conversation), messages: messages.map(serializeMessage) });
  } catch (error) {
    return sendError(res, error, "Failed to load messages.");
  }
}

export async function sendAdminMessage(req, res) {
  try {
    const adminContext = await resolveAdminContext(req);
    const conversation = await findConversationForAdmin(
      req.params.conversationId,
      adminContext,
    );
    if (!conversation.request && conversation.satisfactionRating != null) throw conflict('Historical ratings are immutable.', 'ALREADY_RATED');

    if (conversation.request) {
      const attachments = await normalizeAttachments(req.body?.attachments, conversation._id);
      const message = normalizeMessage(req.body?.message, attachments.length > 0);
      const result = await persistMessage(mongoose.connection.db, currentConversation(conversation.toObject()),
        { ...adminContext.user, name: adminContext.displayName },
        { message, attachments, clientMessageId: String(req.body?.clientMessageId || ''), asAdmin: true });
      const serialized = serializeConversation(result.conversation);
      const sent = serializeMessage(result.message);
      emitToUser(result.conversation.tenantId, 'chat:message-new', { message: sent, conversationId: serialized.id });
      emitToChatAdmins(serialized.branch, 'chat:message-new', { message: sent, conversationId: serialized.id });
      emitToChatAdmins(serialized.branch, 'chat:conversation-updated', serialized);
      return res.json({ conversation: serialized, message: sent });
    }
    if (conversation.status === "closed") {
      throw createHttpError("This conversation is closed.", 400, "CONVERSATION_CLOSED");
    }

    const attachments = await normalizeAttachments(req.body?.attachments, conversation._id);
    const message = normalizeMessage(req.body?.message, attachments.length > 0);
    const result = await createMessageAndUpdateConversation({
      conversation,
      sender: {
        ...adminContext.user,
        displayName: adminContext.displayName,
      },
      senderRole: adminContext.senderRole,
      message,
      attachments,
      unreadTarget: "tenant",
      nextStatus: "waiting_tenant",
      statusNote: "Admin replied and is waiting for tenant response.",
    });

    await notifyTenantOfAdminReply(result.conversation, result.chatMessage);
    emitToUser(result.conversation.tenantId, "chat:message-new", {
      message: serializeMessage(result.chatMessage),
      conversationId: String(result.conversation._id),
    });
    emitToChatAdmins(
      result.conversation.branch,
      "chat:message-new",
      {
        message: serializeMessage(result.chatMessage),
        conversationId: String(result.conversation._id),
      },
    );
    emitToChatAdmins(
      result.conversation.branch,
      "chat:conversation-updated",
      serializeConversation(result.conversation),
    );

    return res.json({
      message: serializeMessage(result.chatMessage),
      conversation: serializeConversation(result.conversation),
    });
  } catch (error) {
    return sendError(res, error, "Failed to send message.");
  }
}

export async function markAdminConversationRead(req, res) {
  try {
    const adminContext = await resolveAdminContext(req);
    const conversation = await findConversationForAdmin(
      req.params.conversationId,
      adminContext,
    );

    await markTenantMessagesRead(conversation._id);
    const updated = await ChatConversation.findById(conversation._id);

    return res.json({ conversation: serializeConversation(updated) });
  } catch (error) {
    return sendError(res, error, "Failed to mark conversation as read.");
  }
}

export async function assignAdminConversation(req, res) {
  try {
    const adminContext = await resolveAdminContext(req);
    const conversation = await findConversationForAdmin(
      req.params.conversationId,
      adminContext,
    );

    let targetAdmin = adminContext.user;
    const requestedAdminId = req.body?.assignedAdminId;
    if (requestedAdminId && requestedAdminId !== "me") {
      if (!mongoose.Types.ObjectId.isValid(requestedAdminId)) {
        throw createHttpError("Assigned admin not found.", 404, "ADMIN_NOT_FOUND");
      }

      targetAdmin = await User.findById(requestedAdminId)
        .select("_id firstName lastName name fullName email role branch accountStatus isArchived")
        .lean();

      const targetRole = String(targetAdmin?.role || "").toLowerCase();
      if (
        !targetAdmin ||
        targetAdmin.isArchived ||
        targetAdmin.accountStatus === "banned" ||
        !ADMIN_ROLES.has(targetRole)
      ) {
        throw createHttpError("Assigned admin not found.", 404, "ADMIN_NOT_FOUND");
      }

      if (!adminContext.isOwnerLike && targetAdmin.branch !== adminContext.branch) {
        throw createHttpError(
          "You do not have access to assign this admin.",
          403,
          "ADMIN_ASSIGNMENT_DENIED",
        );
      }
    }

    if (conversation.request) {
      const updated = await mutateConversation(mongoose.connection.db, conversation._id, async (doc) => {
        if (doc.status === 'closed' || doc.satisfaction || doc.satisfactionRating != null) throw conflict('Completed support is immutable.');
        return { assignedAdminId: targetAdmin?._id || null, assignedAdminName: displayName(targetAdmin, 'Admin'), updatedAt: new Date() };
      });
      return res.json({ conversation: serializeConversation(updated) });
    }
    conversation.assignedAdminId = targetAdmin?._id || null;
    conversation.assignedAdminName = displayName(targetAdmin, "Admin");
    await conversation.save();

    emitToChatAdmins(
      conversation.branch,
      "chat:conversation-updated",
      serializeConversation(conversation),
    );

    return res.json({ conversation: serializeConversation(conversation) });
  } catch (error) {
    return sendError(res, error, "Failed to assign conversation.");
  }
}

async function updateSupportRequestStatus(req, res, conversation, adminContext, status) {
  const note = normalizeOptionalNote(req.body?.note);
  if (status === 'resolved' && !note) throw createHttpError('Describe how this concern was resolved.', 400, 'RESOLUTION_NOTE_REQUIRED');
  const updated = await mutateConversation(mongoose.connection.db, conversation._id, async (doc) => {
    assertAdminConversationAccess(doc, adminContext);
    if (req.body?.requestId && req.body.requestId !== doc.request?.id) throw conflict('Wrong concern identity.', 'REQUEST_MISMATCH');
    if (req.body?.revision != null && req.body.revision !== (doc.supportRevision || 0)) throw conflict('This concern changed. Refresh before updating.');
    if (doc.status === 'closed' || doc.satisfaction || doc.satisfactionRating != null) throw conflict('Completed support is immutable.');
    if (doc.request && doc.status === status) return null;
    if (doc.request) assertTransition(doc, status);
    if (doc.supportNotification?.pending) throw conflict('Previous status notification is pending. Retry shortly.');
    const now = new Date();
    const fields = {
      status, assignedAdminId: adminContext.user._id, assignedAdminName: adminContext.displayName, updatedAt: now,
      ...(status === 'resolved' ? { resolvedAt: now, resolvedBy: adminContext.user._id, closingNote: note,
        resolutionDurationMinutes: Math.max(0, Math.round((now - new Date(doc.createdAt)) / 60000)) } : {}),
      ...(doc.status === 'resolved' && status === 'in_review' ? { resolvedAt: null, resolvedBy: null, resolutionDurationMinutes: null, closingNote: '' } : {}),
      ...(status === 'closed' ? { closedAt: now, closedBy: adminContext.user._id, closingNote: note || 'Closed by admin.' } : {}),
      statusHistory: [...(doc.statusHistory || []), { eventId: String(new mongoose.Types.ObjectId()), eventType: status === 'resolved' ? 'admin_resolved' : 'status_changed', status, note, actorId: adminContext.user._id, actorName: adminContext.displayName, createdAt: now }],
      supportNotification: { pending: true, eventId: String(new mongoose.Types.ObjectId()), status,
        adminName: adminContext.displayName, message: status === 'resolved' ? 'Your support inquiry was marked as resolved. Please confirm if your concern has been addressed.' : note || `Your concern is now ${status.replace(/_/g, ' ')}.` },
    };
    if (!doc.request) {
      const owner = doc.tenantUserId ? null : await mongoose.connection.db.collection('users').findOne({ _id: doc.tenantId });
      fields.tenantUserId = doc.tenantUserId || owner?.user_id || '';
      fields.statusHistory = fields.statusHistory.map((entry) => entry.eventType || entry.status !== 'resolved'
        ? entry : { ...entry, eventType: 'historical_resolved' });
      const request = { id: String(new mongoose.Types.ObjectId()), tenantUserId: fields.tenantUserId,
        branch: doc.branch, createdAt: doc.createdAt, satisfaction: null, satisfactionRating: null };
      for (const key of ['concern', 'category', 'priority', 'assignedAdminId', 'assignedAdminName', 'resolvedAt', 'resolvedBy', 'closingNote', 'statusHistory', 'updatedAt', 'status']) request[key] = fields[key] ?? doc[key];
      fields.request = request;
    }
    return fields;
  });
  // A saved status remains saved if delivery fails; the shared pending event is retried on reads/mobile reconciliation.
  await reconcileSupport(mongoose.connection.db, conversation._id).catch((error) => console.warn('Support delivery pending:', error.message));
  const serialized = serializeConversation(updated);
  emitToChatAdmins(serialized.branch, 'chat:conversation-updated', serialized);
  return res.json({ conversation: serialized });
}

export async function updateAdminConversationStatus(req, res) {
  try {
    const adminContext = await resolveAdminContext(req);
    const conversation = await findConversationForAdmin(
      req.params.conversationId,
      adminContext,
    );
    if (!conversation.request && conversation.satisfactionRating != null) throw conflict('Historical ratings are immutable.', 'ALREADY_RATED');

    const status = String(req.body?.status || "").trim().toLowerCase();
    if (!VALID_STATUSES.has(status)) {
      throw createHttpError("Invalid conversation status.", 400, "INVALID_STATUS");
    }
    if (conversation.request || status === 'resolved') return await updateSupportRequestStatus(req, res, conversation, adminContext, status);
    if (status === "closed") {
      throw createHttpError(
        "Use close conversation to close this chat.",
        400,
        "USE_CLOSE_ENDPOINT",
      );
    }
    if (status === "resolved") {
      throw createHttpError(
        "Only the tenant can confirm that a concern is resolved.",
        409,
        "TENANT_CONFIRMATION_REQUIRED",
      );
    }
    if (conversation.status === "closed") {
      throw createHttpError("This conversation is closed.", 400, "CONVERSATION_CLOSED");
    }

    const note = normalizeOptionalNote(req.body?.note);
    if (conversation.status !== status) {
      conversation.status = status;
      conversation.statusHistory.push({
        status,
        note,
        actorId: adminContext.user?._id || null,
        actorName: adminContext.displayName,
        createdAt: new Date(),
      });
      await conversation.save();
    }

    emitToChatAdmins(
      conversation.branch,
      "chat:conversation-updated",
      serializeConversation(conversation),
    );

    return res.json({ conversation: serializeConversation(conversation) });
  } catch (error) {
    return sendError(res, error, "Failed to update conversation status.");
  }
}

export async function updateAdminConversationPriority(req, res) {
  try {
    const adminContext = await resolveAdminContext(req);
    const conversation = await findConversationForAdmin(
      req.params.conversationId,
      adminContext,
    );

    const priority = normalizePriority(req.body?.priority);
    if (conversation.request) {
      const updated = await mutateConversation(mongoose.connection.db, conversation._id, async (doc) => {
        if (doc.status === 'closed' || doc.satisfaction || doc.satisfactionRating != null) throw conflict('Completed support is immutable.');
        return { priority, updatedAt: new Date() };
      });
      return res.json({ conversation: serializeConversation(updated) });
    }
    conversation.priority = priority;
    await conversation.save();

    emitToChatAdmins(
      conversation.branch,
      "chat:conversation-updated",
      serializeConversation(conversation),
    );

    return res.json({ conversation: serializeConversation(conversation) });
  } catch (error) {
    return sendError(res, error, "Failed to update conversation priority.");
  }
}

export async function closeAdminConversation(req, res) {
  try {
    const adminContext = await resolveAdminContext(req);
    const conversation = await findConversationForAdmin(
      req.params.conversationId,
      adminContext,
    );
    if (!conversation.request && conversation.satisfactionRating != null) throw conflict('Historical ratings are immutable.', 'ALREADY_RATED');
    const closingNote = normalizeNote(
      req.body?.note,
      "Please enter a closing note.",
    );

    if (conversation.request) return await updateSupportRequestStatus(req, res, conversation, adminContext, "closed");
    if (conversation.status !== "closed") {
      const now = new Date();
      const createdAtTime = new Date(conversation.createdAt || now).getTime();
      const durationMinutes = Math.max(0, Math.round((now.getTime() - createdAtTime) / (60 * 1000)));

      conversation.status = "closed";
      conversation.closedAt = now;
      conversation.closedBy = adminContext.user?._id || null;
      conversation.closingNote = closingNote;
      if (!conversation.resolutionDurationMinutes) {
        conversation.resolutionDurationMinutes = durationMinutes;
      }
      conversation.statusHistory.push({
        status: "closed",
        note: closingNote,
        actorId: adminContext.user?._id || null,
        actorName: adminContext.displayName,
        createdAt: now,
      });
      await conversation.save();
    }

    emitToChatAdmins(
      conversation.branch,
      "chat:conversation-updated",
      serializeConversation(conversation),
    );

    return res.json({ conversation: serializeConversation(conversation) });
  } catch (error) {
    return sendError(res, error, "Failed to close conversation.");
  }
}

/**
 * Automatically closes conversations in "waiting_tenant" or "resolved" status
 * that have had no activity for more than inactivityMinutes (default: 15 minutes).
 *
 * Emits real-time socket events and generates a system closing message.
 */
export async function autoCloseInactiveChatConversations({
  inactivityMinutes = 15,
} = {}) {
  const cutoff = new Date(Date.now() - inactivityMinutes * 60 * 1000);
  const now = new Date();

  const inactiveConversations = await ChatConversation.find({
    request: { $exists: false },
    status: { $in: ["waiting_tenant", "resolved"] },
    $or: [
      { lastMessageAt: { $lt: cutoff, $ne: null } },
      { lastMessageAt: null, updatedAt: { $lt: cutoff } },
      { lastMessageAt: null, createdAt: { $lt: cutoff } },
    ],
  });

  if (!inactiveConversations.length) return 0;

  let closedCount = 0;
  for (const conversation of inactiveConversations) {
    try {
      const isResolved = conversation.status === "resolved";
      const closingNote = isResolved
        ? "Automatically closed after resolution confirmation."
        : `Automatically closed after ${inactivityMinutes} minutes of inactivity.`;

      const createdAtTime = new Date(conversation.createdAt || now).getTime();
      const durationMinutes = Math.max(0, Math.round((now.getTime() - createdAtTime) / (60 * 1000)));

      conversation.status = "closed";
      conversation.closedAt = now;
      conversation.closedBy = null;
      conversation.closingNote = closingNote;
      if (!conversation.resolutionDurationMinutes) {
        conversation.resolutionDurationMinutes = durationMinutes;
      }
      conversation.statusHistory.push({
        status: "closed",
        note: closingNote,
        actorId: null,
        actorName: "System Scheduler",
        createdAt: now,
      });
      await conversation.save();

      const systemMessage = await ChatMessage.create({
        conversationId: conversation._id,
        senderId: null,
        senderUserId: "",
        senderName: "System",
        senderRole: "system",
        senderProfileImage: "",
        message: isResolved
          ? "This conversation has been closed following resolution confirmation. Feel free to send a message anytime if you need assistance with a new concern."
          : `This conversation has been automatically closed after ${inactivityMinutes} minutes of inactivity. If you need further assistance, please send a message to start a new support request.`,
        attachments: [],
        createdAt: now,
        updatedAt: now,
      });

      const serializedMsg = serializeMessage(systemMessage);
      const serializedConv = serializeConversation(conversation);

      if (conversation.branch) {
        emitToChatAdmins(conversation.branch, "chat:message-new", {
          message: serializedMsg,
          conversationId: String(conversation._id),
        });
        emitToChatAdmins(
          conversation.branch,
          "chat:conversation-updated",
          serializedConv,
        );
      }

      if (conversation.tenantId) {
        emitToUser(conversation.tenantId, "chat:message-new", {
          message: serializedMsg,
          conversationId: String(conversation._id),
        });
        emitToUser(conversation.tenantId, "chat:conversation-updated", serializedConv);
      }

      closedCount += 1;
    } catch (err) {
      console.error(`Failed to auto-close conversation ${conversation._id}:`, err.message);
    }
  }

  return closedCount;
}

