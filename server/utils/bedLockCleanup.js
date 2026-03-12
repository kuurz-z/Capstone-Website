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

const INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

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
      console.log(`🔓 Bed lock cleanup: released ${totalUnlocked} expired lock(s)`);
    }
  } catch (error) {
    console.error("❌ Bed lock cleanup error:", error);
  }
}

/**
 * Start the bed lock cleanup job
 */
export function startBedLockCleanupJob() {
  console.log("🔓 Bed lock cleanup job started (every 2 min)");

  // Run once immediately
  cleanupExpiredBedLocks();

  const intervalId = setInterval(cleanupExpiredBedLocks, INTERVAL_MS);
  return () => clearInterval(intervalId);
}

export default startBedLockCleanupJob;
