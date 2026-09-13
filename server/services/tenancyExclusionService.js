import { getManilaToday } from '../utils/dateUtils.js';
import { Reservation, Stay, ScheduledRoomTransfer } from '../models/index.js';
import TenantTransferRequest from '../models/TenantTransferRequest.js';
import StayExtensionRequest from '../models/StayExtensionRequest.js';
import { OPEN_SCHEDULED_ROOM_TRANSFER_STATUSES } from '../models/ScheduledRoomTransfer.js';

// Every opening/approval/cutover writes the same tenancy document BEFORE
// reading competing lifecycles. Mongo transaction retries serialize races;
// no expiring application lock or second lifecycle is needed.
export async function lockTenancyOperation(reservationId, kind, session) {
  if (!session?.inTransaction()) throw new Error('A tenancy operation requires a transaction.');
  const reservation = await Reservation.findOneAndUpdate({ _id: reservationId },
    { $inc: { tenancyMutationVersion: 1 } }, { session, new: true });
  if (!reservation) throw Object.assign(new Error('Reservation not found.'), { statusCode: 404 });
  const tenantId = reservation.userId;
  let conflict;
  if (kind === 'transfer') {
    conflict = await StayExtensionRequest.exists({ tenantId, status: 'pending' }).session(session)
      || await Stay.exists({ tenantId, $or: [{ status: 'upcoming' }, { status: 'active', previousStayId: { $ne: null }, leaseStartDate: { $gte: getManilaToday().add(1, 'day').toDate() } }] }).session(session);
  } else {
    conflict = await TenantTransferRequest.exists({ tenantId, status: { $in: ['pending', 'scheduling', 'scheduled'] } }).session(session)
      || await ScheduledRoomTransfer.exists({ tenantId, status: { $in: OPEN_SCHEDULED_ROOM_TRANSFER_STATUSES }, isArchived: { $ne: true } }).session(session);
  }
  if (conflict) throw Object.assign(new Error('Resolve the conflicting room transfer or stay extension first.'), {
    statusCode: 409, code: 'TENANCY_OPERATION_CONFLICT',
  });
  return reservation;
}
