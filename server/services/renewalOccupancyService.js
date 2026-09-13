import { reservationStatusesForQuery } from '../utils/lifecycleNaming.js';
import { Room, Stay, Reservation, ScheduledRoomTransfer } from '../models/index.js';
import { OPEN_SCHEDULED_ROOM_TRANSFER_STATUSES } from '../models/ScheduledRoomTransfer.js';
import { computeLeaseEndDate } from '../utils/tenantWorkspace.js';
import { toManilaStartOfDay } from '../utils/dateUtils.js';

export async function assertRenewalOccupancy({ reservation, stay, start, end, session, lockInventory = true }) {
  // Serialize with canonical inventory writers while validating the entire interval.
  const room = lockInventory ? await Room.findOneAndUpdate({ _id: stay.roomId }, { $inc: { __v: 1 } }, { new: true, session }) : await Room.findById(stay.roomId).session(session);
  const fail = () => { throw Object.assign(new Error('The room or bed is unavailable for the full extension interval.'), { statusCode: 409, code: 'EXTENSION_OCCUPANCY_CONFLICT' }); };
  if (!room || room.isArchived) fail();
  const shared = ['double-sharing', 'quadruple-sharing'].includes(room.type);
  const bedId = shared ? String(stay.bedId || '') : null;
  if (shared && (!bedId || bedId.startsWith('room-') || !(room.beds || []).some(b => String(b.id || b._id) === bedId))) fail();
  const assignedBed = shared ? room.beds.find(b => String(b.id || b._id) === bedId) : null;
  if (assignedBed?.status === 'maintenance' || (assignedBed?.status === 'locked' && String(assignedBed.lockedBy) !== String(stay.tenantId) && (!assignedBed.lockExpiresAt || new Date(assignedBed.lockExpiresAt) > new Date()))) fail();
  const from = toManilaStartOfDay(start).valueOf(), until = toManilaStartOfDay(end).add(1, 'day').valueOf();
  const overlaps = (a, b) => (!a || toManilaStartOfDay(a).valueOf() < until) && (!b || toManilaStartOfDay(b).add(1, 'day').valueOf() > from);
  const sameBed = (value) => !shared || !value || String(value) === bedId;
  const allocations = [];
  const add = (tenant, a, b) => allocations.push({ tenant: String(tenant), start: a ? toManilaStartOfDay(a).valueOf() : from, end: b ? toManilaStartOfDay(b).add(1, 'day').valueOf() : Infinity });
  const others = await Stay.find({ roomId: room._id, tenantId: { $ne: stay.tenantId }, status: { $in: ['active', 'ending_soon', 'upcoming', 'expired_occupancy_continuing'] } }).session(session).lean();
  for (const other of others) { add(other.tenantId, other.leaseStartDate, other.leaseEndDate); if (sameBed(other.bedId) && overlaps(other.leaseStartDate, other.leaseEndDate)) fail(); }
  const reservations = await Reservation.find({ roomId: room._id, userId: { $ne: stay.tenantId }, isArchived: { $ne: true }, status: { $in: reservationStatusesForQuery('reserved', 'approved_for_payment', 'payment_pending', 'moveIn') } }).session(session).lean();
  for (const other of reservations) {
    // Stay dates are authoritative for tenancies that have them.
    if (others.some(s => String(s.reservationId) === String(other._id))) continue;
    add(other.userId, other.leaseStartDate || other.expectedMoveInDate || other.moveInDate, computeLeaseEndDate(other));
    if (sameBed(other.selectedBed?.id) && overlaps(other.leaseStartDate || other.expectedMoveInDate || other.moveInDate, computeLeaseEndDate(other))) fail();
  }
  const holds = await ScheduledRoomTransfer.find({ destinationRoomId: room._id, tenantId: { $ne: stay.tenantId }, status: { $in: OPEN_SCHEDULED_ROOM_TRANSFER_STATUSES }, isArchived: { $ne: true } }).session(session).lean();
  for (const hold of holds) { add(hold.tenantId, hold.effectiveTransferDate, null); if (sameBed(hold.destinationBedId) && overlaps(hold.effectiveTransferDate, null)) fail(); }
  const points = [from, ...allocations.map(a => a.start).filter(t => t >= from && t < until)];
  for (const point of points) if (new Set(allocations.filter(a => a.start <= point && a.end > point).map(a => a.tenant)).size + 1 > Number(room.capacity || 1)) fail();
}
