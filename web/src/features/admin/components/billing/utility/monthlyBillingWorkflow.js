export function completedUtilityPeriodId(response) {
  return response?.result?.periodId || response?.period?.id || response?.period?._id || response?.id || null;
}

export function readyUtilityCycles(rooms = []) {
  return rooms.flatMap((room) => (room.readyPeriods || []).map((period) => ({
    ...room,
    roomId: room.id || room._id,
    id: String(period.id || period._id),
    period,
  })));
}

// A newly completed period can arrive after its replacement OPEN period (or
// after a stale query result). Preserve the review selection while it loads.
export function selectUtilityPeriod({ periods, selectedId, completedId }) {
  if (completedId && selectedId === completedId) return completedId;
  return periods.some((period) => period.id === selectedId) ? selectedId : periods[0]?.id || null;
}
