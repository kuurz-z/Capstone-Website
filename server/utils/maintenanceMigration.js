import {
  LEGACY_MAINTENANCE_STATUS_MAP,
  LEGACY_MAINTENANCE_TYPE_MAP,
  LEGACY_MAINTENANCE_URGENCY_MAP,
  normalizeMaintenanceStatus,
  normalizeMaintenanceType,
  normalizeMaintenanceUrgency,
} from "../config/maintenance.js";

export const buildStableUserId = (seed) =>
  `user_${String(seed || "").replace(/[^a-zA-Z0-9]/g, "").slice(-12).padStart(12, "0")}`;

export const buildStableMaintenanceRequestId = (seed) =>
  `maint_${String(seed || "").replace(/[^a-zA-Z0-9]/g, "").slice(-12).padStart(12, "0")}`;

export const buildLegacyDescription = (title, description) => {
  const trimmedTitle = String(title || "").trim();
  const trimmedDescription = String(description || "").trim();

  if (!trimmedTitle) return trimmedDescription;
  if (!trimmedDescription) return trimmedTitle;
  if (trimmedDescription.toLowerCase().startsWith(trimmedTitle.toLowerCase())) {
    return trimmedDescription;
  }
  return `${trimmedTitle}\n\n${trimmedDescription}`;
};

export function mapLegacyMaintenanceDocument(legacyRequest, options = {}) {
  const legacyId = legacyRequest?._id?.toString?.() || legacyRequest?.request_id;
  const requestType = normalizeMaintenanceType(
    legacyRequest?.request_type || legacyRequest?.category || "other",
  );
  const urgency = normalizeMaintenanceUrgency(
    legacyRequest?.urgency || "normal",
  );
  const originalStatus = String(
    legacyRequest?.status || "pending",
  ).trim().toLowerCase();
  const status = normalizeMaintenanceStatus(originalStatus);
  const mappedNotes = [];

  if (
    LEGACY_MAINTENANCE_STATUS_MAP[originalStatus] === "in_progress" &&
    originalStatus === "on-hold"
  ) {
    mappedNotes.push("Migrated from legacy on-hold maintenance status.");
  }

  if (
    LEGACY_MAINTENANCE_TYPE_MAP[String(legacyRequest?.category || "").trim().toLowerCase()]
  ) {
    mappedNotes.push(
      `Migrated from legacy maintenance category "${legacyRequest.category}".`,
    );
  }

  if (
    LEGACY_MAINTENANCE_URGENCY_MAP[String(legacyRequest?.urgency || "").trim().toLowerCase()]
  ) {
    mappedNotes.push(
      `Migrated from legacy urgency "${legacyRequest.urgency}".`,
    );
  }

  const userIdSeed =
    legacyRequest?.user_id ||
    legacyRequest?.userId?.toString?.() ||
    legacyRequest?.userId ||
    options.userIdSeed;
  const resolvedUserId = options.user_id || buildStableUserId(userIdSeed || legacyId);

  const baseNotes = [legacyRequest?.notes, legacyRequest?.completionNote]
    .filter((entry) => typeof entry === "string" && entry.trim())
    .join("\n\n")
    .trim();
  const notes = [baseNotes, ...mappedNotes].filter(Boolean).join("\n\n") || null;

  return {
    request_id:
      legacyRequest?.request_id || buildStableMaintenanceRequestId(legacyId),
    user_id: resolvedUserId,
    request_type: requestType,
    description: buildLegacyDescription(
      legacyRequest?.title,
      legacyRequest?.description,
    ),
    urgency,
    status,
    assigned_to:
      options.assigned_to ??
      legacyRequest?.assigned_to ??
      legacyRequest?.assignedTo ??
      null,
    notes,
    attachments: Array.isArray(legacyRequest?.attachments)
      ? legacyRequest.attachments
      : [],
    reopen_note: legacyRequest?.reopen_note ?? null,
    reopen_history: Array.isArray(legacyRequest?.reopen_history)
      ? legacyRequest.reopen_history
      : [],
    created_at: legacyRequest?.created_at || legacyRequest?.createdAt || new Date(),
    updated_at: legacyRequest?.updated_at || legacyRequest?.updatedAt || new Date(),
    cancelled_at: legacyRequest?.cancelled_at || null,
    reopened_at: legacyRequest?.reopened_at || null,
    resolved_at: legacyRequest?.resolved_at || legacyRequest?.resolvedAt || null,
    branch: options.branch || legacyRequest?.branch || null,
    userId: options.userMongoId || legacyRequest?.userId || null,
    reservationId: legacyRequest?.reservationId || null,
    roomId: legacyRequest?.roomId || null,
    isArchived: Boolean(legacyRequest?.isArchived),
  };
}
