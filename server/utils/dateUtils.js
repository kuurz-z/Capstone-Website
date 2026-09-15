import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Manila";

// Ensure Node process TZ default aligns with Philippine Time
if (!process.env.TZ) {
  process.env.TZ = APP_TIMEZONE;
}

// Set default timezone for dayjs
dayjs.tz.setDefault(APP_TIMEZONE);

/**
 * Get a dayjs instance in Asia/Manila (PHT) timezone context.
 */
export function getManilaDayjs(dateLike) {
  if (dateLike === undefined || dateLike === null) {
    return dayjs().tz("Asia/Manila");
  }
  return dayjs(dateLike).tz("Asia/Manila");
}

/**
 * Normalize a date to midnight (00:00:00.000) in Asia/Manila timezone.
 */
export function toManilaStartOfDay(dateLike) {
  if (!dateLike) return null;
  if (typeof dateLike === "string" && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(dateLike.trim())) {
    const value = dateLike.trim().slice(0, 10);
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
  }
  const d =
    typeof dateLike === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateLike.trim())
      ? dayjs.tz(dateLike.trim(), "Asia/Manila")
      : getManilaDayjs(dateLike);
  return d.isValid() ? d.startOf("day") : null;
}

/**
 * Get current date at midnight (00:00:00.000) in Asia/Manila timezone.
 */
export function getManilaToday(referenceDate) {
  const base = referenceDate ? dayjs(referenceDate) : dayjs();
  return base.tz("Asia/Manila").startOf("day");
}

/**
 * Compute exact difference in calendar days between two dates in Asia/Manila.
 * Returns (dateA - dateB) in Manila calendar days.
 */
export function diffManilaDays(dateA, dateB) {
  const dayA = toManilaStartOfDay(dateA);
  const dayB = toManilaStartOfDay(dateB);
  if (!dayA || !dayB) return NaN;
  return dayA.diff(dayB, "day");
}

/**
 * Combine a Manila calendar date with a minutes-from-midnight wall-clock time
 * into an absolute Date. Used by the scheduled room transfer flow, where the
 * effective date is stored start-of-day and the intended cutover time is a
 * separate minutes value.
 *
 * @param {*} dateLike       any date; only its Manila calendar day is used
 * @param {number} minutes   0..1439 minutes from midnight (Asia/Manila)
 * @returns {Date|null}
 */
export function composeManilaDateTime(dateLike, minutes) {
  const day = toManilaStartOfDay(dateLike);
  if (!day) return null;
  const mins = Number.isFinite(Number(minutes)) ? Math.min(Math.max(Math.round(Number(minutes)), 0), 24 * 60 - 1) : 0;
  return day.add(mins, "minute").toDate();
}

/**
 * Is `dateTime` at or before "now" in Asia/Manila (i.e. reached / due)?
 */
export function isManilaDateTimeReached(dateTime, now = new Date()) {
  const target = getManilaDayjs(dateTime);
  if (!target || !target.isValid()) return false;
  return !target.isAfter(getManilaDayjs(now));
}

/**
 * Format a date in Asia/Manila timezone.
 */
export function formatManilaDate(dateLike, formatStr = "YYYY-MM-DD") {
  if (!dateLike) return "";
  const d = getManilaDayjs(dateLike);
  return d.isValid() ? d.format(formatStr) : "";
}

export { dayjs };
