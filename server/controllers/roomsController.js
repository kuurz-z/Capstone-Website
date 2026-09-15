/**
 * Room controllers.
 */

import {
  Room,
  Reservation,
  Stay,
  BedHistory,
  BillingPeriod,
  UtilityPeriod,
  MaintenanceRequest,
  User,
  ROOM_BRANCHES,
} from "../models/index.js";
import auditLogger from "../utils/auditLogger.js";
import logger from "../middleware/logger.js";
import dayjs from "dayjs";
import {
  getBusinessSettings,
  getBranchSettings,
} from "../utils/businessSettings.js";
import { isAdminRole } from "../config/roles.js";
import { resolveRoomDiscountPricing } from "../services/contractPricingResolver.js";
import { emitRoomUpdate } from "../utils/socket.js";
import {
  deriveRoomOccupancyState,
  recalculateRoomOccupancy,
  getDisplayStatusForReservation,
} from "../utils/occupancyManager.js";
import { sendSuccess, AppError } from "../middleware/errorHandler.js";
import { OPEN_MAINTENANCE_STATUSES } from "../config/maintenance.js";
import {
  ACTIVE_OCCUPANCY_STATUS_QUERY,
  reservationStatusesForQuery,
} from "../utils/lifecycleNaming.js";
const ACTIVE_BED_HOLD_STATUSES = Object.freeze([
  "pending",
  "viewing_preference_selected",
  "visit_pending",
  "visit_approved",
  "pending_application_review",
  "needs_revision",
  "approved_for_payment",
  "payment_pending",
  "reserved",
  "move_in_overdue",
  "moveIn",
  "moved_in",
  "movein",
]);

export const isPopulatedUser = (u) => Boolean(u && typeof u === "object" && (u.email || u.firstName || u.name || u.role));

export const syncRealtimeBedStatuses = async (rooms) => {
  if (!Array.isArray(rooms) || rooms.length === 0) return rooms;
  const roomIds = rooms.map((r) => r._id).filter(Boolean);
  if (roomIds.length === 0) return rooms;

  const [activeReservations, activeStays] = await Promise.all([
    Reservation.find({
      roomId: { $in: roomIds },
      status: { $in: ACTIVE_BED_HOLD_STATUSES },
      isArchived: { $ne: true },
    })
      .select(
        "roomId selectedBed status moveInDate checkInDate targetMoveInDate createdAt leaseDuration leaseExtensions userId firstName lastName billingEmail mobileNumber",
      )
      .populate("userId", "firstName lastName name email role user_id phone")
      .lean(),
    Stay.find({
      roomId: { $in: roomIds },
      status: { $in: ["active", "ending_soon", "expired_occupancy_continuing"] },
    })
      .select("roomId bedId bunkBlock bedCode tenantId reservationId moveInDate checkInDate leaseStartDate leaseEndDate status monthlyRent")
      .populate("tenantId", "firstName lastName name email role user_id phone")
      .lean(),
  ]);

  // Collect unpopulated userId references from active reservations, stays, and room beds
  const unpopulatedUserIds = new Set();
  for (const resDoc of activeReservations) {
    if (resDoc.userId && !isPopulatedUser(resDoc.userId)) {
      unpopulatedUserIds.add(String(resDoc.userId._id || resDoc.userId));
    }
  }
  for (const stayDoc of activeStays) {
    if (stayDoc.tenantId && !isPopulatedUser(stayDoc.tenantId)) {
      unpopulatedUserIds.add(String(stayDoc.tenantId._id || stayDoc.tenantId));
    }
  }
  for (const room of rooms) {
    if (Array.isArray(room.beds)) {
      for (const b of room.beds) {
        if (b.occupiedBy?.userId && !isPopulatedUser(b.occupiedBy.userId)) {
          unpopulatedUserIds.add(String(b.occupiedBy.userId._id || b.occupiedBy.userId));
        }
      }
    }
  }

  const userMap = new Map();
  for (const resDoc of activeReservations) {
    if (resDoc.userId && isPopulatedUser(resDoc.userId)) {
      userMap.set(String(resDoc.userId._id || resDoc.userId), resDoc.userId);
    }
  }
  for (const stayDoc of activeStays) {
    if (stayDoc.tenantId && isPopulatedUser(stayDoc.tenantId)) {
      userMap.set(String(stayDoc.tenantId._id || stayDoc.tenantId), stayDoc.tenantId);
    }
  }

  if (unpopulatedUserIds.size > 0) {
    const extraUsers = await User.find({
      _id: { $in: Array.from(unpopulatedUserIds) },
    })
      .select("firstName lastName name email role user_id phone")
      .lean();

    for (const u of extraUsers) {
      if (isPopulatedUser(u)) {
        userMap.set(String(u._id), u);
      }
    }
  }

  // Scheduled Room Transfer: OPEN inbound schedules ({scheduled,
  // action_required}) hold a real destination-capacity slot BEFORE the
  // effective date — for a shared room a specific "reserved" bed, for a
  // private room a bare capacity slot. Their tenant reservation is still in
  // the SOURCE room, so without this the sync would render the held bed as
  // "available" and reconcile currentOccupancy down. See
  // scheduledRoomTransferService.js.
  let scheduledHoldsByRoom = new Map();
  try {
    const { openHoldsByRoom } = await import("../services/scheduledRoomTransferService.js");
    scheduledHoldsByRoom = await openHoldsByRoom(roomIds);
  } catch (holdErr) {
    logger.warn({ err: holdErr }, "syncRealtimeBedStatuses: failed to load scheduled-transfer holds (non-fatal)");
  }

  const reservationByIdMap = new Map(activeReservations.map((r) => [String(r._id), r]));

  const resByRoom = new Map();
  for (const resDoc of activeReservations) {
    const key = String(resDoc.roomId);
    if (!resByRoom.has(key)) resByRoom.set(key, []);
    resByRoom.get(key).push(resDoc);
  }

  const staysByRoom = new Map();
  for (const stayDoc of activeStays) {
    const key = String(stayDoc.roomId);
    if (!staysByRoom.has(key)) staysByRoom.set(key, []);
    staysByRoom.get(key).push(stayDoc);
  }

  return rooms.map((room) => {
    const roomReservations = resByRoom.get(String(room._id)) || [];
    const roomStays = staysByRoom.get(String(room._id)) || [];
    const beds = Array.isArray(room.beds) ? room.beds : [];

    const scheduledHolds = scheduledHoldsByRoom.get(String(room._id)) || [];
    const scheduledHoldsMap = new Map(
      scheduledHolds
        .filter((h) => h.destinationBedId)
        .map((h) => [String(h.destinationBedId), h])
    );
    const heldBedIds = new Set(scheduledHoldsMap.keys());
    // Private / capacity-only holds (no bed) — added to the derived occupancy
    // separately since there is no bed row to carry them.
    const bedlessScheduledHolds = scheduledHolds.filter((h) => !h.destinationBedId).length;

    const matchedResIds = new Set();
    const matchedStayIds = new Set();
    const matchedUserIds = new Set();

    let updatedBeds = beds.map((bed, bedIdx) => {
      const bId = bed.id ? String(bed.id).trim().toLowerCase() : null;
      const bCode = bed.code ? String(bed.code).trim().toLowerCase() : null;
      const bMongoId = bed._id ? String(bed._id).trim() : null;
      const bNum = bed.bedNumber != null ? String(bed.bedNumber) : null;

      // Scheduled inbound transfer hold: render as "reserved" (committed
      // capacity) with a scheduledIncoming marker. Display metadata only — the
      // tenant's actual current room is unchanged.
      if (bed.id && heldBedIds.has(String(bed.id))) {
        const hold = scheduledHoldsMap.get(String(bed.id));
        return {
          ...bed,
          status: "reserved",
          available: false,
          scheduledIncoming: true,
          expectedVacancyDate: null,
          daysRemaining: null,
          occupiedBy: {
            userId: hold?.tenantId ? String(hold.tenantId) : null,
            reservationId: hold?.reservationId ? String(hold.reservationId) : null,
            occupiedSince: null,
            name: null,
            firstName: null,
            lastName: null,
            email: null,
            phone: null,
            role: null,
            user_id: null,
            status: "scheduled_transfer_incoming",
            scheduledTransferEffectiveDate: hold?.effectiveTransferDate || null,
          },
        };
      }

      const occBedUserId = bed.occupiedBy?.userId ? String(bed.occupiedBy.userId) : null;
      const occBedResId = bed.occupiedBy?.reservationId ? String(bed.occupiedBy.reservationId) : null;
      const bPosition = bed.position ? String(bed.position).trim().toLowerCase() : null;
      const bBlock = bed.bunkBlock ? String(bed.bunkBlock).trim().toUpperCase() : null;

      // Priority 1: Check if an active Stay exists for this specific bed
      const matchingStay = roomStays.find((stayDoc) => {
        if (matchedStayIds.has(String(stayDoc._id))) return false;
        const stayTenantId = stayDoc.tenantId?._id ? String(stayDoc.tenantId._id) : String(stayDoc.tenantId || "");
        if (!stayTenantId) return false;

        // Ignore ghost stays where the tenant user was deleted or does not exist
        const stayUser =
          isPopulatedUser(stayDoc.userId)
            ? stayDoc.userId
            : isPopulatedUser(stayDoc.tenantId)
            ? stayDoc.tenantId
            : userMap.get(stayTenantId) || null;
        if (!stayUser) return false;

        const stayResId = stayDoc.reservationId ? String(stayDoc.reservationId) : null;
        if (stayTenantId && matchedUserIds.has(stayTenantId)) return false;
        if (stayResId && matchedResIds.has(stayResId)) return false;

        const sBedId = stayDoc.bedId ? String(stayDoc.bedId).trim().toLowerCase() : null;
        const sCode = stayDoc.bedCode ? String(stayDoc.bedCode).trim().toLowerCase() : null;
        const sBlock = stayDoc.bunkBlock ? String(stayDoc.bunkBlock).trim().toUpperCase() : null;

        // Exact bed ID or code match
        const exactBedMatch =
          (sBedId && (sBedId === bId || sBedId === bCode || sBedId === bMongoId || sBedId === bNum)) ||
          (sCode && (sCode === bCode || sCode === bId));

        // Position & Bunk Block match (e.g. "lower" === "lower", "upper" === "upper")
        const positionBlockMatch =
          Boolean(sBedId && bPosition && sBedId === bPosition) &&
          (!sBlock || !bBlock || sBlock === bBlock);

        // Stale database occupant match only if position is not contradictory
        const occMatch =
          ((occBedResId && stayResId && occBedResId === stayResId) ||
           (occBedUserId && stayTenantId && occBedUserId === stayTenantId)) &&
          (!sBedId || !bPosition || sBedId === bPosition || sBedId === bId);

        return exactBedMatch || positionBlockMatch || occMatch;
      });

      // Priority 2: Check if an active Reservation exists for this bed (if no stay already on it)
      const matchingHold = !matchingStay
        ? roomReservations.find((resDoc) => {
            if (matchedResIds.has(String(resDoc._id))) return false;
            const resUserId = resDoc.userId?._id ? String(resDoc.userId._id) : String(resDoc.userId || "");
            if (resUserId && matchedUserIds.has(resUserId)) return false;

            const selId = resDoc.selectedBed?.id ? String(resDoc.selectedBed.id).trim().toLowerCase() : null;
            const selCode = resDoc.selectedBed?.code ? String(resDoc.selectedBed.code).trim().toLowerCase() : null;
            const selNum = resDoc.selectedBed?.bedNumber != null ? String(resDoc.selectedBed.bedNumber) : null;
            const selPosition = resDoc.selectedBed?.position ? String(resDoc.selectedBed.position).trim().toLowerCase() : null;
            const selBlock = resDoc.selectedBed?.bunkBlock ? String(resDoc.selectedBed.bunkBlock).trim().toUpperCase() : null;
            const resIdStr = String(resDoc._id);

            // Exact bed ID or code match
            const exactBedMatch =
              (selId && (selId === bId || selId === bCode || selId === bMongoId || selId === bNum)) ||
              (selCode && (selCode === bCode || selCode === bId)) ||
              (selNum && (selNum === bNum || selNum === bId));

            // Position & Bunk Block match (e.g. "lower" === "lower")
            const positionBlockMatch =
              Boolean(selPosition && bPosition && selPosition === bPosition) &&
              (!selBlock || !bBlock || selBlock === bBlock);

            // Stale database occupant match only if position is not contradictory
            const occMatch =
              ((occBedResId && occBedResId === resIdStr) ||
               (occBedUserId && resUserId && occBedUserId === resUserId)) &&
              (!selPosition || !bPosition || selPosition === bPosition || selId === bId);

            return exactBedMatch || positionBlockMatch || occMatch;
          })
        : null;

      if (matchingStay) {
        matchedStayIds.add(String(matchingStay._id));
        if (matchingStay.reservationId) matchedResIds.add(String(matchingStay.reservationId));
        const stayTenantId = matchingStay.tenantId?._id ? String(matchingStay.tenantId._id) : String(matchingStay.tenantId || "");
        if (stayTenantId) matchedUserIds.add(stayTenantId);

        let stayUser =
          isPopulatedUser(matchingStay.userId)
            ? matchingStay.userId
            : isPopulatedUser(matchingStay.tenantId)
            ? matchingStay.tenantId
            : userMap.get(String(matchingStay.userId || matchingStay.tenantId)) || null;

        const stayRes = matchingStay.reservationId
          ? reservationByIdMap.get(String(matchingStay.reservationId)) || null
          : null;

        if (!stayUser && stayRes?.userId) {
          stayUser = isPopulatedUser(stayRes.userId) ? stayRes.userId : userMap.get(String(stayRes.userId));
        }

        let name = null;
        if (stayUser) {
          if (stayUser.name) name = stayUser.name;
          else if (stayUser.firstName || stayUser.lastName) {
            name = `${stayUser.firstName || ""} ${stayUser.lastName || ""}`.trim();
          } else if (stayUser.email) name = stayUser.email;
        }
        if (!name && stayRes && (stayRes.firstName || stayRes.lastName)) {
          name = `${stayRes.firstName || ""} ${stayRes.lastName || ""}`.trim();
        }

        let expectedVacancyDate = null;
        let daysRemaining = null;
        if (matchingStay.leaseEndDate) {
          const expectedEnd = dayjs(matchingStay.leaseEndDate);
          if (expectedEnd.isValid()) {
            expectedVacancyDate = expectedEnd.toDate();
            daysRemaining = Math.max(0, expectedEnd.diff(dayjs(), "day"));
          }
        }

        const finalUserId = stayUser?._id ? String(stayUser._id) : (matchingStay.tenantId ? String(matchingStay.tenantId) : (stayRes?.userId ? String(stayRes.userId) : null));
        const finalEmail = stayUser?.email || stayRes?.billingEmail || null;
        const finalPhone = stayUser?.phone || stayRes?.mobileNumber || null;

        return {
          ...bed,
          status: "occupied",
          available: false,
          expectedVacancyDate,
          daysRemaining,
          occupiedBy: {
            userId: finalUserId,
            reservationId: matchingStay.reservationId || null,
            occupiedSince: matchingStay.moveInDate || matchingStay.checkInDate || matchingStay.leaseStartDate || null,
            name: name || null,
            firstName: stayUser?.firstName || stayRes?.firstName || null,
            lastName: stayUser?.lastName || stayRes?.lastName || null,
            email: finalEmail,
            phone: finalPhone,
            role: stayUser?.role || null,
            user_id: stayUser?.user_id || null,
            status: "active",
          },
        };
      }

      if (matchingHold) {
        matchedResIds.add(String(matchingHold._id));
        const resUserIdStr = matchingHold.userId?._id ? String(matchingHold.userId._id) : String(matchingHold.userId || "");
        if (resUserIdStr) matchedUserIds.add(resUserIdStr);

        const nextStatus = getDisplayStatusForReservation(matchingHold.status);
        let expectedVacancyDate = null;
        let daysRemaining = null;

        const moveInDate =
          matchingHold.moveInDate ||
          matchingHold.checkInDate ||
          matchingHold.targetMoveInDate ||
          matchingHold.createdAt;

        const baseDuration = Number(matchingHold.leaseDuration || 0);
        const extensions = Array.isArray(matchingHold.leaseExtensions)
          ? matchingHold.leaseExtensions.reduce((sum, ext) => sum + (Number(ext.addedMonths) || 0), 0)
          : 0;
        const totalMonths = baseDuration + extensions;

        if (moveInDate && totalMonths > 0) {
          const expectedEnd = dayjs(moveInDate).add(totalMonths, "month");
          expectedVacancyDate = expectedEnd.toDate();
          daysRemaining = Math.max(0, expectedEnd.diff(dayjs(), "day"));
        }

        const resUser =
          isPopulatedUser(matchingHold.userId)
            ? matchingHold.userId
            : matchingHold.userId
            ? userMap.get(String(matchingHold.userId._id || matchingHold.userId))
            : null;

        let name = null;
        if (resUser) {
          if (resUser.name) name = resUser.name;
          else if (resUser.firstName || resUser.lastName) {
            name = `${resUser.firstName || ""} ${resUser.lastName || ""}`.trim();
          } else if (resUser.email) name = resUser.email;
        }
        if (!name && (matchingHold.firstName || matchingHold.lastName)) {
          name = `${matchingHold.firstName || ""} ${matchingHold.lastName || ""}`.trim();
        }

        return {
          ...bed,
          status: nextStatus,
          available: nextStatus === "available",
          expectedVacancyDate: nextStatus !== "available" ? expectedVacancyDate : null,
          daysRemaining: nextStatus !== "available" ? daysRemaining : null,
          occupiedBy: nextStatus !== "available" ? {
            userId: resUser?._id ? String(resUser._id) : (matchingHold.userId ? String(matchingHold.userId) : null),
            reservationId: matchingHold._id || null,
            occupiedSince: matchingHold.moveInDate || matchingHold.createdAt || null,
            name: name || null,
            firstName: resUser?.firstName || matchingHold.firstName || null,
            lastName: resUser?.lastName || matchingHold.lastName || null,
            email: resUser?.email || matchingHold.billingEmail || null,
            phone: resUser?.phone || matchingHold.mobileNumber || null,
            role: resUser?.role || null,
            user_id: resUser?.user_id || null,
            status: matchingHold.status || null,
          } : {
            userId: null,
            reservationId: null,
            occupiedSince: null,
            name: null,
            firstName: null,
            lastName: null,
            email: null,
            phone: null,
            role: null,
            user_id: null,
            status: null,
          },
        };
      }

      // If bed is explicitly locked for maintenance, preserve maintenance status
      if (bed.status === "maintenance") {
        return {
          ...bed,
          status: "maintenance",
          available: false,
          expectedVacancyDate: null,
          daysRemaining: null,
          occupiedBy: {
            userId: null,
            reservationId: null,
            occupiedSince: null,
            name: null,
            firstName: null,
            lastName: null,
            email: null,
            phone: null,
            role: null,
            user_id: null,
            status: null,
          },
        };
      }

      // No active reservation and no active stay -> Bed is truly vacant & available
      return {
        ...bed,
        status: "available",
        available: true,
        expectedVacancyDate: null,
        daysRemaining: null,
        occupiedBy: {
          userId: null,
          reservationId: null,
          occupiedSince: null,
          name: null,
          firstName: null,
          lastName: null,
          email: null,
          phone: null,
          role: null,
          user_id: null,
          status: null,
        },
      };
    });

    // Also assign any unmatched active reservations to available beds
    const unmatchedReservations = roomReservations.filter((r) => {
      const rId = String(r._id);
      const rUser = r.userId?._id ? String(r.userId._id) : String(r.userId || "");
      return !matchedResIds.has(rId) && (!rUser || !matchedUserIds.has(rUser));
    });
    if (unmatchedReservations.length > 0) {
      updatedBeds = updatedBeds.map((bed) => {
        if (bed.status === "available" && unmatchedReservations.length > 0) {
          const matchingHold = unmatchedReservations.shift();
          matchedResIds.add(String(matchingHold._id));
          const resUserIdStr = matchingHold.userId?._id ? String(matchingHold.userId._id) : String(matchingHold.userId || "");
          if (resUserIdStr) matchedUserIds.add(resUserIdStr);

          const nextStatus = getDisplayStatusForReservation(matchingHold.status);
          let expectedVacancyDate = null;
          let daysRemaining = null;

          const moveInDate =
            matchingHold.moveInDate ||
            matchingHold.checkInDate ||
            matchingHold.targetMoveInDate ||
            matchingHold.createdAt;

          const baseDuration = Number(matchingHold.leaseDuration || 0);
          const extensions = Array.isArray(matchingHold.leaseExtensions)
            ? matchingHold.leaseExtensions.reduce((sum, ext) => sum + (Number(ext.addedMonths) || 0), 0)
            : 0;
          const totalMonths = baseDuration + extensions;

          if (moveInDate && totalMonths > 0) {
            const expectedEnd = dayjs(moveInDate).add(totalMonths, "month");
            expectedVacancyDate = expectedEnd.toDate();
            daysRemaining = Math.max(0, expectedEnd.diff(dayjs(), "day"));
          }

          const resUser =
            isPopulatedUser(matchingHold?.userId)
              ? matchingHold.userId
              : matchingHold?.userId
              ? userMap.get(String(matchingHold.userId._id || matchingHold.userId))
              : null;
          const occUserId = resUser?._id ? String(resUser._id) : null;

          let name = null;
          if (resUser) {
            if (resUser.name) name = resUser.name;
            else if (resUser.firstName || resUser.lastName) {
              name = `${resUser.firstName || ""} ${resUser.lastName || ""}`.trim();
            } else if (resUser.email) name = resUser.email;
          }

          return {
            ...bed,
            status: nextStatus,
            available: nextStatus === "available",
            expectedVacancyDate,
            daysRemaining,
            occupiedBy: nextStatus !== "available" ? {
              userId: occUserId || null,
              reservationId: matchingHold._id || null,
              occupiedSince: matchingHold.moveInDate || matchingHold.createdAt || null,
              name: name || null,
              firstName: resUser?.firstName || null,
              lastName: resUser?.lastName || null,
              email: resUser?.email || null,
              phone: resUser?.phone || null,
              role: resUser?.role || null,
              user_id: resUser?.user_id || null,
              status: matchingHold.status || null,
            } : {
              userId: null,
              reservationId: null,
              occupiedSince: null,
              name: null,
              firstName: null,
              lastName: null,
              email: null,
              phone: null,
              role: null,
              user_id: null,
              status: null,
            },
          };
        }
        return bed;
      });
    }

    // Also assign any unmatched active stays to available or unassigned beds
    const unmatchedStays = roomStays.filter((s) => {
      const sId = String(s._id);
      const sRes = s.reservationId ? String(s.reservationId) : null;
      const sUser = s.tenantId?._id ? String(s.tenantId._id) : String(s.tenantId || "");
      if (!sUser) return false;
      const resolvedUser =
        isPopulatedUser(s.userId)
          ? s.userId
          : isPopulatedUser(s.tenantId)
          ? s.tenantId
          : userMap.get(sUser) || null;
      if (!resolvedUser) return false;
      return !matchedStayIds.has(sId) && (!sRes || !matchedResIds.has(sRes)) && !matchedUserIds.has(sUser);
    });
    if (unmatchedStays.length > 0) {
      updatedBeds = updatedBeds.map((bed) => {
        if (unmatchedStays.length > 0 && (bed.status === "available" || !bed.occupiedBy?.name)) {
          const stayDoc = unmatchedStays.shift();
          const stayTenantIdStr = stayDoc.tenantId?._id ? String(stayDoc.tenantId._id) : String(stayDoc.tenantId || "");
          const stayUser =
            isPopulatedUser(stayDoc.userId)
              ? stayDoc.userId
              : isPopulatedUser(stayDoc.tenantId)
              ? stayDoc.tenantId
              : userMap.get(stayTenantIdStr) || null;
          if (!stayUser) return bed;

          matchedStayIds.add(String(stayDoc._id));
          if (stayDoc.reservationId) matchedResIds.add(String(stayDoc.reservationId));
          if (stayTenantIdStr) matchedUserIds.add(stayTenantIdStr);

          let name = null;
          if (stayUser) {
            if (stayUser.name) name = stayUser.name;
            else if (stayUser.firstName || stayUser.lastName) {
              name = `${stayUser.firstName || ""} ${stayUser.lastName || ""}`.trim();
            } else if (stayUser.email) name = stayUser.email;
          }

          let expectedVacancyDate = null;
          let daysRemaining = null;
          if (stayDoc.leaseEndDate) {
            const expectedEnd = dayjs(stayDoc.leaseEndDate);
            if (expectedEnd.isValid()) {
              expectedVacancyDate = expectedEnd.toDate();
              daysRemaining = Math.max(0, expectedEnd.diff(dayjs(), "day"));
            }
          }

          return {
            ...bed,
            status: "occupied",
            available: false,
            expectedVacancyDate,
            daysRemaining,
            occupiedBy: {
              userId: stayUser?._id ? String(stayUser._id) : (stayDoc.tenantId ? String(stayDoc.tenantId) : null),
              reservationId: stayDoc.reservationId || null,
              occupiedSince: stayDoc.moveInDate || stayDoc.checkInDate || stayDoc.leaseStartDate || null,
              name: name || null,
              firstName: stayUser?.firstName || null,
              lastName: stayUser?.lastName || null,
              email: stayUser?.email || null,
              phone: stayUser?.phone || null,
              role: stayUser?.role || null,
              user_id: stayUser?.user_id || null,
              status: "active",
            },
          };
        }
        return bed;
      });
    }

    const vacantDates = updatedBeds
      .map((b) => b.expectedVacancyDate)
      .filter(Boolean)
      .sort((a, b) => new Date(a) - new Date(b));

    // Ground-truth occupancy: count beds that are occupied, reserved, or
    // locked, PLUS any private/capacity-only scheduled-transfer holds (which
    // have no bed row to be counted above).
    const liveOccupancy =
      updatedBeds.filter(
        (b) =>
          b.status === "occupied" ||
          b.status === "reserved" ||
          b.status === "locked",
      ).length + bedlessScheduledHolds;

    const bedsChanged =
      !room.beds ||
      room.beds.length !== updatedBeds.length ||
      updatedBeds.some((uBed, idx) => {
        const oBed = room.beds[idx];
        if (!oBed) return true;
        const uStatus = uBed.status || (uBed.available === false ? "occupied" : "available");
        const oStatus = oBed.status || (oBed.available === false ? "occupied" : "available");
        const uUserId = String(uBed.occupiedBy?.userId || "");
        const oUserId = String(oBed.occupiedBy?.userId || "");
        const uResId = String(uBed.occupiedBy?.reservationId || "");
        const oResId = String(oBed.occupiedBy?.reservationId || "");
        return uStatus !== oStatus || uUserId !== oUserId || uResId !== oResId;
      });

    if (room.currentOccupancy !== liveOccupancy || bedsChanged) {
      Room.updateOne(
        { _id: room._id },
        {
          $set: {
            beds: updatedBeds,
            currentOccupancy: liveOccupancy,
            available: liveOccupancy < (room.capacity || 1),
          },
        }
      ).catch((err) =>
        logger.error({ err, roomId: String(room._id) }, "Failed to auto-reconcile room currentOccupancy")
      );
    }

    return {
      ...room,
      beds: updatedBeds,
      currentOccupancy: liveOccupancy,
      nextExpectedVacancy: vacantDates[0] || room.nextExpectedVacancy || null,
    };
  });
};

export const sanitizeRoomsForViewer = (rooms, req) => {
  const authUser = req?.authUser;
  const isAdmin = authUser && isAdminRole(authUser.role);
  if (isAdmin) {
    return rooms;
  }

  const viewerUserId = authUser?._id ? String(authUser._id) : null;
  const viewerCustomId = authUser?.user_id ? String(authUser.user_id) : null;

  return rooms.map((room) => {
    if (!room || !Array.isArray(room.beds)) return room;
    const sanitizedBeds = room.beds.map((bed) => {
      if (!bed || !bed.occupiedBy) return bed;

      const occUserId = bed.occupiedBy.userId ? String(bed.occupiedBy.userId) : null;
      const occCustomId = bed.occupiedBy.user_id ? String(bed.occupiedBy.user_id) : null;
      const isSelf =
        (viewerUserId && occUserId && viewerUserId === occUserId) ||
        (viewerCustomId && occCustomId && viewerCustomId === occCustomId);

      if (isSelf) {
        return bed;
      }

      return {
        ...bed,
        occupiedBy: {
          status: bed.status === "available" ? null : "occupied",
          userId: null,
          reservationId: null,
          occupiedSince: null,
          name: null,
          firstName: null,
          lastName: null,
          email: null,
          phone: null,
          role: null,
          user_id: null,
        },
      };
    });

    return {
      ...room,
      beds: sanitizedBeds,
    };
  });
};

const ROOM_CREATE_FIELDS = Object.freeze([
  "name",
  "roomNumber",
  "description",
  "floor",
  "branch",
  "type",
  "capacity",
  "price",
  "monthlyPrice",
  "regularLongRate",
  "regularShortRate",
  "amenities",
  "policies",
  "intendedTenant",
  "images",
  "isPopular",
  "beds",
]);

const ROOM_UPDATE_FIELDS = Object.freeze(
  ROOM_CREATE_FIELDS.filter((field) => field !== "beds"),
);

const SYSTEM_OWNED_ROOM_FIELDS = Object.freeze([
  "currentOccupancy",
  "available",
  "isArchived",
  "archivedAt",
  "archivedBy",
]);

const SYSTEM_OWNED_BED_FIELDS = Object.freeze([
  "occupiedBy",
  "lockExpiresAt",
  "lockedBy",
]);

const SYSTEM_OWNED_BED_STATUSES = new Set(["locked", "reserved", "occupied"]);
const ADMIN_EDITABLE_BED_STATUSES = new Set(["available", "maintenance"]);
const BED_POSITIONS = new Set(["upper", "lower"]);

const normalizeRoomType = (rawType) => {
  if (!rawType) return null;
  const value = String(rawType).toLowerCase();
  if (value.includes("private")) return "private";
  if (value.includes("double") || value.includes("shared")) {
    return "double-sharing";
  }
  if (
    value.includes("quad") ||
    value.includes("six") ||
    value.includes("6-person")
  ) {
    return "quadruple-sharing";
  }
  return null;
};

const normalizeBranch = (rawBranch) => {
  if (!rawBranch) return null;
  const value = String(rawBranch).toLowerCase();
  if (value.includes("gil")) return "gil-puyat";
  if (value.includes("guad")) return "guadalupe";
  return value;
};

const normalizeRoom = (room) => {
  const name =
    room.name || room.roomNumber || room.room_number || room.room_id || null;
  const roomNumber =
    room.roomNumber || room.room_number || room.name || room.room_id || null;
  const type = normalizeRoomType(room.type || room.room_type);
  const branch = normalizeBranch(room.branch);
  const capacity = room.capacity ?? null;
  const currentOccupancy = room.currentOccupancy ?? 0;
  const price = room.price ?? room.regular_price ?? null;
  const available =
    typeof room.available === "boolean"
      ? room.available
      : typeof room.status === "string"
        ? room.status.toLowerCase() === "available"
        : capacity !== null
          ? currentOccupancy < capacity
          : undefined;

  return {
    ...room,
    name,
    roomNumber,
    type,
    branch,
    capacity,
    currentOccupancy,
    price,
    available,
  };
};

const parsePositiveInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parseNumber = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};

const assertRoomId = (roomId) => {
  if (!roomId.match(/^[0-9a-fA-F]{24}$/)) {
    throw new AppError("Invalid room ID format", 400, "INVALID_ROOM_ID");
  }
};

const pickFields = (payload, allowedFields) =>
  Object.fromEntries(
    Object.entries(payload || {}).filter(([field]) => allowedFields.includes(field)),
  );

const generateDefaultBeds = (type, capacity) => {
  if (type === "private") {
    // Private = 1 tenant but 2 beds (1 bunk: upper + lower)
    return [
      { id: "bed-1", position: "upper", status: "available" },
      { id: "bed-2", position: "lower", status: "available" },
    ];
  }

  return Array.from({ length: Number(capacity) || 0 }, (_, index) => ({
    id: `bed-${index + 1}`,
    position: index % 2 === 0 ? "upper" : "lower",
    status: "available",
  }));
};


const normalizeBedPayload = (beds = [], fallbackType, fallbackCapacity) => {
  const sourceBeds = Array.isArray(beds) && beds.length > 0
    ? beds
    : generateDefaultBeds(fallbackType, fallbackCapacity);

  return sourceBeds.map((bed, index) => ({
    id: String(bed.id || `bed-${index + 1}`),
    position: bed.position,
    status: bed.status === "maintenance" ? "maintenance" : "available",
  }));
};

const assertNoSystemOwnedRoomFields = (payload, { allowBeds }) => {
  const forbiddenRoomFields = SYSTEM_OWNED_ROOM_FIELDS.filter(
    (field) => payload?.[field] !== undefined,
  );

  if (payload?.beds !== undefined && !allowBeds) {
    forbiddenRoomFields.push("beds");
  }

  if (forbiddenRoomFields.length > 0) {
    throw new AppError(
      `Room payload contains system-owned fields: ${forbiddenRoomFields.join(", ")}`,
      400,
      "ROOM_SYSTEM_FIELDS_FORBIDDEN",
      { fields: forbiddenRoomFields },
    );
  }

  if (!Array.isArray(payload?.beds)) {
    return;
  }

  const forbiddenBedFields = [];
  for (const bed of payload.beds) {
    for (const field of SYSTEM_OWNED_BED_FIELDS) {
      if (bed?.[field] !== undefined) {
        forbiddenBedFields.push(field);
      }
    }

    if (bed?.status && SYSTEM_OWNED_BED_STATUSES.has(String(bed.status))) {
      forbiddenBedFields.push(`status:${bed.status}`);
    }
  }

  if (forbiddenBedFields.length > 0) {
    throw new AppError(
      "Bed payload contains system-owned occupancy fields",
      400,
      "BED_SYSTEM_FIELDS_FORBIDDEN",
      { fields: [...new Set(forbiddenBedFields)] },
    );
  }
};

const sanitizeRoomPayload = (payload, { allowBeds }) => {
  assertNoSystemOwnedRoomFields(payload, { allowBeds });

  const allowedFields = allowBeds ? ROOM_CREATE_FIELDS : ROOM_UPDATE_FIELDS;
  const sanitized = pickFields(payload, allowedFields);

  if (sanitized.name !== undefined) sanitized.name = String(sanitized.name).trim();
  if (sanitized.roomNumber !== undefined) {
    sanitized.roomNumber = String(sanitized.roomNumber).trim();
  }
  if (sanitized.description !== undefined) {
    sanitized.description = String(sanitized.description || "").trim();
  }
  if (sanitized.intendedTenant !== undefined) {
    sanitized.intendedTenant = String(sanitized.intendedTenant || "").trim();
  }
  if (sanitized.branch !== undefined) {
    sanitized.branch = normalizeBranch(sanitized.branch);
  }
  if (sanitized.type !== undefined) {
    sanitized.type = normalizeRoomType(sanitized.type) || sanitized.type;
  }
  if (sanitized.floor !== undefined) sanitized.floor = parseNumber(sanitized.floor);
  if (sanitized.capacity !== undefined) {
    sanitized.capacity = parseNumber(sanitized.capacity);
  }
  if (sanitized.price !== undefined) sanitized.price = parseNumber(sanitized.price);
  if (sanitized.regularLongRate !== undefined) {
    sanitized.regularLongRate = parseNumber(sanitized.regularLongRate);
  }
  if (sanitized.regularShortRate !== undefined) {
    sanitized.regularShortRate = parseNumber(sanitized.regularShortRate);
  }
  if (sanitized.monthlyPrice !== undefined) {
    sanitized.monthlyPrice = parseNumber(sanitized.monthlyPrice);
  }
  if (sanitized.amenities !== undefined) {
    sanitized.amenities = Array.isArray(sanitized.amenities)
      ? sanitized.amenities.map((entry) => String(entry).trim()).filter(Boolean)
      : [];
  }
  if (sanitized.policies !== undefined) {
    sanitized.policies = Array.isArray(sanitized.policies)
      ? sanitized.policies.map((entry) => String(entry).trim()).filter(Boolean)
      : [];
  }
  if (sanitized.images !== undefined) {
    sanitized.images = Array.isArray(sanitized.images)
      ? sanitized.images.map((entry) => String(entry).trim()).filter(Boolean)
      : [];
  }

  if (allowBeds) {
    sanitized.beds = normalizeBedPayload(
      sanitized.beds,
      sanitized.type,
      sanitized.capacity,
    );
  }

  return sanitized;
};

const buildRoomQueryFilter = (query = {}) => {
  const filter = { isArchived: false };

  if (query.branch) filter.branch = query.branch;
  if (query.type) filter.type = query.type;
  if (query.available !== undefined) filter.available = query.available === "true";

  const floor = parsePositiveInt(query.floor);
  if (floor !== null) filter.floor = floor;

  const search = String(query.search || "").trim();
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: { $regex: escaped, $options: "i" } },
      { roomNumber: { $regex: escaped, $options: "i" } },
    ];
  }

  return filter;
};

// Consolidated into contractPricingResolver.js's resolveRoomDiscountPricing so
// room listings, reservation-summary previews, and structured pricing
// snapshots at approval time all derive rates from one implementation instead
// of independently reinventing the discount formula.
const getRoomDiscountDetails = (roomType, settings, room) =>
  resolveRoomDiscountPricing(roomType, settings, room);

const attachBranchSettings = (rooms, settings) =>
  rooms.map((room) => {
    const normalizedRoom = normalizeRoom(room);
    const branchSettings = getBranchSettings(normalizedRoom.branch, settings);
    const discountDetails = getRoomDiscountDetails(
      normalizedRoom.type,
      settings,
      normalizedRoom,
    );
    return {
      ...normalizedRoom,
      ...discountDetails,
      applianceFeeEnabled: !!branchSettings?.isApplianceFeeEnabled,
      applianceFeeAmountPerUnit: branchSettings?.applianceFeeAmountPerUnit ?? 0,
    };
  });

const assertBranchCode = (branch) => {
  if (!ROOM_BRANCHES.includes(branch)) {
    throw new AppError(
      `Invalid branch. Must be one of: ${ROOM_BRANCHES.join(", ")}`,
      400,
      "INVALID_BRANCH",
    );
  }
};

const buildManagedRoomQuery = (roomId, req) => {
  const query = { _id: roomId, isArchived: false };
  if (req.branchFilter) query.branch = req.branchFilter;
  return query;
};

const findManagedRoom = async (roomId, req) => {
  assertRoomId(roomId);

  const room = await Room.findOne(buildManagedRoomQuery(roomId, req));
  if (!room) {
    throw new AppError("Room not found or access denied", 404, "ROOM_NOT_FOUND");
  }

  return room;
};

const getBedIndex = (room, bedId) =>
  Array.isArray(room?.beds)
    ? room.beds.findIndex((bed) => String(bed.id) === String(bedId))
    : -1;

const getBedOrThrow = (room, bedId) => {
  const index = getBedIndex(room, bedId);
  if (index === -1) {
    throw new AppError("Bed not found", 404, "BED_NOT_FOUND");
  }
  return { index, bed: room.beds[index] };
};

const assertAdminMutableBed = (bed, action) => {
  const currentStatus = String(bed?.status || "available");
  if (!SYSTEM_OWNED_BED_STATUSES.has(currentStatus)) {
    return;
  }

  throw new AppError(
    `Cannot ${action} a bed while it is ${currentStatus}.`,
    409,
    "BED_MUTATION_BLOCKED",
    { status: currentStatus },
  );
};

const normalizeBedPosition = (value) => {
  const normalized = String(value || "lower").trim().toLowerCase();
  if (!BED_POSITIONS.has(normalized)) {
    throw new AppError(
      `Invalid bed position. Use one of: ${[...BED_POSITIONS].join(", ")}.`,
      400,
      "INVALID_BED_POSITION",
    );
  }

  return normalized;
};

const buildNextBedId = (room) => {
  const nextNumber =
    (room.beds || []).reduce((max, bed) => {
      const match = String(bed.id || "").match(/^bed-(\d+)$/i);
      if (!match) return max;
      return Math.max(max, Number.parseInt(match[1], 10) || 0);
    }, 0) + 1;

  return `bed-${nextNumber}`;
};

const normalizeBedId = (room, value, { currentId = null } = {}) => {
  const candidate = String(value || "").trim() || buildNextBedId(room);
  const duplicate = (room.beds || []).some(
    (bed) => bed.id === candidate && bed.id !== currentId,
  );

  if (duplicate) {
    throw new AppError(
      `Bed ID ${candidate} already exists in this room.`,
      409,
      "BED_ID_ALREADY_EXISTS",
    );
  }

  return candidate;
};

const syncRoomCapacityFromBeds = (room) => {
  const totalBeds = Array.isArray(room.beds) ? room.beds.length : 0;
  if (room.type !== "private") {
    room.capacity = Math.max(1, totalBeds);
  }
  room.available = room.currentOccupancy < room.capacity && !room.isArchived;
};

export const getMaxBedsForRoomType = (type) => {
  const normType = String(type || "").toLowerCase().trim();
  if (normType === "quadruple-sharing" || normType.includes("quad")) {
    return 4;
  }
  if (normType === "double-sharing" || normType.includes("double") || normType.includes("shared")) {
    return 2;
  }
  if (normType === "private" || normType.includes("single")) {
    // Private rooms have a bunk bed (upper + lower) reserved for 1 tenant = 2 physical bed objects
    return 2;
  }
  return 4;
};


const formatRoomTypeLabel = (type) => {
  const normType = String(type || "").toLowerCase().trim();
  if (normType === "quadruple-sharing" || normType.includes("quad")) return "Quadruple Sharing";
  if (normType === "double-sharing" || normType.includes("double") || normType.includes("shared")) return "Double Sharing";
  if (normType === "private" || normType.includes("single")) return "Private";
  return type || "Room";
};

const reorderRoomBeds = (room, bedIds) => {
  const requestedOrder = Array.isArray(bedIds)
    ? bedIds.map((entry) => String(entry).trim()).filter(Boolean)
    : [];

  if (requestedOrder.length !== (room.beds || []).length) {
    throw new AppError(
      "Bed reorder payload must include every bed exactly once.",
      400,
      "INVALID_BED_REORDER",
    );
  }

  const currentById = new Map((room.beds || []).map((bed) => [String(bed.id), bed]));
  const reordered = requestedOrder.map((bedId) => {
    const bed = currentById.get(bedId);
    if (!bed) {
      throw new AppError(
        `Bed ${bedId} does not belong to this room.`,
        400,
        "INVALID_BED_REORDER",
      );
    }
    return bed;
  });

  room.beds = reordered;
};

const ensureUniqueRoomNumber = async ({ roomId = null, branch, roomNumber }) => {
  const duplicate = await Room.findOne({
    _id: roomId ? { $ne: roomId } : { $exists: true },
    branch,
    roomNumber,
    isArchived: false,
  })
    .select("_id name roomNumber branch")
    .lean();

  if (duplicate) {
    throw new AppError(
      `Room number ${roomNumber} already exists in ${branch}.`,
      409,
      "ROOM_NUMBER_ALREADY_EXISTS",
    );
  }
};

const buildOccupancyConsistencyReport = (room, reservations) => {
  const derived = deriveRoomOccupancyState(room, reservations);
  const storedOccupiedBeds = (room.beds || []).filter(
    (bed) => bed.status === "occupied",
  ).length;
  const storedReservedBeds = (room.beds || []).filter(
    (bed) => bed.status === "reserved",
  ).length;
  const activeReservationCount = reservations.length;
  const movedInReservationCount = reservations.filter(
    (reservation) => reservation.status === "moveIn",
  ).length;
  const reservedReservationCount = reservations.filter(
    (reservation) => reservation.status === "reserved",
  ).length;

  const issues = [];

  if ((room.currentOccupancy || 0) !== derived.currentOccupancy) {
    issues.push({
      code: "CURRENT_OCCUPANCY_MISMATCH",
      message:
        "Room currentOccupancy does not match reservation-derived occupancy.",
      stored: room.currentOccupancy || 0,
      derived: derived.currentOccupancy,
    });
  }

  if (Boolean(room.available) !== Boolean(derived.available)) {
    issues.push({
      code: "ROOM_AVAILABILITY_MISMATCH",
      message: "Room availability does not match reservation-derived readiness.",
      stored: Boolean(room.available),
      derived: Boolean(derived.available),
    });
  }

  if (storedOccupiedBeds !== movedInReservationCount) {
    issues.push({
      code: "OCCUPIED_BED_MISMATCH",
      message: "Occupied beds do not match moved-in reservations.",
      stored: storedOccupiedBeds,
      derived: movedInReservationCount,
    });
  }

  if (storedReservedBeds !== reservedReservationCount) {
    issues.push({
      code: "RESERVED_BED_MISMATCH",
      message: "Reserved beds do not match reserved reservations.",
      stored: storedReservedBeds,
      derived: reservedReservationCount,
    });
  }

  if (activeReservationCount !== derived.currentOccupancy) {
    issues.push({
      code: "ACTIVE_RESERVATION_COUNT_MISMATCH",
      message: "Active reservation count does not match derived occupancy.",
      stored: activeReservationCount,
      derived: derived.currentOccupancy,
    });
  }

  return {
    roomId: room._id,
    roomName: room.name,
    roomNumber: room.roomNumber,
    branch: room.branch,
    capacity: room.capacity,
    issueCount: issues.length,
    issues,
    storedState: {
      currentOccupancy: room.currentOccupancy || 0,
      available: Boolean(room.available),
      occupiedBeds: storedOccupiedBeds,
      reservedBeds: storedReservedBeds,
    },
    derivedState: {
      currentOccupancy: derived.currentOccupancy,
      available: Boolean(derived.available),
      occupiedBeds: movedInReservationCount,
      reservedBeds: reservedReservationCount,
    },
  };
};

export const getRooms = async (req, res, next) => {
  try {
    const filter = buildRoomQueryFilter(req.query);
    const page = parsePositiveInt(req.query.page);
    const pageSize = Math.min(parsePositiveInt(req.query.pageSize) || 20, 100);
    const hasPagination = page !== null;
    const settings = await getBusinessSettings();

    if (!hasPagination) {
      const rooms = await Room.find(filter)
        .select("-__v")
        .sort({ branch: 1, floor: 1, roomNumber: 1 })
        .lean();
      const syncedRooms = await syncRealtimeBedStatuses(rooms);
      const sanitizedRooms = sanitizeRoomsForViewer(syncedRooms, req);
      sendSuccess(res, attachBranchSettings(sanitizedRooms, settings));
      return;
    }

    const total = await Room.countDocuments(filter);
    const rooms = await Room.find(filter)
      .select("-__v")
      .sort({ branch: 1, floor: 1, roomNumber: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    const syncedRooms = await syncRealtimeBedStatuses(rooms);
    const sanitizedRooms = sanitizeRoomsForViewer(syncedRooms, req);
    sendSuccess(res, {
      items: attachBranchSettings(sanitizedRooms, settings),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getRoomById = async (req, res, next) => {
  try {
    const { roomId } = req.params;

    assertRoomId(roomId);

    const room = await Room.findOne({ _id: roomId, isArchived: false })
      .select("-__v")
      .lean();
    if (!room) {
      throw new AppError("Room not found", 404, "ROOM_NOT_FOUND");
    }

    const settings = await getBusinessSettings();
    const [syncedRoom] = await syncRealtimeBedStatuses([room]);
    const [sanitizedRoom] = sanitizeRoomsForViewer([syncedRoom], req);
    const [normalizedRoom] = attachBranchSettings([sanitizedRoom], settings);
    sendSuccess(res, normalizedRoom);
  } catch (error) {
    next(error);
  }
};

export const getOccupancyConsistency = async (req, res, next) => {
  try {
    const includeAll = req.query.includeAll === "true";
    const requestedBranchRaw = String(req.query.branch || "").trim();
    const requestedBranch =
      requestedBranchRaw && requestedBranchRaw !== "all"
        ? normalizeBranch(requestedBranchRaw)
        : null;

    if (requestedBranch) {
      assertBranchCode(requestedBranch);
    }

    const filter = { isArchived: false };
    if (req.branchFilter) {
      filter.branch = req.branchFilter;
    } else if (requestedBranch) {
      filter.branch = requestedBranch;
    }

    const rooms = await Room.find(filter)
      .select("_id name roomNumber branch capacity currentOccupancy available beds")
      .sort({ branch: 1, floor: 1, roomNumber: 1 })
      .lean();

    const roomIds = rooms.map((room) => room._id);
    const reservations = roomIds.length > 0
      ? await Reservation.find({
          roomId: { $in: roomIds },
          isArchived: false,
          status: { $in: ACTIVE_OCCUPANCY_STATUS_QUERY },
        })
          .select("_id roomId userId selectedBed status")
          .lean()
      : [];

    const reservationsByRoom = new Map();
    for (const reservation of reservations) {
      const roomKey = String(reservation.roomId);
      if (!reservationsByRoom.has(roomKey)) {
        reservationsByRoom.set(roomKey, []);
      }
      reservationsByRoom.get(roomKey).push(reservation);
    }

    const report = rooms.map((room) =>
      buildOccupancyConsistencyReport(
        room,
        reservationsByRoom.get(String(room._id)) || [],
      ),
    );
    const inconsistentRooms = report.filter((entry) => entry.issueCount > 0);

    sendSuccess(res, {
      summary: {
        totalRooms: report.length,
        inconsistentRooms: inconsistentRooms.length,
        consistentRooms: report.length - inconsistentRooms.length,
      },
      rooms: includeAll ? report : inconsistentRooms,
    });
  } catch (error) {
    next(error);
  }
};

export const createRoom = async (req, res, next) => {
  try {
    const roomData = sanitizeRoomPayload(req.body, { allowBeds: true });
    const { name, roomNumber, branch, type, capacity, price } = roomData;

    if (!name || !roomNumber || !branch || !type || !capacity || price === undefined) {
      throw new AppError(
        "Missing required fields: name, roomNumber, branch, type, capacity, and price are required",
        400,
        "MISSING_REQUIRED_FIELDS",
      );
    }

    assertBranchCode(branch);

    if (req.branchFilter && branch !== req.branchFilter) {
      throw new AppError(
        `Access denied. You can only create rooms for ${req.branchFilter} branch.`,
        403,
        "BRANCH_ACCESS_DENIED",
      );
    }

    await ensureUniqueRoomNumber({ branch, roomNumber });

    const maxBeds = getMaxBedsForRoomType(type);
    if (roomData.beds?.length > maxBeds) {
      throw new AppError(
        `Cannot create room with ${roomData.beds.length} beds. Maximum allowed beds for ${formatRoomTypeLabel(type)} room is ${maxBeds}.`,
        400,
        "BED_LIMIT_REACHED",
      );
    }

    const room = new Room({
      ...roomData,
      beds: roomData.beds?.length
        ? roomData.beds
        : generateDefaultBeds(type, capacity),
    });
    await room.save();

    await auditLogger.logModification(
      req,
      "room",
      room._id,
      null,
      room.toObject(),
      `Created room: ${room.name}`,
    );

    sendSuccess(
      res,
      { message: "Room created successfully", roomId: room._id, room },
      201,
    );
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to create room");
    next(error);
  }
};

export const updateRoom = async (req, res, next) => {
  try {
    const { roomId } = req.params;

    const existingRoom = await findManagedRoom(roomId, req);

    const roomData = sanitizeRoomPayload(req.body, { allowBeds: false });
    const oldRoomData = existingRoom.toObject();

    if (roomData.branch && roomData.branch !== existingRoom.branch && req.branchFilter) {
      throw new AppError(
        "Cannot change room branch. Contact an owner.",
        403,
        "BRANCH_CHANGE_DENIED",
      );
    }

    const nextBranch = roomData.branch || existingRoom.branch;
    const nextRoomNumber = roomData.roomNumber || existingRoom.roomNumber;
    assertBranchCode(nextBranch);
    await ensureUniqueRoomNumber({
      roomId: existingRoom._id,
      branch: nextBranch,
      roomNumber: nextRoomNumber,
    });

    if (
      roomData.capacity !== undefined &&
      roomData.capacity < (existingRoom.currentOccupancy || 0)
    ) {
      throw new AppError(
        `Cannot reduce capacity to ${roomData.capacity} because current occupancy is ${existingRoom.currentOccupancy || 0}.`,
        409,
        "ROOM_CAPACITY_TOO_LOW",
        {
          currentOccupancy: existingRoom.currentOccupancy || 0,
          requestedCapacity: roomData.capacity,
        },
      );
    }

    Object.assign(existingRoom, roomData);
    await existingRoom.save();

    await auditLogger.logModification(
      req,
      "room",
      roomId,
      oldRoomData,
      existingRoom.toObject(),
    );

    sendSuccess(res, { message: "Room updated successfully", room: existingRoom });
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to update room");
    next(error);
  }
};

export const deleteRoom = async (req, res, next) => {
  try {
    const { roomId } = req.params;

    const room = await findManagedRoom(roomId, req);

    const [
      activeReservationCount,
      activeStayCount,
      openBillingPeriodCount,
      openUtilityPeriodCount,
      openMaintenanceCount,
    ] = await Promise.all([
      Reservation.countDocuments({
        roomId,
        isArchived: false,
        status: {
          $nin: reservationStatusesForQuery("moveOut", "cancelled", "archived"),
        },
      }),
      Stay.countDocuments({
        roomId,
        status: { $in: ["active", "ending_soon"] },
      }),
      BillingPeriod.countDocuments({
        roomId,
        isArchived: false,
        status: "open",
      }),
      UtilityPeriod.countDocuments({
        roomId,
        isArchived: false,
        status: { $in: ["open", "manual_review_required"] },
      }),
      MaintenanceRequest.countDocuments({
        roomId,
        isArchived: false,
        status: { $in: OPEN_MAINTENANCE_STATUSES },
      }),
    ]);

    if (
      activeReservationCount > 0 ||
      activeStayCount > 0 ||
      openBillingPeriodCount > 0 ||
      openUtilityPeriodCount > 0 ||
      openMaintenanceCount > 0
    ) {
      throw new AppError(
        "Room cannot be archived while it has active reservations, active stays, open billing periods, open utility periods, or unresolved maintenance work.",
        409,
        "ROOM_ARCHIVE_BLOCKED",
        {
          activeReservationCount,
          activeStayCount,
          openBillingPeriodCount,
          openUtilityPeriodCount,
          openMaintenanceCount,
        },
      );
    }

    const before = room.toObject();
    await room.archive(req.user?._id || null);

    await auditLogger.logModification(
      req,
      "room",
      roomId,
      before,
      room.toObject(),
      `Archived room: ${room.name}`,
    );

    sendSuccess(res, {
      message: "Room archived successfully",
      archivedRoom: { id: room._id, name: room.name, branch: room.branch },
    });
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to archive room");
    next(error);
  }
};

export const updateBedStatus = async (req, res, next) => {
  try {
    const { roomId, bedId } = req.params;
    const requestedStatus = String(req.body?.status || "").trim();

    if (!ADMIN_EDITABLE_BED_STATUSES.has(requestedStatus)) {
      throw new AppError(
        "Invalid bed status. Use 'maintenance' or 'available'.",
        400,
        "INVALID_BED_STATUS",
      );
    }

    const room = await findManagedRoom(roomId, req);
    const { bed } = getBedOrThrow(room, bedId);

    let success;
    if (requestedStatus === "maintenance") {
      assertAdminMutableBed(bed, "place into maintenance");
      success = room.lockBedForMaintenance(bedId);
      if (success) {
        await BedHistory.recordMaintenanceStart({
          bedId,
          roomId: room._id,
          branch: room.branch,
          reason: "Manual Maintenance Lock",
          notes: `Bed ${bedId} placed under maintenance by staff`,
        });
      }
    } else {
      success = room.unlockBed(bedId);
      if (success) {
        await BedHistory.recordMaintenanceEnd(bedId, room._id);
      }
    }

    if (!success) {
      throw new AppError(
        "Bed not found or already in requested state",
        404,
        "BED_NOT_FOUND",
      );
    }

    await room.save();
    await auditLogger.logModification(
      req,
      "room",
      roomId,
      null,
      null,
      `Bed ${bedId} -> ${requestedStatus}`,
    );

    emitRoomUpdate(room._id, {
      currentOccupancy: room.currentOccupancy,
      available: room.available,
      capacity: room.capacity,
    });

    sendSuccess(res, { message: `Bed ${bedId} set to ${requestedStatus}`, room });
  } catch (error) {
    next(error);
  }
};

export const addBed = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const room = await findManagedRoom(roomId, req);
    const before = room.toObject();

    const maxBeds = getMaxBedsForRoomType(room.type);
    const currentBedsCount = (room.beds || []).length;
    if (currentBedsCount >= maxBeds) {
      throw new AppError(
        `Cannot add more beds. Maximum limit of ${maxBeds} beds reached for ${formatRoomTypeLabel(room.type)} room.`,
        400,
        "BED_LIMIT_REACHED",
      );
    }

    const bed = {
      id: normalizeBedId(room, req.body?.id),
      position: normalizeBedPosition(req.body?.position),
      status: "available",
    };

    room.beds = [...(room.beds || []), bed];
    syncRoomCapacityFromBeds(room);
    await room.save();

    await auditLogger.logModification(
      req,
      "room",
      roomId,
      before,
      room.toObject(),
      `Added bed ${bed.id}`,
    );

    emitRoomUpdate(room._id, {
      currentOccupancy: room.currentOccupancy,
      available: room.available,
      capacity: room.capacity,
    });

    sendSuccess(res, { message: "Bed added successfully", room, bed }, 201);
  } catch (error) {
    next(error);
  }
};

export const updateBed = async (req, res, next) => {
  try {
    const { roomId, bedId } = req.params;
    const room = await findManagedRoom(roomId, req);
    const before = room.toObject();
    const { index, bed } = getBedOrThrow(room, bedId);

    assertAdminMutableBed(bed, "edit");

    const nextId =
      req.body?.id !== undefined
        ? normalizeBedId(room, req.body.id, { currentId: bed.id })
        : bed.id;
    const nextPosition =
      req.body?.position !== undefined
        ? normalizeBedPosition(req.body.position)
        : bed.position;

    room.beds[index].id = nextId;
    room.beds[index].position = nextPosition;

    if (req.body?.sortIndex !== undefined) {
      const nextIndex = Number.parseInt(req.body.sortIndex, 10);
      if (!Number.isFinite(nextIndex) || nextIndex < 0 || nextIndex >= room.beds.length) {
        throw new AppError("Invalid sortIndex for bed reorder.", 400, "INVALID_BED_REORDER");
      }

      const [movedBed] = room.beds.splice(index, 1);
      room.beds.splice(nextIndex, 0, movedBed);
    }

    await room.save();

    await auditLogger.logModification(
      req,
      "room",
      roomId,
      before,
      room.toObject(),
      `Updated bed ${bedId}`,
    );

    emitRoomUpdate(room._id, {
      currentOccupancy: room.currentOccupancy,
      available: room.available,
      capacity: room.capacity,
    });

    sendSuccess(res, { message: "Bed updated successfully", room });
  } catch (error) {
    next(error);
  }
};

export const reorderBeds = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const room = await findManagedRoom(roomId, req);
    const before = room.toObject();

    reorderRoomBeds(room, req.body?.bedIds);
    await room.save();

    await auditLogger.logModification(
      req,
      "room",
      roomId,
      before,
      room.toObject(),
      "Reordered beds",
    );

    emitRoomUpdate(room._id, {
      currentOccupancy: room.currentOccupancy,
      available: room.available,
      capacity: room.capacity,
    });

    sendSuccess(res, { message: "Beds reordered successfully", room });
  } catch (error) {
    next(error);
  }
};

export const deleteBed = async (req, res, next) => {
  try {
    const { roomId, bedId } = req.params;
    const room = await findManagedRoom(roomId, req);
    const before = room.toObject();
    const { index, bed } = getBedOrThrow(room, bedId);

    assertAdminMutableBed(bed, "remove");

    const remainingBeds = Math.max(0, room.beds.length - 1);
    const nextCapacity = room.type === "private" ? room.capacity : Math.max(1, remainingBeds);

    if (remainingBeds === 0) {
      throw new AppError(
        "A room must keep at least one bed configured.",
        409,
        "BED_DELETE_BLOCKED",
      );
    }

    if ((room.currentOccupancy || 0) > nextCapacity) {
      throw new AppError(
        "Cannot remove this bed because current occupancy exceeds the remaining capacity.",
        409,
        "BED_DELETE_BLOCKED",
        {
          currentOccupancy: room.currentOccupancy || 0,
          nextCapacity,
        },
      );
    }

    room.beds.splice(index, 1);
    syncRoomCapacityFromBeds(room);
    await room.save();

    await auditLogger.logModification(
      req,
      "room",
      roomId,
      before,
      room.toObject(),
      `Removed bed ${bedId}`,
    );

    emitRoomUpdate(room._id, {
      currentOccupancy: room.currentOccupancy,
      available: room.available,
      capacity: room.capacity,
    });

    sendSuccess(res, { message: "Bed removed successfully", room });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/rooms/:roomId/repair-occupancy
 *
 * Admin-only: Force-recalculates a room's `currentOccupancy` counter and bed
 * statuses from the ground truth of active reservations. Fixes drift caused
 * by reservations that were deleted or cancelled without going through the
 * normal lifecycle state machine.
 *
 * Returns the corrected room along with a `corrected` diff { from, to }.
 */
export const repairRoomOccupancy = async (req, res, next) => {
  try {
    const { roomId } = req.params;

    const roomBefore = await Room.findById(roomId).lean();
    if (!roomBefore) {
      throw new AppError("Room not found", 404, "ROOM_NOT_FOUND");
    }

    const occupancyBefore = roomBefore.currentOccupancy;
    const availableBefore = roomBefore.available;

    const repairedRoom = await recalculateRoomOccupancy(roomId);

    await auditLogger.logModification(
      req,
      "room",
      roomId,
      { currentOccupancy: occupancyBefore, available: availableBefore },
      { currentOccupancy: repairedRoom.currentOccupancy, available: repairedRoom.available },
      `Admin repaired occupancy counter: ${occupancyBefore} → ${repairedRoom.currentOccupancy}`,
    );

    if (repairedRoom) {
      emitRoomUpdate(repairedRoom._id, {
        currentOccupancy: repairedRoom.currentOccupancy,
        available: repairedRoom.available,
        capacity: repairedRoom.capacity,
      });
    }

    sendSuccess(res, {
      message: `Room occupancy repaired successfully.`,
      room: repairedRoom,
      corrected: {
        from: { currentOccupancy: occupancyBefore, available: availableBefore },
        to: {
          currentOccupancy: repairedRoom.currentOccupancy,
          available: repairedRoom.available,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// OCCUPANCY HEALTH CHECK — GET /api/rooms/occupancy-health
// ============================================================================
// Read-only scan: returns orphaned reservations and rooms with counter drift.
// No writes performed. Access: Admin (manageRooms or viewReports).

export const getOccupancyHealth = async (req, res, next) => {
  try {
    const existingUsers = await User.find({}).select("_id").lean();
    const existingUserIdSet = new Set(existingUsers.map((u) => String(u._id)));

    const activeReservations = await Reservation.find({
      isArchived: { $ne: true },
      status: { $in: ACTIVE_OCCUPANCY_STATUS_QUERY },
    })
      .select("_id reservationCode userId roomId status")
      .populate("roomId", "roomNumber branch name")
      .lean();

    const orphaned = activeReservations.filter(
      (r) => r.userId && !existingUserIdSet.has(String(r.userId)),
    );

    const branchFilter = req.branchFilter || {};
    const rooms = await Room.find({ isArchived: { $ne: true }, ...branchFilter })
      .select("_id roomNumber branch name currentOccupancy capacity")
      .lean();

    const driftRooms = [];
    for (const room of rooms) {
      const liveCount = await Reservation.countDocuments({
        roomId: room._id,
        isArchived: { $ne: true },
        status: { $in: ACTIVE_OCCUPANCY_STATUS_QUERY },
      });
      if (liveCount !== room.currentOccupancy) {
        driftRooms.push({
          roomId: room._id,
          roomNumber: room.roomNumber,
          branch: room.branch,
          name: room.name,
          storedOccupancy: room.currentOccupancy,
          liveOccupancy: liveCount,
          capacity: room.capacity,
          drift: room.currentOccupancy - liveCount,
        });
      }
    }

    sendSuccess(res, {
      healthy: orphaned.length === 0 && driftRooms.length === 0,
      summary: {
        activeReservationsScanned: activeReservations.length,
        orphanedReservations: orphaned.length,
        roomsWithDrift: driftRooms.length,
        roomsScanned: rooms.length,
      },
      orphanedReservations: orphaned.map((r) => ({
        reservationId: r._id,
        reservationCode: r.reservationCode,
        status: r.status,
        room: r.roomId ? `${r.roomId.roomNumber} (${r.roomId.branch})` : "unknown",
      })),
      driftRooms,
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// ON-DEMAND RECONCILIATION — POST /api/rooms/reconcile-occupancy
// ============================================================================
// Owner-only: archives orphaned reservations, releases beds, recomputes all
// room counters. Equivalent to running the nightly Job 15 on demand.

export const reconcileAllOccupancy = async (req, res, next) => {
  try {
    const { releaseOrphanedBeds: releaseBeds } = await import(
      "../services/occupancy/occupancyManager.js"
    );

    const existingUsers = await User.find({}).select("_id").lean();
    const existingUserIdSet = new Set(existingUsers.map((u) => String(u._id)));

    const activeReservations = await Reservation.find({
      isArchived: { $ne: true },
      status: { $in: ACTIVE_OCCUPANCY_STATUS_QUERY },
    })
      .select("_id reservationCode userId roomId status selectedBed")
      .lean();

    const orphaned = activeReservations.filter(
      (r) => r.userId && !existingUserIdSet.has(String(r.userId)),
    );

    let orphanedArchived = 0;
    let bedsReleased = 0;

    if (orphaned.length > 0) {
      await Reservation.updateMany(
        { _id: { $in: orphaned.map((r) => r._id) } },
        { $set: { isArchived: true, status: "archived" } },
      );
      orphanedArchived = orphaned.length;

      const orphansByRoom = new Map();
      for (const res of orphaned) {
        const key = String(res.roomId);
        if (!orphansByRoom.has(key)) orphansByRoom.set(key, []);
        orphansByRoom.get(key).push(res._id);
      }
      for (const resIds of orphansByRoom.values()) {
        await releaseBeds([], resIds).catch(() => {});
      }
    }

    // Phase 5B: Archive non-active reservations for deleted users (cancelled, moveOut, etc.)
    const allNonActiveNonArchived = await Reservation.find({
      isArchived: { $ne: true },
      status: { $nin: ACTIVE_OCCUPANCY_STATUS_QUERY },
    }).select("_id userId").lean();

    const nonActiveOrphans = allNonActiveNonArchived.filter(
      (r) => r.userId && !existingUserIdSet.has(String(r.userId)),
    );
    if (nonActiveOrphans.length > 0) {
      await Reservation.updateMany(
        { _id: { $in: nonActiveOrphans.map((r) => r._id) } },
        { $set: { isArchived: true } },
      );
    }
    orphanedArchived += nonActiveOrphans.length;

    const branchFilter = req.branchFilter || {};
    const rooms = await Room.find({ isArchived: { $ne: true }, ...branchFilter });
    const fixedRooms = [];

    for (const room of rooms) {
      const liveCount = await Reservation.countDocuments({
        roomId: room._id,
        isArchived: { $ne: true },
        status: { $in: ACTIVE_OCCUPANCY_STATUS_QUERY },
      });

      const liveResIdDocs = await Reservation.find({
        roomId: room._id,
        isArchived: { $ne: true },
        status: { $in: ACTIVE_OCCUPANCY_STATUS_QUERY },
      }).select("_id selectedBed").lean();
      const liveResIdSet = new Set(liveResIdDocs.map((r) => String(r._id)));

      // Phase 1: build reservationId → claimedBedId map for cross-validation
      const resBedMap = new Map();
      for (const res of liveResIdDocs) {
        if (res.selectedBed?.id) resBedMap.set(String(res._id), res.selectedBed.id);
      }

      let bedChanged = false;
      for (const bed of room.beds) {
        if (bed.status === "maintenance" || bed.status === "locked") continue;
        if (
          (bed.status === "occupied" || bed.status === "reserved") &&
          bed.occupiedBy?.reservationId
        ) {
          const resIdStr = String(bed.occupiedBy.reservationId);

          // Pass A: dead reference
          if (!liveResIdSet.has(resIdStr)) {
            bed.status = "available";
            bed.lockedBy = null;
            bed.lockExpiresAt = null;
            bed.occupiedBy = { userId: null, reservationId: null, occupiedSince: null };
            bedChanged = true;
            bedsReleased++;
            continue;
          }

          // Pass B (Phase 1): cross-validation — active reservation claims a different bed
          const claimedBedId = resBedMap.get(resIdStr);
          if (claimedBedId && claimedBedId !== bed.id) {
            bed.status = "available";
            bed.lockedBy = null;
            bed.lockExpiresAt = null;
            bed.occupiedBy = { userId: null, reservationId: null, occupiedSince: null };
            bedChanged = true;
            bedsReleased++;
          }
        }
      }

      const occupancyBefore = room.currentOccupancy;
      if (occupancyBefore !== liveCount || bedChanged) {
        room.currentOccupancy = liveCount;
        room.updateAvailability();
        await room.save();
        fixedRooms.push({
          roomId: room._id,
          roomNumber: room.roomNumber,
          branch: room.branch,
          occupancyBefore,
          occupancyAfter: liveCount,
          bedsCorrected: bedChanged,
        });
        emitRoomUpdate(room._id, {
          currentOccupancy: room.currentOccupancy,
          available: room.available,
          capacity: room.capacity,
        });
      }
    }

    await auditLogger.logModification(
      req,
      "system",
      "occupancy-reconciliation",
      null,
      { orphanedArchived, roomsFixed: fixedRooms.length },
      "Admin triggered on-demand occupancy reconciliation",
    );

    sendSuccess(res, {
      message: "Occupancy reconciliation complete.",
      report: {
        orphanedReservationsArchived: orphanedArchived,
        bedsReleased,
        roomsScanned: rooms.length,
        roomsFixed: fixedRooms.length,
        fixedRooms,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/rooms/:roomId/beds/:bedId/release
 *
 * Admin emergency action — forcefully releases a payment-window locked bed
 * back to Vacant. Used when a bed is stuck in "Payment Pending" state and
 * the admin needs to manually free it (e.g. applicant abandoned payment,
 * system timer didn't fire, or a data anomaly occurred).
 *
 * Also auto-cancels any linked payment_pending reservation for this bed.
 *
 * Access: Admin / Owner only (manageRooms permission)
 */
export const releaseBed = async (req, res, next) => {
  try {
    const { roomId, bedId } = req.params;
    const admin = await User.findOne({ firebaseUid: req.user.uid }).select(
      "firstName lastName role branch _id",
    );
    if (!admin) throw new AppError("Administrator not found.", 404);

    const room = await Room.findById(roomId);
    if (!room || room.isArchived) {
      throw new AppError("Room not found.", 404);
    }

    const bed = room.beds.find((b) => b.id === bedId);
    if (!bed) throw new AppError("Bed not found in this room.", 404);

    if (bed.status !== "locked") {
      return res.status(409).json({
        success: false,
        code: "BED_NOT_LOCKED",
        message: "This bed is not currently in a Payment Pending state.",
      });
    }

    const previousBedState = { ...bed.toObject() };

    // Release the bed back to available
    bed.status = "available";
    bed.lockedBy = null;
    bed.lockExpiresAt = null;
    bed.occupiedBy = { userId: null, reservationId: null, occupiedSince: null };

    await room.save();

    // Auto-cancel any linked payment_pending reservation for this bed
    let cancelledReservation = null;
    const linkedReservation = await Reservation.findOne({
      roomId: room._id,
      "selectedBed.id": bedId,
      status: "payment_pending",
      isArchived: { $ne: true },
    });

    if (linkedReservation) {
      linkedReservation.status = "cancelled";
      linkedReservation.cancelledAt = new Date();
      linkedReservation.cancellationSource = "admin_manual_release";
      linkedReservation.cancellationReason =
        "Bed manually released by administrator. Payment window voided.";
      await linkedReservation.save();
      cancelledReservation = linkedReservation._id;
    }

    emitRoomUpdate(room._id, {
      currentOccupancy: room.currentOccupancy,
      available: room.available,
      capacity: room.capacity,
    });

    await auditLogger.logModification(
      req,
      "room",
      room._id,
      { bed: previousBedState },
      { bed: bed.toObject(), cancelledReservationId: cancelledReservation },
      `Admin manually released payment-pending bed ${bedId} back to available`,
    );

    return sendSuccess(res, {
      message: "Bed released successfully. It is now available.",
      bedId,
      cancelledReservationId: cancelledReservation,
    });
  } catch (error) {
    next(error);
  }
};

