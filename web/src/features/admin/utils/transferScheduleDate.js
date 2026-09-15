// Canonical calendar-date helpers for the Transfer Tenant wizard's
// "is this a future (scheduled) transfer?" decision.
//
// Business logic here compares CANONICAL `YYYY-MM-DD` strings only — never
// locale-formatted display strings like "09/05/2026", which sort
// lexicographically wrong and vary by locale. A native <input type="date">
// already yields `YYYY-MM-DD`; `toDateInputValue` produces the same shape
// from a Date using LOCAL calendar fields (Philippines users are UTC+8, so
// local === Manila), never `toISOString()` (which shifts to UTC and can roll
// back a day just after local midnight).
//
// Extracted from TenantWorkspaceModals so the exact comparison the wizard
// runs is unit-testable without mounting React.

/**
 * A Date -> local calendar `YYYY-MM-DD` (matches a native date input).
 * Returns "" for a nullish or unparseable value.
 * @param {Date|string|number|null|undefined} value
 * @returns {string}
 */
export const toDateInputValue = (value) => {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : "";
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = name => parts.find(p => p.type === name).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};

/**
 * Today as a local calendar `YYYY-MM-DD` string.
 * @param {Date} [now] - injectable for tests
 * @returns {string}
 */
export const localTodayStr = (now = new Date()) => toDateInputValue(now);

/**
 * The EARLIEST date a new Admin Room Transfer may be scheduled for. Same-day
 * transfers are ALLOWED, so this is TODAY, as a local calendar `YYYY-MM-DD`
 * string — the wizard's date picker uses it as `min`. Philippine users are
 * UTC+8, so local calendar === Manila calendar; the backend (`isPastManilaDate`)
 * stays authoritative and rejects a past date (PAST_TRANSFER_DATE).
 *
 * @param {Date} [now] - injectable for tests
 * @returns {string}
 */
export const minScheduleDateStr = (now = new Date()) => toDateInputValue(now);

/** "HH:mm" -> minutes from midnight, or null. */
export const timeStrToMinutes = (value) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(mins) && mins >= 0 && mins < 24 * 60 ? mins : null;
};

/** minutes from midnight -> "HH:mm". */
export const minutesToTimeStr = (minutes) => {
  const m = Number.isFinite(Number(minutes)) ? Number(minutes) : 0;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/**
 * True when `effectiveTransferDate` (a `YYYY-MM-DD` string, or anything
 * `toDateInputValue` can normalize) is strictly AFTER today — i.e. this
 * Confirm SCHEDULES the transfer for a future date rather than executing it
 * now. An empty / missing date is treated as "immediate" (false).
 *
 * Comparison is a plain string `>` on canonical `YYYY-MM-DD`, which is
 * lexicographically correct for ISO dates. Never pass a locale-formatted
 * string here.
 *
 * @param {string} effectiveTransferDate - `YYYY-MM-DD`
 * @param {Date} [now] - injectable for tests
 * @returns {boolean}
 */
export const isScheduledTransferDate = (effectiveTransferDate, now = new Date()) => {
  if (!effectiveTransferDate) return false;
  const canonical =
    /^\d{4}-\d{2}-\d{2}$/.test(effectiveTransferDate)
      ? effectiveTransferDate
      : toDateInputValue(effectiveTransferDate);
  if (!canonical) return false;
  return canonical > localTodayStr(now);
};
