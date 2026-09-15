/**
 * =============================================================================
 * SESSION INACTIVITY CORE LOGIC
 * =============================================================================
 *
 * Pure functions and constants for managing user inactivity timeouts,
 * warning countdown intervals, and cross-tab storage keys.
 */

export const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes (900,000 ms)

export const STORAGE_KEY_LAST_ACTIVITY = "lilycrest_session_last_activity";
export const STORAGE_KEY_LOGOUT_BROADCAST = "lilycrest_session_logout_broadcast";
export const SESSION_BROADCAST_CHANNEL = "lilycrest_session_sync";

/**
 * Validates and clamps an incoming timestamp.
 * Returns null if invalid or NaN. Clamps future timestamps to current time.
 *
 * @param {number|string} rawTimestamp
 * @param {number} [now=Date.now()]
 * @returns {number|null}
 */
export function clampTimestamp(rawTimestamp, now = Date.now()) {
  const parsed = Number(rawTimestamp);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(parsed, now);
}

/**
 * Calculates current inactivity state based on last active timestamp and current time.
 * Returns isExpired: true when elapsed time reaches or exceeds 15 minutes.
 *
 * @param {Object} params
 * @param {number} params.lastActiveTime - Epoch timestamp of last recorded activity
 * @param {number} [params.now=Date.now()] - Current epoch timestamp
 * @returns {{ isExpired: boolean }}
 */
export function calculateInactivityState({ lastActiveTime, now = Date.now() }) {
  if (!lastActiveTime || typeof lastActiveTime !== "number" || Number.isNaN(lastActiveTime)) {
    return { isExpired: false };
  }

  const elapsedMs = Math.max(0, now - lastActiveTime);

  return {
    isExpired: elapsedMs >= SESSION_IDLE_TIMEOUT_MS,
  };
}

/**
 * Checks if a write to storage should be throttled.
 *
 * @param {Object} params
 * @param {number} params.lastWriteTime - Epoch timestamp of last storage write
 * @param {number} [params.now=Date.now()] - Current epoch timestamp
 * @param {number} [params.throttleMs=5000] - Throttle threshold in milliseconds
 * @returns {boolean} True if throttled (do not write), false if write is allowed
 */
export function shouldThrottleWrite({ lastWriteTime, now = Date.now(), throttleMs = 5000 }) {
  if (!lastWriteTime || typeof lastWriteTime !== "number" || Number.isNaN(lastWriteTime)) {
    return false;
  }
  const elapsed = now - lastWriteTime;
  if (elapsed < 0) return false; // Clock adjusted backward, do not throttle
  return elapsed < throttleMs;
}
