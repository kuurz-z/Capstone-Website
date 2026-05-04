import { Reservation, Room, VisitAvailability, ROOM_BRANCHES } from "../models/index.js";
import {
  DEFAULT_VISIT_SLOTS,
  DEFAULT_VISIT_WEEKDAYS,
} from "../models/VisitAvailability.js";
import { reservationStatusesForQuery } from "./lifecycleNaming.js";

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AVAILABILITY_DAYS = 60;
const ACTIVE_VISIT_STATUSES = reservationStatusesForQuery(
  "visit_pending",
  "visit_approved",
);

const pad2 = (value) => String(value).padStart(2, "0");

export const toDateKey = (value) => {
  if (!value) return "";
  if (typeof value === "string" && DATE_KEY_REGEX.test(value.slice(0, 10))) {
    return value.slice(0, 10);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

export const dateKeyToLocalDate = (dateKey) => {
  if (!DATE_KEY_REGEX.test(String(dateKey || ""))) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const getDateRangeForKey = (dateKey) => {
  const start = dateKeyToLocalDate(dateKey);
  if (!start) return null;
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

export const todayDateKey = (now = new Date()) => toDateKey(now);

export const tomorrowDateKey = (now = new Date()) => {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 1);
  return toDateKey(date);
};

export const normalizeVisitBranch = (branch) => {
  const normalized = String(branch || "").trim().toLowerCase();
  return ROOM_BRANCHES.includes(normalized) ? normalized : "";
};

const normalizeWeekdays = (value) => {
  const source = Array.isArray(value) ? value : DEFAULT_VISIT_WEEKDAYS;
  return [...new Set(source.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
    .sort((left, right) => left - right);
};

const normalizeSlots = (value) => {
  const source = Array.isArray(value) && value.length > 0 ? value : DEFAULT_VISIT_SLOTS;
  return source
    .map((slot) => ({
      label: String(slot?.label || "").trim(),
      enabled: slot?.enabled !== false,
      capacity: Math.max(0, Math.floor(Number(slot?.capacity ?? 5) || 0)),
    }))
    .filter((slot) => slot.label);
};

const normalizeBlackouts = (value) => {
  const source = Array.isArray(value) ? value : [];
  const byDate = new Map();
  for (const item of source) {
    const date = toDateKey(item?.date || item);
    if (!date) continue;
    byDate.set(date, {
      date,
      reason: String(item?.reason || "").trim(),
    });
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
};

export const serializeVisitAvailabilitySettings = (settings) => ({
  branch: settings.branch,
  enabledWeekdays: normalizeWeekdays(settings.enabledWeekdays),
  slots: normalizeSlots(settings.slots),
  blackoutDates: normalizeBlackouts(settings.blackoutDates),
  changedBy: settings.changedBy || null,
  changedAt: settings.changedAt || null,
  updatedAt: settings.updatedAt || null,
});

export async function getVisitAvailabilitySettings(branch) {
  const normalizedBranch = normalizeVisitBranch(branch);
  if (!normalizedBranch) {
    const error = new Error(`Invalid branch. Must be one of: ${ROOM_BRANCHES.join(", ")}`);
    error.code = "INVALID_BRANCH";
    error.statusCode = 400;
    throw error;
  }

  let settings = await VisitAvailability.findOne({ branch: normalizedBranch });
  if (!settings) {
    settings = await VisitAvailability.create({ branch: normalizedBranch });
  }

  return settings;
}

export async function updateVisitAvailabilitySettings(branch, payload, actor = null) {
  const settings = await getVisitAvailabilitySettings(branch);

  if (payload.enabledWeekdays !== undefined) {
    settings.enabledWeekdays = normalizeWeekdays(payload.enabledWeekdays);
  }
  if (payload.slots !== undefined) {
    settings.slots = normalizeSlots(payload.slots);
  }
  if (payload.blackoutDates !== undefined) {
    settings.blackoutDates = normalizeBlackouts(payload.blackoutDates);
  }

  settings.changedBy = actor;
  settings.changedAt = new Date();
  await settings.save();
  return settings;
}

const countVisitsForDate = async ({ branch, dateKey, excludeReservationId = null }) => {
  const range = getDateRangeForKey(dateKey);
  if (!range) return new Map();
  const roomIds = await Room.find({ branch }).distinct("_id");

  const query = {
    roomId: { $in: roomIds },
    visitDate: { $gte: range.start, $lt: range.end },
    status: { $in: ACTIVE_VISIT_STATUSES },
    isArchived: { $ne: true },
  };
  if (excludeReservationId) {
    query._id = { $ne: excludeReservationId };
  }

  const reservations = await Reservation.find(query).select("visitTime").lean();
  const counts = new Map();
  for (const reservation of reservations) {
    const label = reservation.visitTime || "";
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return counts;
};

const getRoomConflictsForDate = async ({
  dateKey,
  roomId = null,
  excludeReservationId = null,
}) => {
  if (!roomId) return new Set();
  const range = getDateRangeForKey(dateKey);
  if (!range) return new Set();

  const query = {
    roomId,
    visitDate: { $gte: range.start, $lt: range.end },
    status: { $in: ACTIVE_VISIT_STATUSES },
    isArchived: { $ne: true },
  };
  if (excludeReservationId) {
    query._id = { $ne: excludeReservationId };
  }

  const reservations = await Reservation.find(query).select("visitTime").lean();
  return new Set(reservations.map((reservation) => reservation.visitTime).filter(Boolean));
};

export function getDateClosureReason({ dateKey, settings, now = new Date() }) {
  const today = todayDateKey(now);
  if (dateKey < today) {
    return { code: "VISIT_DATE_IN_PAST", reason: "That date has already passed." };
  }
  if (dateKey === today) {
    return {
      code: "VISIT_DATE_SAME_DAY",
      reason: "Visits must be scheduled at least one day in advance.",
    };
  }

  const date = dateKeyToLocalDate(dateKey);
  if (!date) {
    return { code: "VISIT_DATE_INVALID", reason: "Please choose a valid visit date." };
  }

  const blackout = normalizeBlackouts(settings.blackoutDates).find(
    (item) => item.date === dateKey,
  );
  if (blackout) {
    return {
      code: "VISIT_DATE_CLOSED",
      reason: blackout.reason || "Visits are closed on that date.",
    };
  }

  const enabledWeekdays = new Set(normalizeWeekdays(settings.enabledWeekdays));
  if (!enabledWeekdays.has(date.getDay())) {
    return { code: "VISIT_DATE_CLOSED", reason: "Visits are closed on that date." };
  }

  return null;
}

export async function buildVisitAvailability({
  branch,
  from,
  days = 14,
  roomId = null,
  excludeReservationId = null,
  now = new Date(),
}) {
  const settings = await getVisitAvailabilitySettings(branch);
  const startKey = toDateKey(from) || tomorrowDateKey(now);
  const count = Math.min(Math.max(Number(days) || 14, 1), MAX_AVAILABILITY_DAYS);
  const slots = normalizeSlots(settings.slots);
  const dates = [];
  let cursor = dateKeyToLocalDate(startKey) || dateKeyToLocalDate(tomorrowDateKey(now));

  for (let index = 0; index < count; index += 1) {
    const dateKey = toDateKey(cursor);
    const closure = getDateClosureReason({ dateKey, settings, now });
    const counts = await countVisitsForDate({ branch, dateKey, excludeReservationId });
    const roomConflicts = await getRoomConflictsForDate({
      dateKey,
      roomId,
      excludeReservationId,
    });

    const slotRows = slots.map((slot) => {
      const countForSlot = counts.get(slot.label) || 0;
      let disabledReason = "";
      let disabledCode = "";

      if (closure) {
        disabledReason = closure.reason;
        disabledCode = closure.code;
      } else if (!slot.enabled) {
        disabledReason = "This time is outside working hours.";
        disabledCode = "VISIT_SLOT_CLOSED";
      } else if (countForSlot >= slot.capacity) {
        disabledReason = "That time slot is full.";
        disabledCode = "VISIT_CAPACITY_REACHED";
      } else if (roomConflicts.has(slot.label)) {
        disabledReason = "That room already has a visit at that time.";
        disabledCode = "VISIT_SLOT_CONFLICT";
      }

      return {
        label: slot.label,
        enabled: slot.enabled,
        capacity: slot.capacity,
        count: countForSlot,
        remaining: Math.max(0, slot.capacity - countForSlot),
        available: !disabledReason,
        disabledReason,
        disabledCode,
      };
    });

    dates.push({
      date: dateKey,
      weekday: cursor.getDay(),
      available: !closure && slotRows.some((slot) => slot.available),
      disabledReason: closure?.reason || "",
      disabledCode: closure?.code || "",
      slots: slotRows,
    });

    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    settings: serializeVisitAvailabilitySettings(settings),
    from: startKey,
    days: count,
    dates,
  };
}

export async function validateVisitSelection({
  branch,
  visitDate,
  visitTime,
  roomId,
  excludeReservationId = null,
  now = new Date(),
}) {
  const settings = await getVisitAvailabilitySettings(branch);
  const dateKey = toDateKey(visitDate);
  if (!dateKey) {
    return {
      ok: false,
      status: 400,
      code: "VISIT_DATE_INVALID",
      error: "Please choose a valid visit date.",
    };
  }

  const closure = getDateClosureReason({ dateKey, settings, now });
  if (closure) {
    return {
      ok: false,
      status: 400,
      code: closure.code,
      error: closure.reason,
    };
  }

  const slot = normalizeSlots(settings.slots).find(
    (candidate) => candidate.label === visitTime,
  );
  if (!slot || !slot.enabled) {
    return {
      ok: false,
      status: 400,
      code: "VISIT_SLOT_CLOSED",
      error: "This time is outside working hours.",
    };
  }

  const counts = await countVisitsForDate({ branch, dateKey, excludeReservationId });
  if ((counts.get(slot.label) || 0) >= slot.capacity) {
    return {
      ok: false,
      status: 400,
      code: "VISIT_CAPACITY_REACHED",
      error: "That time slot is full.",
    };
  }

  const roomConflicts = await getRoomConflictsForDate({
    dateKey,
    roomId,
    excludeReservationId,
  });
  if (roomConflicts.has(slot.label)) {
    return {
      ok: false,
      status: 409,
      code: "VISIT_SLOT_CONFLICT",
      error: "That room already has a visit at that time.",
    };
  }

  const range = getDateRangeForKey(dateKey);
  return {
    ok: true,
    date: range.start,
    dateKey,
  };
}
