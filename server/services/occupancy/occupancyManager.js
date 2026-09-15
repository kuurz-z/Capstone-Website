/**
 * ============================================================================
 * OCCUPANCY MANAGER SERVICE
 * ============================================================================
 *
 * Handles room occupancy and bed assignment tracking when reservations
 * change status. Automatically updates room availability based on occupancy.
 */

import mongoose from "mongoose";
import { Room, Reservation, Stay } from "../../models/index.js";
import logger from "../../middleware/logger.js";
import { emitRoomUpdate } from "../../utils/socket.js";
import {
  ACTIVE_OCCUPANCY_STATUS_QUERY,
  hasReservationStatus,
  normalizeReservationStatus,
} from "../../utils/lifecycleNaming.js";
import dayjs from "dayjs";
import { resolveReferencedUser } from "../../utils/userReference.js";

const ACTIVE_OCCUPANCY_STATUSES = ACTIVE_OCCUPANCY_STATUS_QUERY;

/**
 * Maps a reservation status to the bed display status.
 *
 * FCFS Payment-Window Model:
 * - Checked-in tenants                          → "occupied"
 * - Payment-confirmed reservations              → "reserved"
 * - Active payment window (payment_pending)     → "locked"  (24-hr timer hold)
 * - All earlier stages (pending, review, etc.)  → "available" (bed stays open)
 */
export const getDisplayStatusForReservation = (status) => {
  if (hasReservationStatus(status, "moveIn")) return "occupied";
  if (hasReservationStatus(status, "reserved")) return "reserved";
  // Only the active payment-proof window holds the bed.
  // This prevents bed-hoarding during application/review stages (FCFS model).
  if (hasReservationStatus(status, "payment_pending")) return "locked";
  // All other pre-payment stages: bed remains available for other applicants.
  return "available";
};

const buildOccupantSnapshot = (userRef, reservation, occupiedSince = null) => {
  if (!userRef) return null;
  const occupant = resolveReferencedUser(userRef);

  let expectedVacancyDate = null;
  let daysRemaining = null;

  if (reservation) {
    const moveInDate =
      reservation.moveInDate ||
      reservation.checkInDate ||
      reservation.targetMoveInDate ||
      occupiedSince ||
      reservation.createdAt;

    const baseDuration = Number(reservation.leaseDuration || 0);
    const extensions = Array.isArray(reservation.leaseExtensions)
      ? reservation.leaseExtensions.reduce(
          (sum, ext) => sum + (Number(ext.addedMonths) || 0),
          0,
        )
      : 0;
    const totalMonths = baseDuration + extensions;

    if (moveInDate && totalMonths > 0) {
      const expectedEnd = dayjs(moveInDate).add(totalMonths, "month");
      expectedVacancyDate = expectedEnd.toDate();
      daysRemaining = Math.max(0, expectedEnd.diff(dayjs(), "day"));
    }
  }

  return {
    _id: occupant.id,
    name: occupant.name,
    email: occupant.email,
    phone: userRef?.phone || null,
    reservationId: reservation?._id || null,
    reservationStatus: reservation?.status || null,
    occupiedSince,
    expectedVacancyDate,
    daysRemaining,
  };
};

const getRoomAvailabilityFromBeds = (room, beds, currentOccupancy) => {
  if (Array.isArray(beds) && beds.length > 0) {
    return beds.some((bed) => bed.status === "available");
  }

  return currentOccupancy < (room.capacity || 0) && !room.isArchived;
};

const getRoomReadinessStatus = (beds, isAvailable) => {
  if (!Array.isArray(beds) || beds.length === 0) {
    return isAvailable ? "available" : "occupied";
  }

  const statuses = new Set(beds.map((bed) => bed.status));
  if (statuses.size === 1) return beds[0]?.status || "available";
  if (statuses.has("available")) return "available";
  if (statuses.has("reserved")) return "reserved";
  if (statuses.has("occupied")) return "occupied";
  if (statuses.has("maintenance")) return "maintenance";
  return "mixed";
};

/**
 * @param {Object} room
 * @param {Object[]} reservations  active ({reserved, moveIn}) reservations for this room
 * @param {Object[]} [scheduledHolds]  OPEN inbound ScheduledRoomTransfer rows
 *   targeting this room. Display-only: a held bed is marked `scheduledIncoming`
 *   and counted in `currentOccupancy` (committed capacity), but this NEVER
 *   changes any tenant's actual current room. Callers that don't pass this
 *   are unaffected.
 */
export const deriveRoomOccupancyState = (room, reservations = [], scheduledHolds = []) => {
  const reservationsByBedId = new Map();
  const reservationsByReservationId = new Map();
  const reservationsByUserId = new Map();

  const heldBedIds = new Set(
    (Array.isArray(scheduledHolds) ? scheduledHolds : [])
      .map((h) => (h?.destinationBedId ? String(h.destinationBedId) : null))
      .filter(Boolean),
  );
  const heldByBedId = new Map(
    (Array.isArray(scheduledHolds) ? scheduledHolds : [])
      .filter((h) => h?.destinationBedId)
      .map((h) => [String(h.destinationBedId), h]),
  );
  const bedlessHoldCount = (Array.isArray(scheduledHolds) ? scheduledHolds : []).filter(
    (h) => !h?.destinationBedId,
  ).length;

  for (const reservation of reservations) {
    reservationsByReservationId.set(String(reservation._id), reservation);

    if (reservation.selectedBed?.id) {
      reservationsByBedId.set(reservation.selectedBed.id, reservation);
    }

    const userId = reservation.userId?._id || reservation.userId;
    if (userId) {
      reservationsByUserId.set(String(userId), reservation);
    }
  }

  const beds = (room.beds || []).map((bed) => {
    // A bed held by an OPEN inbound scheduled transfer: render "reserved" +
    // scheduledIncoming. The tenant's reservation is still in their SOURCE
    // room, so it won't match below — take this branch first.
    if (bed.id && heldBedIds.has(String(bed.id))) {
      const hold = heldByBedId.get(String(bed.id));
      return {
        id: bed.id,
        position: bed.position,
        bunkBlock: bed.bunkBlock || (bed.position === "single" ? "none" : "A"),
        code: bed.code || null,
        status: "reserved",
        scheduledIncoming: true,
        lockExpiresAt: null,
        lockedBy: null,
        occupant: {
          reservationId: hold?.reservationId ? String(hold.reservationId) : null,
          userId: hold?.tenantId ? String(hold.tenantId) : null,
          scheduledTransferEffectiveDate: hold?.effectiveTransferDate || null,
        },
      };
    }

    const matchedReservation =
      reservationsByBedId.get(bed.id) ||
      (bed.occupiedBy?.reservationId
        ? reservationsByReservationId.get(String(bed.occupiedBy.reservationId))
        : null) ||
      (bed.occupiedBy?.userId
        ? reservationsByUserId.get(String(bed.occupiedBy.userId))
        : null) ||
      null;

    let status = bed.status || "available";
    if (status === "locked" && (!matchedReservation || (bed.lockExpiresAt && new Date(bed.lockExpiresAt) < new Date()))) {
      status = "available";
    }
    if (matchedReservation) {
      const normResStatus = normalizeReservationStatus(matchedReservation.status);
      if (normResStatus === "cancelled" || normResStatus === "archived" || normResStatus === "rejected") {
        if (status === "locked" || status === "reserved" || status === "occupied") {
          status = "available";
        }
      } else if (status !== "maintenance") {
        // Always re-derive the bed status from the live reservation status.
        // This ensures a bed that was written as "locked" (in-progress) gets
        // correctly promoted to "reserved" or "occupied" if the reservation
        // has since advanced — and a bed that was "reserved" gets demoted
        // back to "locked" if the reservation was rolled back.
        status = getDisplayStatusForReservation(matchedReservation.status);
      }
    }

    return {
      id: bed.id,
      position: bed.position,
      bunkBlock: bed.bunkBlock || (bed.position === "single" ? "none" : "A"),
      code: bed.code || null,
      status,
      lockExpiresAt: bed.lockExpiresAt || null,
      lockedBy: bed.lockedBy || null,
      occupant: buildOccupantSnapshot(
        matchedReservation?.userId,
        matchedReservation,
        bed.occupiedBy?.occupiedSince || null,
      ),
    };
  });

  const matchedReservationIds = new Set(
    beds
      .map((bed) => bed.occupant?.reservationId)
      .filter(Boolean)
      .map((reservationId) => String(reservationId)),
  );

  const unmatchedReservations = reservations.filter(
    (reservation) => !matchedReservationIds.has(String(reservation._id)),
  );

  for (const reservation of unmatchedReservations) {
    const freeBed = beds.find((bed) => bed.status === "available");
    if (!freeBed) break;

    freeBed.status = getDisplayStatusForReservation(reservation.status);
    freeBed.occupant = buildOccupantSnapshot(reservation.userId, reservation);
  }

  const occupiedBeds = beds.filter((bed) => bed.status === "occupied");
  const reservedBeds = beds.filter((bed) => bed.status === "reserved");
  const availableBeds = beds.filter((bed) => bed.status === "available");
  const lockedBeds = beds.filter((bed) => bed.status === "locked");
  const maintenanceBeds = beds.filter((bed) => bed.status === "maintenance");
  // Committed capacity = active reservations + OPEN inbound scheduled-transfer
  // holds (bed-backed holds are already in `beds` as "reserved"; private/
  // capacity-only holds have no bed row so are added here).
  const scheduledIncomingCount = heldBedIds.size + bedlessHoldCount;
  const currentOccupancy = reservations.length + scheduledIncomingCount;
  const isAvailable = getRoomAvailabilityFromBeds(room, beds, currentOccupancy);
  const readinessStatus = getRoomReadinessStatus(beds, isAvailable);

  return {
    roomId: room._id,
    roomName: room.name,
    roomNumber: room.roomNumber,
    branch: room.branch,
    floor: room.floor,
    roomType: room.type,
    type: room.type,
    capacity: room.capacity,
    currentOccupancy,
    physicalOccupancy: occupiedBeds.length,
    reservedCount: reservedBeds.length,
    scheduledIncomingCount,
    occupancyRate:
      room.capacity > 0
        ? `${Math.round((currentOccupancy / room.capacity) * 100)}%`
        : "0%",
    isAvailable,
    available: isAvailable,
    readinessStatus,
    totalBeds: beds.length,
    beds,
    occupiedBeds: occupiedBeds.map((bed) => ({
      bedId: bed.id,
      position: bed.position,
      bunkBlock: bed.bunkBlock,
      code: bed.code,
      occupiedBy: {
        userId: bed.occupant?._id || null,
        userName: bed.occupant?.name || "Unknown",
        email: bed.occupant?.email || null,
        occupiedSince: bed.occupant?.occupiedSince || null,
        reservationId: bed.occupant?.reservationId || null,
        reservationStatus: bed.occupant?.reservationStatus || null,
      },
    })),
    reservedBeds: reservedBeds.map((bed) => ({
      bedId: bed.id,
      position: bed.position,
      bunkBlock: bed.bunkBlock,
      code: bed.code,
      reservedBy: {
        userId: bed.occupant?._id || null,
        userName: bed.occupant?.name || "Unknown",
        email: bed.occupant?.email || null,
        reservationId: bed.occupant?.reservationId || null,
      },
    })),
    availableBeds: availableBeds.map((bed) => ({
      bedId: bed.id,
      position: bed.position,
      lockExpiresAt: bed.lockExpiresAt || null,
    })),
    lockedBeds: lockedBeds.map((bed) => ({
      bedId: bed.id,
      position: bed.position,
      lockExpiresAt: bed.lockExpiresAt || null,
      lockedBy: bed.lockedBy || null,
    })),
    maintenanceBeds: maintenanceBeds.map((bed) => ({
      bedId: bed.id,
      position: bed.position,
    })),
  };
};

export const updateOccupancyOnReservationChange = async (
  reservation,
  oldData,
  { session: externalSession = null } = {},
) => {
  const oldStatus = oldData?.status;
  const newStatus = normalizeReservationStatus(reservation.status);
  const previousStatus = normalizeReservationStatus(oldStatus);

  if (previousStatus === newStatus) {
    return Room.findById(reservation.roomId);
  }

  const ownedSession = externalSession ? null : await mongoose.startSession();
  const session = externalSession || ownedSession;
  let finalRoom = null;

  try {
    const execute = async () => {
      const room = await Room.findById(reservation.roomId).session(session);
      if (!room) return;

      let roomChanged = false;

      const increaseOccupancy = async () => {
        const updated = await Room.atomicIncreaseOccupancy(room._id, session);
        if (!updated) {
          logger.warn({ roomId: String(room._id) }, "Occupancy increase: no room matched atomic update");
          return false;
        }

        room.currentOccupancy = Math.min((room.currentOccupancy || 0) + 1, room.capacity || 0);
        room.updateAvailability();
        roomChanged = true;
        return true;
      };

      const decreaseOccupancy = async () => {
        const updated = await Room.atomicDecreaseOccupancy(room._id, session);
        if (!updated) {
          logger.warn({ roomId: String(room._id) }, "Occupancy decrease: no room matched atomic update");
          return false;
        }

        room.currentOccupancy = Math.max((room.currentOccupancy || 0) - 1, 0);
        room.updateAvailability();
        roomChanged = true;
        return true;
      };

      if (
        newStatus === "reserved" &&
        previousStatus !== "reserved" &&
        previousStatus !== "moveIn"
      ) {
        await increaseOccupancy();

        if (reservation.selectedBed?.id) {
          // Phase 2: clear any stale pointer to this reservation on OTHER beds
          // before writing to the target bed — prevents the dual-bed display bug.
          const reservationIdStr = String(reservation._id);
          for (const otherBed of room.beds) {
            if (otherBed.id === reservation.selectedBed.id) continue;
            if (String(otherBed.occupiedBy?.reservationId) === reservationIdStr) {
              otherBed.status = "available";
              otherBed.lockedBy = null;
              otherBed.lockExpiresAt = null;
              otherBed.occupiedBy = { userId: null, reservationId: null, occupiedSince: null };
              roomChanged = true;
            }
          }

          const bed = room.beds.find((b) => b.id === reservation.selectedBed.id);
          if (bed) {
            bed.status = "reserved";
            bed.lockExpiresAt = null;
            bed.lockedBy = null;
            bed.occupiedBy = {
              userId: reservation.userId,
              reservationId: reservation._id,
              occupiedSince: null,
            };
            roomChanged = true;
          }
        }
      }

      if (newStatus === "moveIn" && previousStatus !== "moveIn") {
        if (previousStatus === "reserved") {
          if (reservation.selectedBed?.id) {
            // Phase 2: clear any stale pointers on other beds before occupying target
            const reservationIdStr = String(reservation._id);
            for (const otherBed of room.beds) {
              if (otherBed.id === reservation.selectedBed.id) continue;
              if (String(otherBed.occupiedBy?.reservationId) === reservationIdStr) {
                otherBed.status = "available";
                otherBed.lockedBy = null;
                otherBed.lockExpiresAt = null;
                otherBed.occupiedBy = { userId: null, reservationId: null, occupiedSince: null };
                roomChanged = true;
              }
            }
            const assigned = room.occupyBed(
              reservation.selectedBed.id,
              reservation.userId,
              reservation._id,
            );
            if (assigned) roomChanged = true;
          }
        } else {
          await increaseOccupancy();

          if (reservation.selectedBed?.id) {
            // Phase 2: clear any stale pointers on other beds before occupying target
            const reservationIdStr = String(reservation._id);
            for (const otherBed of room.beds) {
              if (otherBed.id === reservation.selectedBed.id) continue;
              if (String(otherBed.occupiedBy?.reservationId) === reservationIdStr) {
                otherBed.status = "available";
                otherBed.lockedBy = null;
                otherBed.lockExpiresAt = null;
                otherBed.occupiedBy = { userId: null, reservationId: null, occupiedSince: null };
                roomChanged = true;
              }
            }
            const assigned = room.occupyBed(
              reservation.selectedBed.id,
              reservation.userId,
              reservation._id,
            );
            if (assigned) roomChanged = true;
          }
        }
      }

      // FCFS model: if the reservation was in the payment window (payment_pending)
      // and moves to any status that is NOT reserved or moveIn, the bed lock must
      // be physically cleared. This covers the payment proof rejection case
      // (payment_pending → approved_for_payment) where no other branch fires.
      if (
        previousStatus === "payment_pending" &&
        newStatus !== "reserved" &&
        newStatus !== "moveIn" &&
        newStatus !== "cancelled" &&  // These are handled below
        newStatus !== "archived" &&
        newStatus !== "rejected"
      ) {
        if (reservation.selectedBed?.id) {
          const bed = room.beds.find((b) => b.id === reservation.selectedBed.id);
          if (bed && bed.status === "locked") {
            bed.status = "available";
            bed.lockedBy = null;
            bed.lockExpiresAt = null;
            bed.occupiedBy = { userId: null, reservationId: null, occupiedSince: null };
            roomChanged = true;
            logger.info(
              { reservationId: String(reservation._id), bedId: reservation.selectedBed.id, newStatus },
              "FCFS: bed lock released on payment_pending → non-confirmed status transition",
            );
          }
        }
      }

      const previouslyHeldOccupancy =
        ACTIVE_OCCUPANCY_STATUSES.includes(previousStatus);

      if (newStatus === "cancelled" || newStatus === "archived" || newStatus === "rejected") {
        if (previouslyHeldOccupancy) {
          await decreaseOccupancy();
        }

        if (reservation.selectedBed?.id) {
          const vacated = room.vacateBed(reservation.selectedBed.id);
          if (vacated) roomChanged = true;
        }

        // Fallback sweep — clear ALL beds that reference this reservation or are locked by this user.
        // This ensures rejected applications release their payment-window lock (FCFS model).
        const reservationIdStr = String(reservation._id);
        const userIdStr = reservation.userId
          ? String(reservation.userId._id || reservation.userId)
          : null;

        for (const bed of room.beds) {
          const matchesReservation = String(bed.occupiedBy?.reservationId) === reservationIdStr;
          const matchesUserLock =
            bed.status === "locked" && userIdStr && String(bed.lockedBy) === userIdStr;

          if (matchesReservation || matchesUserLock) {
            bed.status = "available";
            bed.lockedBy = null;
            bed.lockExpiresAt = null;
            bed.occupiedBy = { userId: null, reservationId: null, occupiedSince: null };
            roomChanged = true;
          }
        }
      }

      if (newStatus === "moveOut" && previousStatus !== "moveOut") {
        if (previouslyHeldOccupancy) {
          await decreaseOccupancy();

          if (reservation.selectedBed?.id) {
            const vacated = room.vacateBed(reservation.selectedBed.id);
            if (vacated) roomChanged = true;
          }

          // Phase 4: fallback sweep — clear ALL beds referencing this reservation
          const reservationIdStr = String(reservation._id);
          for (const bed of room.beds) {
            if (String(bed.occupiedBy?.reservationId) === reservationIdStr) {
              bed.status = "available";
              bed.lockedBy = null;
              bed.lockExpiresAt = null;
              bed.occupiedBy = { userId: null, reservationId: null, occupiedSince: null };
              roomChanged = true;
            }
          }
        }
      }

      if (roomChanged) {
        room.updateAvailability();
        await room.save({ session });
      }

      finalRoom = await Room.findById(room._id).session(session);
    };
    if (externalSession) await execute();
    else await session.withTransaction(execute);

    if (finalRoom && !externalSession) {
      emitRoomUpdate(finalRoom._id, {
        currentOccupancy: finalRoom.currentOccupancy,
        available: finalRoom.available,
        capacity: finalRoom.capacity,
      });
    }

    return finalRoom;
  } catch (error) {
    logger.error(
      { err: error, reservationId: String(reservation._id) },
      "Occupancy update failed — transaction aborted",
    );
    throw error;
  } finally {
    if (ownedSession) await ownedSession.endSession();
  }
};

export const recalculateRoomOccupancy = async (roomId) => {
  try {
    const room = await Room.findById(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    const activeReservations = await Reservation.find({
      roomId,
      isArchived: false,
      status: { $in: ACTIVE_OCCUPANCY_STATUSES },
    });

    room.currentOccupancy = activeReservations.length;

    const now = new Date();
    room.beds.forEach((bed) => {
      if (bed.status === "maintenance") return;

      // Reset expired or dangling locks so they don't stay locked forever
      if (
        bed.status === "locked" &&
        (!bed.lockExpiresAt || bed.lockExpiresAt < now)
      ) {
        bed.status = "available";
        bed.lockedBy = null;
        bed.lockExpiresAt = null;
      }

      const occupier = activeReservations.find(
        (res) => res.selectedBed?.id === bed.id,
      );
      if (occupier) {
        // FCFS model: getDisplayStatusForReservation now returns "available" for
        // all pre-payment stages (pending, review, approved_for_payment).
        // Only "payment_pending" → "locked", "reserved" → "reserved", "moveIn" → "occupied".
        const derivedStatus = getDisplayStatusForReservation(occupier.status);
        bed.status = derivedStatus;
        if (derivedStatus !== "available") {
          bed.occupiedBy = {
            userId: occupier.userId,
            reservationId: occupier._id,
            occupiedSince: hasReservationStatus(occupier.status, "moveIn")
              ? occupier.moveInDate || occupier.createdAt || new Date()
              : null,
          };
        } else {
          // Pre-payment stage: bed reference is cleared so other applicants can select it
          bed.lockedBy = null;
          bed.lockExpiresAt = null;
          bed.occupiedBy = { userId: null, reservationId: null, occupiedSince: null };
        }
      } else {
        bed.status = "available";
        bed.lockedBy = null;
        bed.lockExpiresAt = null;
        bed.occupiedBy = {
          userId: null,
          reservationId: null,
          occupiedSince: null,
        };
      }
    });

    room.updateAvailability();
    await room.save();

    return room;
  } catch (error) {
    logger.error({ err: error, roomId: String(roomId) }, "Recalculate occupancy failed");
    throw error;
  }
};

export const getRoomOccupancyStatus = async (roomId) => {
  try {
    const room = await Room.findById(roomId).lean();

    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    const reservations = await Reservation.find({
      roomId,
      isArchived: false,
      status: { $in: ACTIVE_OCCUPANCY_STATUSES },
    })
      .populate("userId", "firstName lastName email phone")
      .lean();

    return deriveRoomOccupancyState(room, reservations);
  } catch (error) {
    logger.error({ err: error, roomId: String(roomId) }, "Get occupancy status failed");
    throw error;
  }
};

export const getBranchOccupancyStats = async (
  branch = null,
  { includeUserDetails = true } = {},
) => {
  try {
    const filter = { isArchived: false };
    if (branch) filter.branch = branch;

    const rooms = await Room.find(filter).lean();
    const roomIds = rooms.map((room) => room._id);
    let reservations = [];

    if (roomIds.length > 0) {
      const reservationQuery = Reservation.find({
        roomId: { $in: roomIds },
        isArchived: false,
        status: { $in: ACTIVE_OCCUPANCY_STATUSES },
      });

      if (includeUserDetails) {
        reservationQuery.populate("userId", "firstName lastName email phone");
      }

      reservations = await reservationQuery.lean();
    }

    const reservationsByRoom = new Map();
    for (const reservation of reservations) {
      const key = String(reservation.roomId);
      if (!reservationsByRoom.has(key)) reservationsByRoom.set(key, []);
      reservationsByRoom.get(key).push(reservation);
    }

    const stats = rooms.map((room) =>
      deriveRoomOccupancyState(room, reservationsByRoom.get(String(room._id)) || []),
    );

    const totalCapacity = stats.reduce((sum, room) => sum + room.capacity, 0);
    const totalOccupancy = stats.reduce(
      (sum, room) => sum + room.currentOccupancy,
      0,
    );

    const occupancyRate =
      totalCapacity > 0
        ? Math.round((totalOccupancy / totalCapacity) * 100)
        : 0;

    return {
      branch: branch || "all",
      totalRooms: stats.length,
      totalCapacity,
      totalOccupancy,
      overallOccupancyRate: `${occupancyRate}%`,
      rooms: stats,
    };
  } catch (error) {
    logger.error({ err: error, branch }, "Get branch occupancy stats failed");
    throw error;
  }
};

/**
 * Release all bed slots that reference one or more deleted users or reservations.
 *
 * Call this BEFORE hard-deleting a User or Reservation so room beds referencing
 * those IDs are reset to "available" rather than left in a dangling locked/reserved
 * state with a dead ObjectId reference.
 *
 * @param {string[]} userIds        - MongoDB ObjectId strings of deleted users
 * @param {string[]} reservationIds - MongoDB ObjectId strings of deleted reservations
 * @returns {Promise<{roomsUpdated: number, bedsReleased: number}>}
 */
export const releaseOrphanedBeds = async (userIds = [], reservationIds = []) => {
  if (!userIds.length && !reservationIds.length) return { roomsUpdated: 0, bedsReleased: 0 };

  const userObjectIds = userIds
    .map((id) => {
      try { return new mongoose.Types.ObjectId(String(id)); } catch { return null; }
    })
    .filter(Boolean);

  const reservationObjectIds = reservationIds
    .map((id) => {
      try { return new mongoose.Types.ObjectId(String(id)); } catch { return null; }
    })
    .filter(Boolean);

  const userStrIds = userIds.map(String).filter(Boolean);
  const resStrIds = reservationIds.map(String).filter(Boolean);

  const allUserIds = [...userObjectIds, ...userStrIds];
  const allResIds = [...reservationObjectIds, ...resStrIds];

  // Also cascade-cancel any active/in-progress stays referencing these deleted users or reservations
  try {
    const stayFilter = {
      $or: [
        ...(allUserIds.length ? [{ tenantId: { $in: allUserIds } }] : []),
        ...(allResIds.length ? [{ reservationId: { $in: allResIds } }] : []),
      ],
      status: { $in: ["active", "ending_soon", "expired_occupancy_continuing"] },
    };
    if (stayFilter.$or.length > 0 && Stay) {
      await Stay.updateMany(stayFilter, {
        $set: {
          status: "terminated",
          endedAt: new Date(),
          endReason: "Tenant account or reservation deleted",
        },
      });
    }
  } catch (stayErr) {
    logger.warn({ err: stayErr }, "releaseOrphanedBeds stay cancellation error");
  }

  // Build a filter to find rooms that have any bed referencing these ids
  const orClauses = [];
  if (allUserIds.length) {
    orClauses.push({ "beds.lockedBy": { $in: allUserIds } });
    orClauses.push({ "beds.occupiedBy.userId": { $in: allUserIds } });
  }
  if (allResIds.length) {
    orClauses.push({ "beds.occupiedBy.reservationId": { $in: allResIds } });
  }

  let rooms = [];
  try {
    const query = Room?.find?.({ $or: orClauses });
    if (query) {
      rooms = (typeof query.exec === "function" ? await query.exec() : await query) || [];
    }
  } catch (findErr) {
    logger.warn({ err: findErr }, "releaseOrphanedBeds room query error");
  }
  let roomsUpdated = 0;
  let bedsReleased = 0;

  for (const room of rooms) {
    let changed = false;

    for (const bed of room.beds) {
      const isLockedByDeleted =
        bed.lockedBy &&
        allUserIds.some((id) => String(id) === String(bed.lockedBy));

      const isOccupiedByDeletedUser =
        bed.occupiedBy?.userId &&
        allUserIds.some((id) => String(id) === String(bed.occupiedBy.userId));

      const isOccupiedByDeletedReservation =
        bed.occupiedBy?.reservationId &&
        allResIds.some((id) => String(id) === String(bed.occupiedBy.reservationId));

      if (
        (bed.status === "locked" && (isLockedByDeleted || isOccupiedByDeletedReservation)) ||
        (bed.status === "reserved" && (isOccupiedByDeletedUser || isOccupiedByDeletedReservation)) ||
        (bed.status === "occupied" && (isOccupiedByDeletedUser || isOccupiedByDeletedReservation))
      ) {
        bed.status = "available";
        bed.lockedBy = null;
        bed.lockExpiresAt = null;
        bed.occupiedBy = { userId: null, reservationId: null, occupiedSince: null };
        bedsReleased++;
        changed = true;
      }
    }

    if (changed) {
      room.updateAvailability();
      await room.save();
      roomsUpdated++;

      emitRoomUpdate(room._id, {
        currentOccupancy: room.currentOccupancy,
        available: room.available,
        capacity: room.capacity,
      });
    }
  }

  logger.info(
    { userIds, reservationIds, roomsUpdated, bedsReleased },
    "releaseOrphanedBeds: cleaned up orphaned bed references",
  );

  return { roomsUpdated, bedsReleased };
};

export default {
  deriveRoomOccupancyState,
  updateOccupancyOnReservationChange,
  recalculateRoomOccupancy,
  getRoomOccupancyStatus,
  getBranchOccupancyStats,
  releaseOrphanedBeds,
};
