/**
 * repair_room204_and_stale_extensions.mjs
 * ============================================================================
 * Automated repair script for:
 * 1. Room 204 bed reconciliation: scans Room 204 beds; for any bed marked
 *    occupied, reserved, or locked whose referenced user or reservation is
 *    moved_out, inactive, cancelled, completed, or non-existent, frees the bed
 *    (status: "available", clears lockedBy, lockExpiresAt, and occupiedBy).
 *    Recalculates currentOccupancy and updates room availability.
 * 2. Orphaned extension and renewal cleanup: scans all moved-out reservations
 *    (status: "moveOut") across the database and cancels any unfulfilled renewal
 *    contracts (status: "cancelled", cancellationReason: "predecessor_moved_out",
 *    isCurrent: false), cancels any upcoming stays (status: "cancelled",
 *    endReason: "tenant_moved_out"), and cancels any open/approved
 *    StayExtensionRequest records (status: "cancelled",
 *    adminNote: "Cancelled via move-out repair.").
 *
 * Usage:
 *   node server/scripts/repair_room204_and_stale_extensions.mjs             # Run repair
 *   node server/scripts/repair_room204_and_stale_extensions.mjs --dry-run   # Dry-run preview
 * ============================================================================
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

import {
  Contract,
  Reservation,
  Room,
  Stay,
  StayExtensionRequest,
  User,
} from "../models/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

const UNFULFILLED_CONTRACT_STATUSES = Object.freeze([
  "draft",
  "incomplete",
  "ready_for_generation",
  "generated",
  "awaiting_signatures",
  "partially_signed",
  "signed",
  "awaiting_notarization",
  "notarized",
  "ready_for_publication",
  "published",
  "renewal_pending",
]);

/**
 * Reconciles Room 204 beds and active occupancy.
 *
 * @param {Object} options
 * @param {boolean} [options.dryRun=false]
 * @param {Function} [options.log=console.log]
 * @returns {Promise<Object>}
 */
export async function reconcileRoom204({ dryRun = false, log = console.log } = {}) {
  log("🔍 Scanning Room 204 for bed reconciliation...");

  const rooms = await Room.find({
    $or: [
      { roomNumber: "204" },
      { roomNumber: 204 },
      { roomNumber: { $regex: /^GP-204$|^GU-204$|^204$/i } },
      { name: { $regex: /204/i } },
    ],
    isArchived: { $ne: true },
  });

  if (!rooms || rooms.length === 0) {
    log("⚠ No room matching Room 204 found.");
    return { roomsScanned: 0, bedsFreed: 0, roomsUpdated: 0, roomReports: [] };
  }

  let totalBedsFreed = 0;
  let totalRoomsUpdated = 0;
  const roomReports = [];

  for (const room of rooms) {
    let roomModified = false;
    let freedInRoom = 0;
    const initialOccupancy = room.currentOccupancy;
    const initialAvailable = room.available;

    for (const bed of room.beds || []) {
      if (["occupied", "reserved", "locked"].includes(bed.status)) {
        let isStale = false;
        let staleReason = "";

        const userId = bed.occupiedBy?.userId || bed.lockedBy;
        const resId = bed.occupiedBy?.reservationId;

        if (!userId && !resId) {
          isStale = true;
          staleReason = "Bed marked non-available without occupant userId or reservationId";
        } else {
          // 1. Check referenced User status
          if (userId) {
            const user = await User.findById(userId).lean();
            if (!user) {
              isStale = true;
              staleReason = `Referenced user ${userId} does not exist`;
            } else if (
              ["moved_out", "inactive", "none", "evicted", "blacklisted"].includes(
                user.tenantStatus,
              )
            ) {
              isStale = true;
              staleReason = `Referenced user ${userId} tenantStatus is "${user.tenantStatus}"`;
            }
          }

          // 2. Check referenced Reservation status
          if (!isStale && resId) {
            const reservation = await Reservation.findById(resId).lean();
            if (!reservation) {
              isStale = true;
              staleReason = `Referenced reservation ${resId} does not exist`;
            } else if (
              ["moveOut", "cancelled", "rejected", "archived"].includes(
                reservation.status,
              )
            ) {
              isStale = true;
              staleReason = `Referenced reservation ${resId} status is "${reservation.status}"`;
            }
          }

          // 3. Check temporary lock expiry
          if (!isStale && bed.status === "locked") {
            if (bed.lockExpiresAt && new Date(bed.lockExpiresAt) < new Date()) {
              isStale = true;
              staleReason = `Bed lock expired at ${new Date(bed.lockExpiresAt).toISOString()}`;
            }
          }

          // 4. Check whether an active Stay exists for this reservation
          if (!isStale && resId) {
            const activeStay = await Stay.findOne({
              reservationId: resId,
              status: { $in: ["active", "ending_soon", "expired_occupancy_continuing"] },
            }).lean();

            if (!activeStay) {
              const inactiveStay = await Stay.findOne({
                reservationId: resId,
                status: { $in: ["completed", "cancelled", "terminated"] },
              }).lean();
              if (inactiveStay) {
                isStale = true;
                staleReason = `Reservation ${resId} stay is ${inactiveStay.status}`;
              }
            }
          }
        }

        if (isStale) {
          log(
            `   ↳ [${room.roomNumber || room.name}] Freeing stale bed "${bed.id || bed._id}" (was: ${bed.status}, reason: ${staleReason})`,
          );
          if (!dryRun) {
            bed.status = "available";
            bed.lockedBy = null;
            bed.lockExpiresAt = null;
            bed.occupiedBy = {
              userId: null,
              reservationId: null,
              occupiedSince: null,
            };
          }
          roomModified = true;
          freedInRoom++;
          totalBedsFreed++;
        }
      }
    }

    // Recalculate occupancy from verified active occupied beds
    const realOccupiedCount = (room.beds || []).filter(
      (b) => b.status === "occupied" && b.occupiedBy?.userId,
    ).length;

    if (room.currentOccupancy !== realOccupiedCount || roomModified) {
      log(
        `   🔧 [${room.roomNumber || room.name}] Occupancy: ${room.currentOccupancy} → ${realOccupiedCount}`,
      );
      if (!dryRun) {
        room.currentOccupancy = realOccupiedCount;
        if (typeof room.updateAvailability === "function") {
          room.updateAvailability();
        } else {
          room.available = room.currentOccupancy < room.capacity && !room.isArchived;
        }
        await room.save();
      }
      totalRoomsUpdated++;
    }

    roomReports.push({
      roomId: room._id,
      roomNumber: room.roomNumber,
      name: room.name,
      initialOccupancy,
      finalOccupancy: dryRun ? realOccupiedCount : room.currentOccupancy,
      initialAvailable,
      finalAvailable: dryRun ? realOccupiedCount < room.capacity : room.available,
      bedsFreed: freedInRoom,
    });
  }

  return {
    roomsScanned: rooms.length,
    bedsFreed: totalBedsFreed,
    roomsUpdated: totalRoomsUpdated,
    roomReports,
  };
}

/**
 * Cancels unfulfilled renewal contracts, upcoming stays, and extension requests
 * for all moved-out reservations.
 *
 * @param {Object} options
 * @param {boolean} [options.dryRun=false]
 * @param {Function} [options.log=console.log]
 * @returns {Promise<Object>}
 */
export async function cleanupMovedOutExtensionRecords({
  dryRun = false,
  log = console.log,
} = {}) {
  log("🔍 Scanning moved-out reservations for orphaned renewal & extension records...");

  const movedOutReservations = await Reservation.find({ status: "moveOut" }).lean();
  log(`Found ${movedOutReservations.length} moved-out reservation(s) to evaluate.`);

  let contractsCancelled = 0;
  let staysCancelled = 0;
  let extensionRequestsCancelled = 0;

  const cancelledContractDetails = [];
  const cancelledStayDetails = [];
  const cancelledRequestDetails = [];

  for (const res of movedOutReservations) {
    const tenantId = res.userId?._id || res.userId;
    const resId = res._id;

    // 1. Unfulfilled renewal / successor contracts
    const danglingContracts = await Contract.find({
      $or: [
        { reservationId: resId },
        ...(tenantId ? [{ tenantId }] : []),
      ],
      status: { $in: UNFULFILLED_CONTRACT_STATUSES },
    });

    for (const contract of danglingContracts) {
      log(
        `   ↳ Cancelling unfulfilled contract ${contract.contractNumber} (status: ${contract.status}) for moved-out reservation ${resId}`,
      );
      if (!dryRun) {
        contract.status = "cancelled";
        contract.isCurrent = false;
        const actor = contract.updatedBy || contract.createdBy || tenantId || null;
        contract.updatedBy = actor;
        contract.statusHistory = contract.statusHistory || [];
        contract.statusHistory.push({
          status: "cancelled",
          changedAt: new Date(),
          changedBy: actor,
          reason: "predecessor_moved_out",
        });
        await contract.save();
      }
      contractsCancelled++;
      cancelledContractDetails.push({
        contractId: contract._id,
        contractNumber: contract.contractNumber,
        previousStatus: contract.status,
      });
    }

    // 2. Upcoming Stays
    const upcomingStays = await Stay.find({
      $or: [
        { reservationId: resId },
        ...(tenantId ? [{ tenantId }] : []),
      ],
      status: "upcoming",
    });

    for (const stay of upcomingStays) {
      log(`   ↳ Cancelling upcoming Stay ${stay._id} for moved-out reservation ${resId}`);
      if (!dryRun) {
        stay.status = "cancelled";
        stay.endedAt = new Date();
        stay.endReason = "tenant_moved_out";
        stay.updatedBy = stay.updatedBy || stay.createdBy || tenantId || null;
        await stay.save();
      }
      staysCancelled++;
      cancelledStayDetails.push({
        stayId: stay._id,
        reservationId: stay.reservationId,
      });
    }

    // 3. StayExtensionRequests
    const extensionRequests = await StayExtensionRequest.find({
      $or: [
        { reservationId: resId },
        ...(tenantId ? [{ tenantId }] : []),
      ],
      status: { $in: ["pending", "approved"] },
    });

    for (const req of extensionRequests) {
      log(
        `   ↳ Cancelling StayExtensionRequest ${req._id} (status: ${req.status}) for moved-out reservation ${resId}`,
      );
      if (!dryRun) {
        req.status = "cancelled";
        req.adminNote = "Cancelled via move-out repair.";
        req.reviewedAt = new Date();
        req.reviewedBy = req.reviewedBy || tenantId || null;
        await req.save();
      }
      extensionRequestsCancelled++;
      cancelledRequestDetails.push({
        requestId: req._id,
        previousStatus: req.status,
      });
    }
  }

  return {
    movedOutReservationsChecked: movedOutReservations.length,
    contractsCancelled,
    staysCancelled,
    extensionRequestsCancelled,
    cancelledContractDetails,
    cancelledStayDetails,
    cancelledRequestDetails,
  };
}

/**
 * Main repair runner coordinating Room 204 reconciliation and extension cleanup.
 *
 * @param {Object} options
 * @param {boolean} [options.dryRun=false]
 * @param {Function} [options.log=console.log]
 * @returns {Promise<Object>}
 */
export async function repairRoom204AndStaleExtensions({
  dryRun = false,
  log = console.log,
} = {}) {
  log("====================================================================");
  log(`  LILYCREST DMS: ROOM 204 & EXTENSION RECORD REPAIR ${dryRun ? "[DRY-RUN]" : "[APPLY]"}`);
  log("====================================================================");

  const room204Result = await reconcileRoom204({ dryRun, log });
  const extensionsResult = await cleanupMovedOutExtensionRecords({ dryRun, log });

  log("====================================================================");
  log("  REPAIR SUMMARY:");
  log(`   - Room 204 Rooms Scanned: ${room204Result.roomsScanned}`);
  log(`   - Room 204 Beds Freed:    ${room204Result.bedsFreed}`);
  log(`   - Room 204 Rooms Updated: ${room204Result.roomsUpdated}`);
  log(`   - Moved-Out Res Checked:  ${extensionsResult.movedOutReservationsChecked}`);
  log(`   - Contracts Cancelled:    ${extensionsResult.contractsCancelled}`);
  log(`   - Stays Cancelled:        ${extensionsResult.staysCancelled}`);
  log(`   - Extension Reqs Cancel:  ${extensionsResult.extensionRequestsCancelled}`);
  log("====================================================================");

  return {
    success: true,
    dryRun,
    room204: room204Result,
    extensions: extensionsResult,
  };
}

// Execute when run as CLI
const isDirectRun =
  process.argv[1] &&
  process.argv[1].replaceAll("\\", "/").endsWith("scripts/repair_room204_and_stale_extensions.mjs");

if (isDirectRun) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  const mongoUri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    "mongodb://127.0.0.1:27017/lilycrest";

  console.log(`Connecting to MongoDB (${mongoUri.replace(/:([^:@]+)@/, ":****@")})...`);
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB.\n");

  try {
    await repairRoom204AndStaleExtensions({ dryRun, log: console.log });
  } catch (err) {
    console.error("❌ Repair script encountered an error:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("\nDisconnected from MongoDB.");
  }
}
