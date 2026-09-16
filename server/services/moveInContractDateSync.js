import mongoose from 'mongoose';
import { Contract, Reservation, Stay } from '../models/index.js';

export function canRealignMoveInDraft(contract) {
  return Boolean(contract && ['draft', 'incomplete', 'ready_for_generation', 'generated', 'awaiting_signatures'].includes(contract.status)
    && contract.isCurrent !== false && contract.isCanonical !== false && !contract.archivedAt
    && !contract.finalDocument && !contract.finalStorageKey && !contract.publishedAt && !contract.signedAt
    && !contract.signedDocuments?.length && !contract.notarizedDocuments?.length
    && !contract.replacesContractId && !['renewal', 'transfer_addendum', 'room_transfer'].includes(contract.contractPurpose));
}

// The move-in preparation retry used to update Contract alone, leaving the
// active Stay with stale dates. Commit both or neither, before PDF generation.
export async function synchronizeMoveInDraftDates(contract, updateFields) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const current = await Contract.findById(contract._id).session(session);
      if (!canRealignMoveInDraft(current) || new Date(current.updatedAt).getTime() !== new Date(contract.updatedAt).getTime()) {
        throw Object.assign(new Error('Contract changed before move-in date alignment.'), {code:'MOVE_IN_CONTRACT_CHANGED',statusCode:409});
      }
      const reservation = await Reservation.findById(current.reservationId).session(session);
      if (!reservation || String(reservation.userId) !== String(current.tenantId)) {
        throw Object.assign(new Error('Reservation changed before move-in date alignment.'), {code:'MOVE_IN_STAY_CHANGED',statusCode:409});
      }
      const stays = await Stay.find({reservationId:current.reservationId, tenantId:current.tenantId, status:{$in:['active','ending_soon']}}).limit(2).session(session);
      if (stays.length > 1 || (reservation.currentStayId && (stays.length !== 1 || String(reservation.currentStayId) !== String(stays[0]._id)))) {
        throw Object.assign(new Error('Stay relationship changed before move-in date alignment.'), {code:'MOVE_IN_STAY_CHANGED',statusCode:409});
      }
      if (stays[0]) {
        const stay = stays[0];
        if (stay.endedAt || stay.previousStayId || String(stay.roomId) !== String(current.roomId) ||
            new Date(stay.leaseStartDate).getTime() !== new Date(updateFields.leaseStartDate).getTime()) {
          throw Object.assign(new Error('Current stay requires review before move-in date alignment.'), {code:'MOVE_IN_STAY_CHANGED',statusCode:409});
        }
        await Stay.updateOne({_id:stay._id}, {$set:{leaseEndDate:updateFields.leaseEndDate}}, {session});
      }
      await Contract.updateOne({_id:current._id}, {$set:updateFields}, {session});
    });
  } finally {await session.endSession();}
}
