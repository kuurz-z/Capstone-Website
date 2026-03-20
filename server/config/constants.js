/**
 * ============================================================================
 * BUSINESS & SYSTEM CONSTANTS
 * ============================================================================
 *
 * Single source of truth for all hardcoded business values and tuning knobs.
 * Environment variable overrides are supported for deployment-time changes.
 *
 * Usage:
 *   import { BUSINESS, CACHE } from "../config/constants.js";
 *   const amount = BUSINESS.DEPOSIT_AMOUNT;
 *
 * ============================================================================
 */

// ─── Business Rules ──────────────────────────────────────────────────────────

export const BUSINESS = {
  /** Reservation deposit amount in PHP (₱). Override via DEPOSIT_AMOUNT env var. */
  DEPOSIT_AMOUNT: Number(process.env.DEPOSIT_AMOUNT) || 2000,

  /** Late payment penalty per day in PHP (₱). Override via PENALTY_RATE env var. */
  PENALTY_RATE_PER_DAY: Number(process.env.PENALTY_RATE) || 50,

  /** Grace period in days before a no-show reserved reservation is auto-cancelled. */
  NOSHOW_GRACE_DAYS: 7,

  /** Hours before a pending reservation (no visit scheduled) is auto-expired. */
  STALE_PENDING_HOURS: 2,

  /** Hours before a visit_pending reservation is auto-expired (14-day safety net).
   *  This is a last-resort failsafe — admins are expected to act well before this.
   *  An admin warning notification is sent at VISIT_PENDING_WARN_DAYS. */
  STALE_VISIT_PENDING_HOURS: 336,

  /** Days after which admins are warned about unactioned visit_pending reservations. */
  VISIT_PENDING_WARN_DAYS: 12,

  /** Hours past visit date before a visit_approved reservation is auto-expired. */
  STALE_VISIT_APPROVED_HOURS: 48,

  /** Hours before a payment_pending reservation is auto-expired. */
  STALE_PAYMENT_PENDING_HOURS: 48,

  /** Days after which cancelled reservations are auto-archived (soft deleted).
   *  Archived records are hidden from active tables but preserved for analytics. */
  ARCHIVE_CANCELLED_AFTER_DAYS: 7,
};

// ─── Cache Tuning ─────────────────────────────────────────────────────────────

export const CACHE = {
  /** Firebase token verification cache TTL in milliseconds (default: 5 minutes). */
  TOKEN_TTL_MS: 5 * 60 * 1000,

  /** Account status (suspended/banned) cache TTL in milliseconds (default: 2 minutes). */
  ACCOUNT_STATUS_TTL_MS: 2 * 60 * 1000,

  /** Maximum number of tokens held in the LRU token cache. */
  MAX_TOKEN_ENTRIES: 500,

  /** Maximum number of account statuses held in the account status cache. */
  MAX_ACCOUNT_STATUS_ENTRIES: 500,
};
