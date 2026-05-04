/**
 * ============================================================================
 * GRACE PERIOD JOB (LEGACY COMPATIBILITY WRAPPER)
 * ============================================================================
 *
 * The canonical reservation expiry / no-show flow now lives in scheduler.js.
 * This module remains as a backward-compatible wrapper for older bootstrap
 * paths that may still import it.
 *
 * ============================================================================
 */

import logger from "../middleware/logger.js";
import { expireStaleReservations, cancelNoShowReservations } from "./scheduler.js";

/**
 * Process grace-period compatible transitions using the canonical scheduler jobs.
 */
async function processGracePeriods() {
  try {
    await expireStaleReservations();
    await cancelNoShowReservations();
  } catch (error) {
    console.error("❌ Grace period compatibility job error:", error);
  }
}

/**
 * Start the grace period background job
 */
export function startGracePeriodJob() {
  logger.warn(
    "startGracePeriodJob is deprecated. The canonical scheduler owns grace-period processing.",
  );

  if (process.env.NODE_ENV === "production") {
    return () => {};
  }

  processGracePeriods();
  return () => {};
}

export default startGracePeriodJob;
