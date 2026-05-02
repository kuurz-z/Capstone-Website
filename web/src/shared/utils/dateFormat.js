/**
 * Centralized date/time formatting for the LilyCrest admin and tenant UIs.
 *
 * All date display goes through this module so locale, timezone, and format
 * choices are changed in one place and stay consistent across every page.
 */

export const APP_LOCALE = "en-PH";

const DATE_OPTS = { year: "numeric", month: "long", day: "numeric" };
const DATE_SHORT_OPTS = { year: "numeric", month: "short", day: "numeric" };
const DATETIME_OPTS = { ...DATE_OPTS, hour: "2-digit", minute: "2-digit" };
const TIME_OPTS = { hour: "2-digit", minute: "2-digit" };
const MONTH_YEAR_OPTS = { year: "numeric", month: "long" };

const fmt = (value, opts) => {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(APP_LOCALE, opts).format(d);
};

/** "April 30, 2026" */
export const fmtDate = (value) => fmt(value, DATE_OPTS);

/** "Apr 30, 2026" */
export const fmtShortDate = (value) => fmt(value, DATE_SHORT_OPTS);

/** "April 30, 2026 at 11:45 AM" */
export const fmtDateTime = (value) => fmt(value, DATETIME_OPTS);

/** "11:45 AM" */
export const fmtTime = (value) => fmt(value, TIME_OPTS);

/** "April 2026" */
export const fmtMonthYear = (value) => fmt(value, MONTH_YEAR_OPTS);

/**
 * Returns a human-readable relative label: "Just now", "5 minutes ago",
 * "2 hours ago", "Yesterday", or falls back to fmtDate.
 */
export const fmtRelative = (value) => {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  if (diffHr < 48) return "Yesterday";
  return fmtDate(d);
};
