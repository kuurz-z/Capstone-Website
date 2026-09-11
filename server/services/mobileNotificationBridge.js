import mongoose from "mongoose";
import announcementAudiencePolicy from "../mobile/services/announcementAudience.service.js";

const {
  buildTenantContext,
  canTenantViewAnnouncement,
} = announcementAudiencePolicy;

/**
 * ============================================================================
 * MOBILE NOTIFICATION BRIDGE
 * ============================================================================
 *
 * Canonical implementation backing the mobile app's GET /api/m/notifications,
 * PATCH /api/m/notifications/read-all, and PATCH /api/m/notifications/:id/read.
 *
 * Phase 4 cutover audit found this domain had NO canonical route at all —
 * neither a bridge nor the vendored mobile router (server/mobile/routes)
 * defines /notifications, so it would 404 against this backend today even
 * though it's an ACTIVE, frequently-used mobile feature (home feed +
 * AuthContext unread-count polling). This was ported as a direct behavioral
 * copy of the standalone mobile backend's controllers/notification.controller.js
 * (sanitizeStoredNotification/normalizePriority), on the assumption that the
 * `notifications` collection is written in that same `user_id`/`body`/`read`
 * shape here too.
 *
 * BUG FOUND (bill-release notification audit): that assumption doesn't hold
 * for this canonical backend's OWN notification writer. models/Notification.js
 * + services/notifications/notificationService.js persist documents shaped
 * `{ userId: <ObjectId ref User>, message, isRead, actionUrl, entityId, ... }`
 * — every field name this bridge's `find({ user_id: userId })` query and
 * sanitizeStoredNotification() expected was wrong for that writer. Since
 * `userId` there is a Mongo _id (not the tenant's business `user_id` string),
 * this was a filter-VALUE mismatch as well as a field-NAME mismatch: the
 * query matched zero documents, so the mobile app's unread badge count
 * (and any bill-released/payment/etc. notification the canonical backend
 * creates) never appeared, no matter how correctly it was created and
 * pushed. Fixed by matching EITHER shape (buildOwnerFilter/readBothShapes
 * below) rather than assuming one is authoritative — safe regardless of
 * whether anything still writes the legacy shape.
 *
 * Deliberately uses the raw MongoDB driver (mongoose.connection.db), matching
 * every other mobile bridge in this codebase, since `notifications` is not a
 * canonical Mongoose-modeled collection here.
 */

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

const TENANT_NOTIFICATION_ROLES = new Set(["tenant", "resident"]);
const APPLICANT_NOTIFICATION_ROLES = new Set([
  "applicant",
  "prospect",
  "reservation_applicant",
  "pending_tenant",
]);

export function isApplicantLifecycleNotification(notification = {}) {
  const roleAtCreation = normalizeString(
    notification.role_at_creation || notification.roleAtCreation || "",
  ).toLowerCase();
  if (TENANT_NOTIFICATION_ROLES.has(roleAtCreation)) return false;
  if (APPLICANT_NOTIFICATION_ROLES.has(roleAtCreation)) return true;

  // Legacy records predate role stamping. Infer only from strong lifecycle
  // signals so tenant billing/payment records are never hidden due to copy.
  const data = notification.data && typeof notification.data === "object"
    ? notification.data
    : {};
  const lifecycleRoute = [
    notification.type,
    notification.category,
    notification.source,
    notification.url,
    notification.actionUrl,
    notification.entityType,
    data.type,
    data.category,
    data.screen,
    data.url,
  ].map((value) => normalizeString(value).toLowerCase()).join(" ");
  if (/(^|[\s_./-])(applicant|application|reservation|visit)(?=$|[\s_./-])/.test(lifecycleRoute)) {
    return true;
  }

  const reservationId = normalizeString(
    notification.reservation_id || notification.reservationId
      || data.reservation_id || data.reservationId
      || (normalizeString(notification.entityType).toLowerCase() === "reservation"
        ? String(notification.entityId || "")
        : ""),
  );
  const billingId = normalizeString(
    notification.billing_id || notification.billingId || notification.bill_id
      || data.billing_id || data.billingId || data.bill_id || "",
  );
  return Boolean(reservationId && !billingId);
}

export function filterNotificationsForTenantLifecycle(currentRole, notifications = []) {
  if (normalizeString(currentRole).toLowerCase() === 'applicant') {
    return notifications.filter(notification => !['water', 'electricity'].includes(notification.data?.utilityType));
  }
  if (!TENANT_NOTIFICATION_ROLES.has(normalizeString(currentRole).toLowerCase())) {
    return [...notifications];
  }
  return notifications.filter((notification) => !isApplicantLifecycleNotification(notification));
}

function normalizePriority(value) {
  const raw = normalizeString(value).toLowerCase();
  if (raw === "high" || raw === "urgent" || raw === "critical") return "high";
  if (raw === "low" || raw === "info") return "low";
  return "normal";
}

function sanitizePayload(data = {}) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const payload = {};
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined) payload[key] = value;
  });
  return payload;
}

function isHexObjectId(val) {
  return typeof val === "string" && /^[0-9a-fA-F]{24}$/.test(val.trim());
}

// Matches a stored notification document to its tenant owner regardless of
// which writer produced it: the legacy standalone-backend shape (user_id:
// <string business id>) or this canonical backend's own Notification model
// shape (userId: <Mongo ObjectId>). See the header comment for why both are
// needed — this is the actual fix for the "tenant never sees a notification"
// bug, not a redesign of either shape.
function buildOwnerFilter(userIdString, userMongoId) {
  const clauses = [];
  if (userIdString) clauses.push({ user_id: userIdString });
  if (userMongoId) clauses.push({ userId: userMongoId });
  if (!clauses.length) return { _id: null }; // no identity supplied — match nothing, never everything
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

// Canonical Notification documents (models/Notification.js) don't set a
// `category` field at all — only `type`. Infer the mobile app's expected
// category vocabulary (see app/(tabs)/announcements.jsx getCategoryColor)
// from the canonical type enum so a bill-release notification is labeled
// "billing" instead of the generic default.
function inferCategoryFromType(type) {
  const value = normalizeString(type).toLowerCase();
  if (value.startsWith("bill_") || value === "penalty_applied" || value === "payment_approved" || value === "payment_rejected") {
    return "billing";
  }
  if (value.startsWith("reservation_") || value === "grace_period_warning" || value === "move_in_reminder") return "reservation";
  if (value.startsWith("contract_")) return "account";
  if (value.startsWith("account_")) return "account";
  if (value === "maintenance_update") return "maintenance";
  if (value === "chat_reply") return "assistant";
  return "";
}

function resolveAuthorName(doc = {}, authorNameMap = new Map(), defaultFallback = "LilyCrest Admin") {
  const candidates = [
    doc.author_name,
    doc.authorName,
    doc.publishedByName,
    doc.publishedBy,
    doc.postedBy,
    doc.source_label,
    doc.createdBy,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === "object") {
      if (["ObjectId", "ObjectID"].includes(candidate._bsontype) || candidate.constructor?.name === "ObjectId") {
        const idStr = candidate.toString();
        if (authorNameMap.has(idStr)) return authorNameMap.get(idStr);
      } else {
        const name = `${candidate.firstName || ""} ${candidate.lastName || ""}`.trim()
          || candidate.name || candidate.fullName || candidate.username || candidate.email;
        if (name && !isHexObjectId(name)) return name;
      }
    } else if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (!trimmed) continue;
      if (isHexObjectId(trimmed)) {
        if (authorNameMap.has(trimmed)) return authorNameMap.get(trimmed);
      } else {
        return trimmed;
      }
    }
  }

  return defaultFallback;
}

function resolveChatMessageId(doc = {}, conversationId = "") {
  const direct = normalizeString(doc.message_id || doc.messageId || doc.data?.message_id || doc.data?.messageId);
  if (direct) return direct;

  const dedupeKey = normalizeString(doc.dedupeKey || doc.event_key || doc.eventKey);
  if (!dedupeKey.startsWith("chat_reply:")) return "";
  const [, dedupeConversationId, ...messageParts] = dedupeKey.split(":");
  if (!dedupeConversationId || !messageParts.length) return "";
  if (conversationId && dedupeConversationId !== conversationId) return "";
  return normalizeString(messageParts.join(":"));
}

function sanitizeStoredNotification(doc = {}, authorNameMap = new Map()) {
  const authorName = resolveAuthorName(doc, authorNameMap, "LilyCrest System");
  const type = normalizeString(doc.type || "notification") || "notification";
  // entityId/entityType are how the canonical Notification model attaches a
  // bill or Contract reference (models/Notification.js +
  // notificationService.js); the legacy shape used data payload fields.
  const entityType = normalizeString(doc.entityType).toLowerCase();
  const entityId = normalizeString(String(doc.entityId || ""));
  const isCanonicalBillEntity = entityType === "bill" && entityId;
  const isCanonicalContractEntity = entityType === "contract" && entityId;
  const isCanonicalAnnouncementEntity = entityType === "announcement" && entityId;
  const isCanonicalChatEntity = entityType === "chat" && entityId;
  const isCanonicalMaintenanceEntity = entityType === "maintenance" && entityId;
  const data = sanitizePayload(doc.data);
  const chatConversationId = normalizeString(
    doc.conversation_id || doc.data?.conversation_id || (isCanonicalChatEntity ? entityId : ""),
  );
  const chatMessageId = resolveChatMessageId(doc, chatConversationId);
  if (isCanonicalBillEntity) {
    data.type ||= type;
    data.billing_id ||= entityId;
    data.screen ||= "billing";
    data.url ||= `/bill-details?billId=${entityId}`;
  }
  if (isCanonicalContractEntity) {
    data.type ||= type;
    data.contract_id ||= entityId;
    data.screen ||= "contract";
    data.url ||= "/contract-viewer";
  }
  if (isCanonicalAnnouncementEntity) {
    data.type ||= "announcement";
    data.announcement_id ||= entityId;
    data.screen ||= "announcements";
    data.url ||= "/(tabs)/announcements";
  }
  if (isCanonicalChatEntity) {
    data.type ||= "chat_reply";
    data.conversation_id ||= entityId;
    if (chatMessageId) data.message_id ||= chatMessageId;
    data.screen ||= "chat";
  }
  if (isCanonicalMaintenanceEntity) {
    data.type ||= type;
    data.request_id ||= entityId;
    data.screen ||= "maintenance";
  }
  return {
    notification_id: doc.notification_id || doc._id?.toString?.() || "",
    title: normalizeString(doc.title) || "Notification",
    body: normalizeString(doc.body || doc.content || doc.message || ""),
    content: normalizeString(doc.content || doc.body || doc.message || ""),
    category: normalizeString(doc.category) || inferCategoryFromType(type) || "General",
    priority: normalizePriority(doc.priority),
    is_urgent: doc.is_urgent === true || normalizePriority(doc.priority) === "high",
    author_name: authorName,
    source_label: authorName,
    created_at: doc.created_at || doc.createdAt || doc.updated_at || doc.updatedAt || new Date(),
    updated_at: doc.updated_at || doc.updatedAt || doc.created_at || doc.createdAt || new Date(),
    type,
    source: normalizeString(doc.source || "system") || "system",
    data,
    // Canonical actionUrl is a web route. Contract notifications need the
    // Expo route when projected through the mobile bridge.
    url: normalizeString(
      doc.url || doc.data?.url
        || (isCanonicalContractEntity ? "/contract-viewer" : "")
        || (isCanonicalBillEntity ? `/bill-details?billId=${entityId}` : "")
        || (isCanonicalChatEntity ? "/(tabs)/chatbot" : "")
        || (isCanonicalMaintenanceEntity ? "/(tabs)/services" : "")
        || doc.actionUrl || "",
    ),
    read: doc.read === true || doc.isRead === true,
    announcement_id: normalizeString(
      doc.announcement_id || doc.data?.announcement_id || (isCanonicalAnnouncementEntity ? entityId : ""),
    ),
    billing_id: normalizeString(
      doc.billing_id || doc.data?.billing_id || doc.data?.bill_id
        || (isCanonicalBillEntity ? entityId : ""),
    ),
    contract_id: normalizeString(
      doc.contract_id || doc.data?.contract_id || (isCanonicalContractEntity ? entityId : ""),
    ),
    request_id: normalizeString(
      doc.request_id || doc.data?.request_id || (isCanonicalMaintenanceEntity ? entityId : ""),
    ),
    conversation_id: chatConversationId,
    message_id: chatMessageId,
    session_id: normalizeString(doc.session_id || doc.data?.session_id || ""),
    reservation_id: normalizeString(doc.reservation_id || doc.data?.reservation_id || ""),
    role_at_creation: normalizeString(doc.role_at_creation || doc.roleAtCreation || ""),
    // Canonical Notification documents use `dedupeKey` (models/Notification.js).
    // Older mobile writers used event_key/eventKey. Preserve all three shapes,
    // but expose one stable event key to the read/dismissal pipeline.
    dedup_key: normalizeString(doc.dedupeKey || doc.event_key || doc.eventKey || ""),
  };
}

function getAnnouncementDateValue(doc = {}) {
  return doc.publishedAt || doc.sentAt || doc.created_at || doc.createdAt || doc.updated_at || doc.updatedAt || null;
}

function normalizeAnnouncementPriority(doc = {}) {
  const rawPriority = doc.priority || doc.importance || doc.type || "normal";
  if (/high|urgent|important/i.test(String(rawPriority))) return "high";
  if (/low|info/i.test(String(rawPriority))) return "low";
  return "normal";
}

function normalizeAnnouncementNotification(doc = {}, authorNameMap = new Map()) {
  const announcementId = normalizeString(doc.announcement_id || doc._id?.toString?.());
  const createdAt = getAnnouncementDateValue(doc) || new Date();
  const priority = normalizeAnnouncementPriority(doc);
  const category = normalizeString(doc.category || doc.type || "Announcement") || "Announcement";
  const body = normalizeString(doc.content || doc.message || doc.body || doc.description || "");
  const authorName = resolveAuthorName(doc, authorNameMap, "LilyCrest Admin");

  return {
    notification_id: announcementId || `announcement:${createdAt instanceof Date ? createdAt.getTime() : String(createdAt)}`,
    title: normalizeString(doc.title || doc.subject || "Announcement") || "Announcement",
    body,
    content: body,
    category,
    priority,
    is_urgent: doc.is_urgent === true || doc.isUrgent === true || priority === "high",
    author_name: authorName,
    source_label: authorName,
    created_at: createdAt,
    updated_at: doc.updated_at || doc.updatedAt || createdAt,
    type: "announcement",
    source: "announcement",
    data: {
      type: "announcement",
      announcement_id: announcementId,
      screen: "announcements",
      url: "/(tabs)/announcements",
    },
    url: "/(tabs)/announcements",
    read: doc.read === true,
    announcement_id: announcementId,
    billing_id: "",
    request_id: "",
    session_id: "",
    reservation_id: "",
    dedup_key: announcementId ? `announcement:${announcementId}` : "",
  };
}

function buildNotificationKey(notification = {}) {
  const preferred = normalizeString(notification.dedup_key);
  if (preferred) return preferred;

  if (notification.announcement_id) return `announcement:${notification.announcement_id}`;

  // A persisted notification row is one event. Its immutable database/business
  // id is therefore the safest fallback identity: two admin replies or two
  // maintenance updates for the same source record receive different ids and
  // remain independently dismissible. The previous source-level fallbacks
  // below collapsed those later events into the dismissed historical one.
  const notificationId = normalizeString(notification.notification_id);
  if (notificationId) return `notification:${notificationId}`;

  if (notification.billing_id && notification.type) return `${notification.type}:${notification.billing_id}`;
  if (notification.request_id && notification.type) return `${notification.type}:${notification.request_id}`;
  if (notification.session_id && notification.type) return `${notification.type}:${notification.session_id}`;
  if (notification.reservation_id && notification.type) return `${notification.type}:${notification.reservation_id}`;

  return [
    normalizeString(notification.type || "notification"),
    normalizeString(notification.title),
    normalizeString(notification.body || notification.content),
    notification.created_at ? new Date(notification.created_at).toISOString() : "no-date",
  ].join(":");
}

// Dismissals/read receipts written by older releases used source-level keys.
// Continue recognizing those rows so an upgrade never resurrects already
// dismissed history, while all new writes use buildNotificationKey()'s
// event-specific identity above.
function buildLegacyNotificationKeys(notification = {}) {
  const keys = [];
  if (notification.announcement_id) keys.push(`announcement:${notification.announcement_id}`);
  if (notification.billing_id && notification.type) keys.push(`${notification.type}:${notification.billing_id}`);
  if (notification.request_id && notification.type) keys.push(`${notification.type}:${notification.request_id}`);
  if (notification.session_id && notification.type) keys.push(`${notification.type}:${notification.session_id}`);
  if (notification.reservation_id && notification.type) keys.push(`${notification.type}:${notification.reservation_id}`);
  keys.push([
    normalizeString(notification.type || "notification"),
    normalizeString(notification.title),
    normalizeString(notification.body || notification.content),
    notification.created_at ? new Date(notification.created_at).toISOString() : "no-date",
  ].join(":"));
  return [...new Set(keys.filter(Boolean))];
}

function notificationIdentityKeys(notification = {}) {
  return [...new Set([buildNotificationKey(notification), ...buildLegacyNotificationKeys(notification)].filter(Boolean))];
}

function matchesNotificationIdentity(notification, rawKey) {
  const candidate = normalizeString(rawKey);
  if (!candidate) return false;
  return notification.notification_id === candidate
    || notificationIdentityKeys(notification).includes(candidate);
}

function sortNotifications(list = []) {
  return [...list].sort((left, right) => {
    const leftTime = left?.created_at ? new Date(left.created_at).getTime() : 0;
    const rightTime = right?.created_at ? new Date(right.created_at).getTime() : 0;
    return rightTime - leftTime;
  });
}

const ACTIVE_FILTER = {
  $or: [
    { is_active: true },
    { isActive: true },
    { is_active: { $exists: false }, isActive: { $exists: false } },
  ],
};
const NOT_ARCHIVED_FILTER = { isArchived: { $ne: true } };

// `userId` here matches an announcement's OWN private-recipient field, which
// (like the notifications collection) may be stored as either the tenant's
// business `user_id` string or a Mongo `userId` ObjectId depending on which
// writer created it — pass both identity values, matched against their own
// correctly-typed field, not the same raw value against both field names.
function visibilityFilter(userIdString, userMongoId) {
  return {
    $or: [
      { is_private: { $ne: true }, isPrivate: { $ne: true } },
      ...(userIdString ? [{ is_private: true, user_id: userIdString }] : []),
      ...(userMongoId ? [{ isPrivate: true, userId: userMongoId }] : []),
    ],
  };
}

function getLinkedAnnouncementId(doc = {}) {
  const type = normalizeString(doc.type).toLowerCase();
  if (type !== "announcement") return "";
  return normalizeString(
    doc.announcement_id
      || doc.data?.announcement_id
      || (normalizeString(doc.entityType).toLowerCase() === "announcement" ? String(doc.entityId || "") : ""),
  );
}

async function loadAuthorizedSources(db, userId, userMongoId, { storedLimit = 200, announcementLimit = 200 } = {}) {
  const [storedNotifications, announcementCandidates, tenantContext] = await Promise.all([
    db.collection("notifications")
      .find(buildOwnerFilter(userId, userMongoId))
      .sort({ created_at: -1, updated_at: -1, createdAt: -1 })
      .limit(storedLimit)
      .toArray()
      .catch(() => []),
    db.collection("announcements")
      .find({ $and: [ACTIVE_FILTER, NOT_ARCHIVED_FILTER, visibilityFilter(userId, userMongoId)] })
      .sort({ created_at: -1, createdAt: -1 })
      .limit(announcementLimit)
      .toArray()
      .catch(() => []),
    buildTenantContext(db, { userId, userMongoId }),
  ]);

  const announcements = announcementCandidates.filter((announcement) =>
    canTenantViewAnnouncement({ announcement, tenantContext }));
  const visibleAnnouncementIds = new Set(
    announcements.flatMap((announcement) => [
      normalizeString(announcement.announcement_id),
      normalizeString(announcement._id?.toString?.()),
    ]).filter(Boolean),
  );

  const authorizedStoredNotifications = storedNotifications.filter((notification) => {
    if (normalizeString(notification.type).toLowerCase() !== "announcement") return true;
    const announcementId = getLinkedAnnouncementId(notification);
    return Boolean(announcementId) && visibleAnnouncementIds.has(announcementId);
  });

  return { storedNotifications: authorizedStoredNotifications, announcements };
}

/**
 * List the authenticated tenant's merged notifications (stored notifications
 * + visible announcements), with read-state applied. Identity is server-
 * resolved (req.mobileTenant.user_id / ._id) — never from client input.
 *
 * userId: the tenant's business `user_id` string (legacy/standalone-backend
 * notification shape). userMongoId: the tenant's Mongo `_id` ObjectId (this
 * canonical backend's own Notification model shape — see buildOwnerFilter).
 * Both are matched so a notification is found regardless of which writer
 * created it.
 */
async function listUserNotifications(db, userId, userMongoId, currentRole = "") {
  const { storedNotifications, announcements } = await loadAuthorizedSources(
    db,
    userId,
    userMongoId,
    { storedLimit: 120, announcementLimit: 200 },
  );

  // Collect all author/publishedBy/createdBy ObjectId references to resolve admin names
  const authorIds = new Set();
  const lifecycleVisibleNotifications = filterNotificationsForTenantLifecycle(
    currentRole,
    storedNotifications,
  );
  [...lifecycleVisibleNotifications, ...announcements].forEach((doc) => {
    [doc.author_name, doc.authorName, doc.publishedBy, doc.postedBy, doc.createdBy, doc.source_label].forEach((val) => {
      if (!val) return;
      if (typeof val === "object" && (["ObjectId", "ObjectID"].includes(val._bsontype) || val.constructor?.name === "ObjectId")) {
        authorIds.add(val.toString());
      } else if (typeof val === "string" && isHexObjectId(val)) {
        authorIds.add(val.trim());
      }
    });
  });

  const authorNameMap = new Map();
  if (authorIds.size > 0 && typeof db.collection === "function") {
    try {
      const { ObjectId } = mongoose.Types;
      const mongoIds = Array.from(authorIds).map((id) => {
        try { return new ObjectId(id); } catch (_) { return null; }
      }).filter(Boolean);

      const users = await db.collection("users").find({
        $or: [
          { _id: { $in: mongoIds } },
          { user_id: { $in: Array.from(authorIds) } },
        ],
      }).toArray();

      users.forEach((u) => {
        const fullName = `${u.firstName || ""} ${u.lastName || ""}`.trim()
          || u.name || u.fullName || u.username;
        let displayName = fullName;
        if (u.role === "admin" || u.role === "superadmin" || u.role === "branch_admin") {
          displayName = fullName ? `${fullName} (Admin)` : "LilyCrest Admin";
        }
        if (!displayName) displayName = "LilyCrest Admin";

        if (u._id) authorNameMap.set(u._id.toString(), displayName);
        if (u.user_id) authorNameMap.set(String(u.user_id), displayName);
      });
    } catch (_) {
      // Fallback gracefully
    }
  }

  const [readReceipts, readState, dismissalReceipts, clearState] = await Promise.all([
    db.collection("notification_reads").find({ user_id: userId }).project({ notification_key: 1, read_at: 1 }).toArray().catch(() => []),
    db.collection("notification_read_state").findOne({ user_id: userId }).catch(() => null),
    db.collection("notification_dismissals").find({ user_id: userId }).project({ notification_key: 1, dismissed_at: 1 }).toArray().catch(() => []),
    db.collection("notification_clear_state").findOne({ user_id: userId }).catch(() => null),
  ]);
  const readByKey = new Map(readReceipts
    .map((entry) => [normalizeString(entry.notification_key), entry.read_at || entry.created_at || null])
    .filter(([key]) => Boolean(key)));
  const allReadAt = readState?.all_read_at ? new Date(readState.all_read_at).getTime() : 0;
  const dismissedByKey = new Map(dismissalReceipts
    .map((entry) => [normalizeString(entry.notification_key), entry.dismissed_at || entry.created_at || null])
    .filter(([key]) => Boolean(key)));
  const clearedBefore = clearState?.cleared_before ? new Date(clearState.cleared_before).getTime() : 0;

  const mergedByKey = new Map();
  sortNotifications([
    ...lifecycleVisibleNotifications.map((doc) => sanitizeStoredNotification(doc, authorNameMap)),
    ...announcements.map((doc) => normalizeAnnouncementNotification(doc, authorNameMap)),
  ]).forEach((notification) => {
    const key = buildNotificationKey(notification);
    const normalizedNotification = {
      ...notification,
      priority: normalizePriority(notification.priority),
      content: normalizeString(notification.content || notification.body),
      body: normalizeString(notification.body || notification.content),
    };
    const notificationTime = normalizedNotification.created_at ? new Date(normalizedNotification.created_at).getTime() : 0;
    const identityKeys = notificationIdentityKeys(normalizedNotification);
    const stateAppliesToEvent = (stateByKey) => identityKeys.some((identityKey) => {
      if (!stateByKey.has(identityKey)) return false;
      if (identityKey === key) return true;
      const recordedAt = stateByKey.get(identityKey);
      const recordedTime = recordedAt ? new Date(recordedAt).getTime() : 0;
      // Legacy source-level rows apply only to events that already existed
      // when the user acted. A later event for the same bill/request/chat must
      // not inherit the old dismissal/read state.
      return recordedTime <= 0 || notificationTime <= recordedTime;
    });
    normalizedNotification.read = normalizedNotification.read === true
      || stateAppliesToEvent(readByKey)
      || (allReadAt > 0 && notificationTime <= allReadAt);

    // Dismissal/clear are per-tenant feed visibility only — they never
    // mutate the shared `notifications`/`announcements` document, so a
    // dismissed announcement stays fully intact (and fully visible to
    // every other tenant in its audience). "Clear" is a cutoff, not a
    // permanent hide-all: only items that already existed at clear time
    // are hidden; anything created after clearedBefore (a new
    // notification, or a newly published announcement) still appears.
    if (stateAppliesToEvent(dismissedByKey)) return;
    if (clearedBefore > 0 && notificationTime <= clearedBefore) return;

    const existing = mergedByKey.get(key);
    if (!existing) {
      mergedByKey.set(key, normalizedNotification);
      return;
    }
    if (normalizedNotification.source === "announcement" && existing.source !== "announcement") {
      mergedByKey.set(key, normalizedNotification);
    }
  });

  return sortNotifications(Array.from(mergedByKey.values())).slice(0, 100);
}

/**
 * Mark one notification (own only — resolved by scanning the caller's own
 * stored notifications/visible announcements, never a raw client-supplied
 * collection lookup) read.
 */
async function markNotificationRead(db, userId, notificationKeyRaw, userMongoId) {
  const notificationKey = normalizeString(notificationKeyRaw);
  if (!notificationKey) return { status: 400, detail: "notificationId is required." };

  const { storedNotifications: stored, announcements } = await loadAuthorizedSources(db, userId, userMongoId);
  let ownedNotification = stored
    .map((doc) => sanitizeStoredNotification(doc))
    .find((item) => matchesNotificationIdentity(item, notificationKey));

  if (!ownedNotification) {
    ownedNotification = announcements
      .map((doc) => normalizeAnnouncementNotification(doc))
      .find((item) => matchesNotificationIdentity(item, notificationKey));
  }

  if (!ownedNotification) return { status: 404, detail: "Notification not found." };

  const ownedKey = buildNotificationKey(ownedNotification);
  // Read-state bookkeeping (notification_reads/notification_read_state) is
  // private to this bridge — always written and read keyed by the string
  // user_id, so no dual-shape handling is needed here.
  await db.collection("notification_reads").updateOne(
    { user_id: userId, notification_key: ownedKey },
    { $set: { read_at: new Date() }, $setOnInsert: { created_at: new Date() } },
    { upsert: true },
  );
  return { status: 200, value: { status: "read", notification_id: ownedKey } };
}

async function markAllNotificationsRead(db, userId, userMongoId) {
  const now = new Date();
  await db.collection("notification_read_state").updateOne(
    { user_id: userId },
    { $set: { all_read_at: now, updated_at: now }, $setOnInsert: { created_at: now } },
    { upsert: true },
  );
  // Best-effort direct flag on the source documents too (belt-and-suspenders
  // alongside the read-state record above, which is what listUserNotifications
  // actually relies on for correctness regardless of document shape).
  await db.collection("notifications").updateMany(
    buildOwnerFilter(userId, userMongoId),
    { $set: { read: true, isRead: true, read_at: now, readAt: now } },
  );
  return { status: "all_read", read_at: now };
}

/**
 * Resolve a notification/announcement key to one this caller can actually
 * see (own stored notification or a visible announcement) — the exact same
 * ownership resolution as markNotificationRead. Returns null if the caller
 * has no visibility into that key, so a client can never dismiss/probe for
 * another tenant's private notification by guessing an id.
 */
async function resolveOwnedNotificationKey(db, userId, notificationKeyRaw, userMongoId) {
  const notificationKey = normalizeString(notificationKeyRaw);
  if (!notificationKey) return null;

  const { storedNotifications: stored, announcements } = await loadAuthorizedSources(db, userId, userMongoId);
  let owned = stored
    .map((doc) => sanitizeStoredNotification(doc))
    .find((item) => matchesNotificationIdentity(item, notificationKey));

  if (!owned) {
    owned = announcements
      .map((doc) => normalizeAnnouncementNotification(doc))
      .find((item) => matchesNotificationIdentity(item, notificationKey));
  }

  return owned ? buildNotificationKey(owned) : null;
}

/**
 * Dismiss (hide from this tenant's feed only) one notification or
 * announcement. This is a per-tenant junction write — it NEVER deletes or
 * mutates the shared `notifications`/`announcements` document, so a
 * dismissed announcement remains fully intact and fully visible to every
 * other tenant in its audience, and to admins.
 */
async function dismissNotification(db, userId, notificationKeyRaw, userMongoId) {
  const ownedKey = await resolveOwnedNotificationKey(db, userId, notificationKeyRaw, userMongoId);
  if (!ownedKey) return { status: 404, detail: "Notification not found." };

  await db.collection("notification_dismissals").updateOne(
    { user_id: userId, notification_key: ownedKey },
    { $set: { dismissed_at: new Date() }, $setOnInsert: { created_at: new Date() } },
    { upsert: true },
  );
  return { status: 200, value: { status: "dismissed", notification_id: ownedKey } };
}

/**
 * Clear the tenant's currently-visible feed (a cutoff timestamp, not a
 * permanent hide-all — see listUserNotifications' clearedBefore check).
 * Anything created after this moment, including a brand-new notification
 * or a newly published announcement, still appears normally.
 */
async function clearNotifications(db, userId) {
  const now = new Date();
  await db.collection("notification_clear_state").updateOne(
    { user_id: userId },
    { $set: { cleared_before: now, updated_at: now }, $setOnInsert: { created_at: now } },
    { upsert: true },
  );
  return { status: "cleared", cleared_before: now };
}

export {
  sanitizeStoredNotification,
  normalizeAnnouncementNotification,
  buildNotificationKey,
  buildLegacyNotificationKeys,
  buildOwnerFilter,
  loadAuthorizedSources,
  listUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
  clearNotifications,
};
