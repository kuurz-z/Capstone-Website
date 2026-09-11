import { BedHistory, Reservation } from "../../models/index.js";
import {
  BILLABLE_RESERVATION_STATUS_QUERY,
  buildMoveInBeforeQuery,
  buildMoveOutAfterOrMissingQuery,
} from "../../utils/lifecycleNaming.js";

/**
 * Canonical room-scoped participant resolver shared by normal utility close
 * and Admin Room Transfer. BedHistory supplies the entry/exit boundaries for
 * this room, including tenants who have since transferred elsewhere.
 */
export async function resolveRoomScopedReservationsForUtilityPeriod({
  room,
  periodStart,
  periodEnd,
  utilityType = null,
  calculationVersion = null,
  session = null,
}) {
  let currentQuery = Reservation.find({
    roomId: room._id,
    status: { $in: BILLABLE_RESERVATION_STATUS_QUERY },
    isArchived: { $ne: true },
    $and: [
      buildMoveInBeforeQuery(periodEnd),
      buildMoveOutAfterOrMissingQuery(periodStart),
    ],
  }).populate("userId", "firstName lastName email");
  let historyQuery = BedHistory.find({ roomId: room._id });
  if (session) {
    currentQuery = currentQuery.session(session);
    historyQuery = historyQuery.session(session);
  }

  const [stillInRoom, roomBedHistory] = await Promise.all([
    currentQuery.lean(),
    historyQuery.lean(),
  ]);

  if (utilityType === 'water' && calculationVersion === 'water-meter-v1') {
    const ids = [...new Set(roomBedHistory.map(h => String(h.reservationId || '')).filter(Boolean))];
    let query = Reservation.find({_id:{$in:ids}}).populate('userId','firstName lastName email');
    if (session) query = query.session(session);
    const historic = await query.lean();
    const all = new Map([...stillInRoom,...historic].map(r => [String(r._id),r]));
    return [...all.values()].map(r => {
      const histories = roomBedHistory.filter(h => String(h.reservationId) === String(r._id));
      return {...r, _roomOccupancyIntervals:histories.length ? histories.map(h => ({
        start:h.observedStartAt || h.moveInDate || h.effectiveStartDate,
        end:h.observedEndAt || h.moveOutDate || h.effectiveEndDate || null,
        bedId:h.bedId, stayId:h.stayId,
      })) : [{start:r.confirmedMoveInDate || r.moveInDate,end:r.moveOutDate || null}]};
    });
  }

  // A same-calendar-day Room A -> B -> C transfer intentionally retains the
  // middle room's audit row, but that transferred occupancy interval has no
  // covered water days. Keep the historical record and exclude only that
  // invalid interval from WATER participant resolution. Other utility types
  // and ordinary transferred intervals continue through the existing path.
  const participantHistory = roomBedHistory.filter((history) => {
    if (
      utilityType !== "water" ||
      history.status !== "transferred" ||
      !history.effectiveStartDate ||
      !history.effectiveEndDate
    ) {
      return true;
    }

    const effectiveStart = new Date(history.effectiveStartDate);
    const effectiveEnd = new Date(history.effectiveEndDate);
    if (
      Number.isNaN(effectiveStart.getTime()) ||
      Number.isNaN(effectiveEnd.getTime())
    ) {
      return true;
    }
    return effectiveEnd > effectiveStart;
  });

  const historyByReservation = new Map();
  for (const history of participantHistory) {
    const key = String(history.reservationId || "");
    if (!key) continue;
    const rows = historyByReservation.get(key) || [];
    rows.push(history);
    historyByReservation.set(key, rows);
  }

  const pickHistory = (rows) => {
    if (!rows?.length) return null;
    const overlapping = rows.find((history) => {
      const start = history.effectiveStartDate || history.moveInDate;
      const end = history.effectiveEndDate || history.moveOutDate;
      return (
        start &&
        new Date(start) < new Date(periodEnd) &&
        (!end || new Date(end) > new Date(periodStart))
      );
    });
    if (overlapping) return overlapping;
    return [...rows].sort(
      (a, b) => new Date(b.moveInDate) - new Date(a.moveInDate),
    )[0];
  };

  const stamp = (reservation) => {
    const history = pickHistory(
      historyByReservation.get(String(reservation._id || "")),
    );
    if (!history) return reservation;
    return {
      ...reservation,
      _roomScopedMoveInDate:
        history.effectiveStartDate || history.moveInDate || null,
      _roomScopedMoveOutDate:
        history.effectiveEndDate || history.moveOutDate || null,
    };
  };

  const byId = new Map();
  for (const reservation of stillInRoom) {
    byId.set(String(reservation._id), stamp(reservation));
  }

  const transferredAwayIds = participantHistory
    .filter((history) => history.status === "transferred" && history.reservationId)
    .map((history) => history.reservationId)
    .filter((reservationId) => !byId.has(String(reservationId)));

  if (transferredAwayIds.length) {
    let transferredQuery = Reservation.find({
      _id: { $in: transferredAwayIds },
      status: { $in: BILLABLE_RESERVATION_STATUS_QUERY },
      isArchived: { $ne: true },
    }).populate("userId", "firstName lastName email");
    if (session) transferredQuery = transferredQuery.session(session);
    const transferredAway = await transferredQuery.lean();
    for (const reservation of transferredAway) {
      const stamped = stamp(reservation);
      const start = stamped._roomScopedMoveInDate;
      const end = stamped._roomScopedMoveOutDate;
      const overlaps =
        start &&
        new Date(start) < new Date(periodEnd) &&
        (!end || new Date(end) > new Date(periodStart));
      if (overlaps) byId.set(String(reservation._id), stamped);
    }
  }

  return [...byId.values()];
}
