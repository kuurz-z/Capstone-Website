/**
 * =============================================================================
 * SHARED FORMATTING UTILITIES
 * =============================================================================
 *
 * Single source of truth for date, currency, branch, and room type formatting.
 * All components should import from here rather than defining inline helpers.
 *
 * Usage:
 *   import { formatDate, formatBranch, fmtCurrency } from '@/shared/utils/formatDate';
 * =============================================================================
 */

/* ── Dates ────────────────────────────────────────────────────────────── */

/**
 * Format a date to a string in various formats.
 * @param {Date|string|number} date
 * @param {string} format - 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'MMM DD, YYYY'
 */
export const formatDate = (date, format = "YYYY-MM-DD") => {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  switch (format) {
    case "YYYY-MM-DD":
      return `${year}-${month}-${day}`;
    case "MM/DD/YYYY":
      return `${month}/${day}/${year}`;
    case "DD/MM/YYYY":
      return `${day}/${month}/${year}`;
    case "MMM DD, YYYY":
      return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    default:
      return `${year}-${month}-${day}`;
  }
};

/** Short date: "Jan 1, 2026" — the format most components actually use */
export const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

/** Month + year: "January 2026" */
export const fmtMonth = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : "—";

/** Full locale date-time: "2/2/2026, 10:30:00 AM" */
export const formatDateTime = (date) => {
  if (!date) return "";
  const d = new Date(date);
  return isNaN(d.getTime()) ? "" : d.toLocaleString();
};

/** Time only: "10:30 AM" */
export const formatTime = (date) => {
  if (!date) return "—";
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** Short timestamp: "Jan 1, 2026, 10:30 AM" */
export const formatTimestamp = (date) =>
  new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Relative time: "5 minutes ago" */
export const getRelativeTime = (date) => {
  if (!date) return "";
  const past = new Date(date);
  if (isNaN(past.getTime())) return "";

  const diffMs = Date.now() - past.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(date, "MMM DD, YYYY");
};

/* ── Currency ─────────────────────────────────────────────────────────── */

/** Format Philippine Peso: "₱1,234.00" */
export const fmtCurrency = (v) =>
  `₱${Number(v || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

/* ── Branch / Room ────────────────────────────────────────────────────── */

const BRANCH_MAP = {
  "gil-puyat": "Gil Puyat",
  guadalupe: "Guadalupe",
  general: "General",
};
const ROOM_TYPE_MAP = {
  private: "Private",
  "double-sharing": "Double Sharing",
  "quadruple-sharing": "Quadruple Sharing",
};

/** Format branch slug → display name */
export const formatBranch = (branch) =>
  branch ? BRANCH_MAP[branch] || branch : "Unknown";

/** Format room type slug → display name */
export const formatRoomType = (type) =>
  type ? ROOM_TYPE_MAP[type] || type : "Unknown";
