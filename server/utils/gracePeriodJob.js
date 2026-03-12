/**
 * ============================================================================
 * GRACE PERIOD JOB
 * ============================================================================
 *
 * Background job that periodically checks for reservations that have
 * entered or exceeded their grace period.
 *
 * Runs every 15 minutes by default.
 *
 * LOGIC:
 * 1. Confirmed reservations where today > checkInDate → status = "grace_period"
 * 2. Grace period reservations where today > graceDeadline → status = "cancelled",
 *    release bed, decrease occupancy
 *
 * ============================================================================
 */

import { Reservation, Room } from "../models/index.js";
import notify from "./notificationService.js";

const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Process grace period transitions
 */
async function processGracePeriods() {
  const now = new Date();
  let transitioned = 0;
  let cancelled = 0;

  try {
    // ── Step 1: Confirmed → grace_period ──────────────────────────
    const confirmedPastMoveIn = await Reservation.find({
      status: "confirmed",
      checkInDate: { $lt: now },
      isArchived: false,
    });

    for (const reservation of confirmedPastMoveIn) {
      reservation.status = "grace_period";

      // Compute graceDeadline if not set
      if (!reservation.graceDeadline) {
        const moveIn = new Date(reservation.checkInDate);
        const days = reservation.gracePeriodDays || 3;
        reservation.graceDeadline = new Date(moveIn.getTime() + days * 24 * 60 * 60 * 1000);
      }

      await reservation.save();
      transitioned++;

      // Notify tenant
      const code = reservation.reservationCode || reservation._id.toString().slice(-6);
      const deadline = reservation.graceDeadline.toLocaleDateString("en-PH", {
        year: "numeric", month: "long", day: "numeric",
      });
      notify.gracePeriodWarning(reservation.userId, code, deadline);
    }

    // ── Step 2: grace_period past deadline → cancelled ────────────
    const expiredGrace = await Reservation.find({
      status: "grace_period",
      graceDeadline: { $lt: now },
      isArchived: false,
    });

    for (const reservation of expiredGrace) {
      reservation.status = "cancelled";
      reservation.notes = `${reservation.notes ? reservation.notes + " | " : ""}Auto-cancelled: grace period expired`;
      await reservation.save();

      // Release bed and decrease occupancy
      if (reservation.roomId && reservation.selectedBed?.id) {
        try {
          const room = await Room.findById(reservation.roomId);
          if (room) {
            room.vacateBed(reservation.selectedBed.id);
            room.decreaseOccupancy();
            room.updateAvailability();
            await room.save();
          }
        } catch (e) {
          console.error(`⚠️ Failed to release bed for reservation ${reservation._id}:`, e.message);
        }
      }

      cancelled++;

      // Notify tenant
      const code = reservation.reservationCode || reservation._id.toString().slice(-6);
      notify.reservationCancelled(reservation.userId, code, "Grace period expired — no check-in");
    }

    if (transitioned > 0 || cancelled > 0) {
      console.log(`🕐 Grace period job: ${transitioned} → grace_period, ${cancelled} → cancelled`);
    }
  } catch (error) {
    console.error("❌ Grace period job error:", error);
  }
}

/**
 * Start the grace period background job
 */
export function startGracePeriodJob() {
  console.log("🕐 Grace period job started (every 15 min)");

  // Run once immediately on startup
  processGracePeriods();

  // Then run on interval
  const intervalId = setInterval(processGracePeriods, INTERVAL_MS);

  // Return cleanup function
  return () => clearInterval(intervalId);
}

export default startGracePeriodJob;
