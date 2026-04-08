/**
 * ============================================================================
 * BED LOCK CLEANUP JOB
 * ============================================================================
 *
 * Background job that periodically releases expired bed locks.
 * Runs every 2 minutes to clean up abandoned bed selections.
 *
 * ============================================================================
 */

import { Room } from "../models/index.js";
import logger from "../middleware/logger.js";

async function cleanupExpiredBedLocks() {
  try {
    // Find rooms with locked beds
    const rooms = await Room.find({
      "beds.status": "locked",
      isArchived: false,
    });

    let totalUnlocked = 0;

    for (const room of rooms) {
      const unlocked = room.unlockExpiredBeds();
      if (unlocked > 0) {
        await room.save();
        totalUnlocked += unlocked;
      }
    }

    if (totalUnlocked > 0) {
    }
  } catch (error) {
    console.error("❌ Bed lock cleanup error:", error);
  }
}

/**
 * Start the bed lock cleanup job
 */
export function startBedLockCleanupJob() {
  logger.warn(
    "startBedLockCleanupJob is deprecated. The canonical scheduler owns bed lock cleanup.",
  );

  if (process.env.NODE_ENV === "production") {
    return () => {};
  }

  cleanupExpiredBedLocks();
  return () => {};
}

export default startBedLockCleanupJob;
