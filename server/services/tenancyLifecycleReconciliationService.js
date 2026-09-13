import { notifyRequestAcknowledgement } from './requestAcknowledgementService.js';
import mongoose from 'mongoose';
import { toManilaStartOfDay } from '../utils/dateUtils.js';
import { BedHistory, Contract, Stay, Reservation, ScheduledRoomTransfer } from '../models/index.js';
import StayExtensionRequest from '../models/StayExtensionRequest.js';
import TenantTransferRequest from '../models/TenantTransferRequest.js';
import { autoGenerateRenewalContract } from './autoContractOrchestratorService.js';
import { sendLifecycle, serializeStayExtension } from './stayExtensionRequestService.js';
import { syncRequestFromScheduledTransfer } from './tenantTransferRequestService.js';
import { notify, notifyBranchAdmins } from './notifications/notificationService.js';
import { OPEN_SCHEDULED_ROOM_TRANSFER_STATUSES } from '../models/ScheduledRoomTransfer.js';
import logger from '../middleware/logger.js';

// Run by existing durable reconciliation Job 19. The canonical persisted rows
// are the retry source; notification delivery uses the same unique event keys.
export async function reconcileTenancyLifecycles({ now = new Date() } = {}) {
  const report = { recovered: 0, errors: 0 };
  const attempt = async fn => { try { await fn(); } catch (error) { report.errors++; logger.warn({ err: error }, 'Tenancy reconciliation will retry'); } };
  await ScheduledRoomTransfer.updateMany({ status: { $in: OPEN_SCHEDULED_ROOM_TRANSFER_STATUSES },
    executionToken: { $ne: null }, executionStartedAt: { $lt: new Date(now.getTime() - 15 * 60 * 1000) } },
    { $set: { executionToken: null, executionStartedAt: null } });
  // Execution is still Admin-only. A fenced, expired worker cannot commit after this reset.
  // Repair only the exact legacy early-switch shape; never guess at an
  // already-effective contract, room move, or unrelated Stay history.
  const nextDay = toManilaStartOfDay(now).add(1, 'day').toDate();
  const legacy = await Stay.find({ status: 'active', previousStayId: { $ne: null }, leaseStartDate: { $gte: nextDay } }).select('_id');
  for (const candidate of legacy) await attempt(async () => {
    const session = await mongoose.startSession();
    try { await session.withTransaction(async () => {
      const stay = await Stay.findById(candidate._id).session(session);
      if (stay?.status !== 'active') return;
      const previous = await Stay.findById(stay.previousStayId).session(session);
      const reservation = await Reservation.findById(stay.reservationId).session(session);
      const legal = await Contract.findOne({ reservationId: stay.reservationId, isCurrent: true, status: { $in: ['active', 'published', 'expiring_soon'] } }).session(session);
      if (!previous || previous.status !== 'renewed' || !legal || String(legal.stayId) !== String(previous._id)
        || String(reservation?.currentStayId) !== String(stay._id) || String(previous.roomId) !== String(stay.roomId)
        || String(reservation.roomId) !== String(stay.roomId) || String(previous.bedId) !== String(stay.bedId)) return;
      stay.status = 'upcoming'; previous.status = 'active'; previous.endedAt = null; previous.endReason = '';
      reservation.currentStayId = previous._id; reservation.latestStayStatus = 'active';
      await previous.save({ session }); await stay.save({ session }); await reservation.save({ session });
      await BedHistory.updateMany({ reservationId: reservation._id, stayId: stay._id, status: 'active' }, { $set: { stayId: previous._id } }, { session });
    }); } finally { await session.endSession(); }
  });
  for (const stay of await Stay.find({ status: 'upcoming' }).lean()) await attempt(async () => {
    const contract = await Contract.findOne({ stayId: stay._id, contractPurpose: 'renewal', status: { $nin: ['cancelled', 'voided', 'archived'] } });
    if (contract && !['draft', 'incomplete', 'ready_for_generation'].includes(contract.status)) return;
    const predecessor = contract?.replacesContractId ? await Contract.findById(contract.replacesContractId)
      : await Contract.findOne({ reservationId: stay.reservationId, isCurrent: true });
    if (!predecessor) throw new Error('Renewal predecessor contract missing.');
    const result = await autoGenerateRenewalContract({ reservationId: stay.reservationId, oldContract: predecessor, newStay: stay, actorId: stay.updatedBy || stay.createdBy });
    if (result?.success && !result.incomplete) report.recovered++;
  });
  for (const request of await StayExtensionRequest.find({}).lean()) await attempt(async () => {
    await sendLifecycle(request, request.status === 'approved' ? 'Approved' : request.status === 'rejected' ? 'Rejected' : 'Submitted');
    const view = await serializeStayExtension(request);
    if (request.status === 'approved' && view.fulfillmentState !== 'effective') {
      const ready = view.fulfillmentState === 'awaiting_effective_date';
      await notify.stayExtensionLifecycleOnce(request.tenantId, ready ? 'Extension Contract Ready' : 'Extension Contract Preparation',
        ready ? 'Your signed successor contract is ready and awaits its effective date.' : 'Your approved extension still requires contract preparation or signing. Contact Admin for assistance.',
        `extension_fulfillment:${request._id}:${ready ? 'ready' : 'action_required'}`, { entityType: 'reservation', entityId: request.reservationId, data: { screen: 'extend-stay' } });
    }
    if (request.status === 'pending') await notifyBranchAdmins(request.branch, 'general', 'New Stay Extension Request',
      'Review the tenant extension request in the Tenants workspace.', { entityType: 'reservation', entityId: request.reservationId, actionUrl: '/admin/tenants', dedupeKey: `extension_admin:${request._id}` });
  });
  for (const contract of await Contract.find({ contractPurpose: 'renewal', status: 'active', isCurrent: true }).lean())
    await attempt(() => notify.renewalEffective(contract.tenantId, contract.roomNumber, contract._id));
  for (const schedule of await ScheduledRoomTransfer.find({ isArchived: { $ne: true } })) await attempt(async () => {
    await syncRequestFromScheduledTransfer(schedule);
    if (OPEN_SCHEDULED_ROOM_TRANSFER_STATUSES.includes(schedule.status)) await notify.roomTransferLifecycleOnce(schedule.tenantId,
      schedule.status === 'action_required' ? 'Room Transfer Action Required' : 'Room Transfer Scheduled',
      schedule.status === 'action_required' ? 'Open your room transfer to review the required action or payment.' : 'Your room transfer has been scheduled. Open My Stays to view the confirmed date and time.',
      schedule.status === 'action_required' ? `room_transfer_action:${schedule._id}:${schedule.lastError || 'review'}` : `room_transfer_scheduled:${schedule._id}`,
      { entityId: String(schedule.reservationId), event: schedule.status });
  });
  for (const request of await TenantTransferRequest.find({ status: { $in: ['pending', 'declined'] } }).lean()) await attempt(async () => {
    const declined = request.status === 'declined';
    if (!declined) await notifyBranchAdmins(request.branch, 'general', 'New Room Transfer Request',
      'A tenant submitted a room transfer request. Review it in the Tenants workspace.',
      { entityType: 'reservation', entityId: String(request.reservationId), actionUrl: `/admin/tenants?reservationId=${request.reservationId}&focus=transfer-request`, dedupeKey: `tenant_transfer_request_admin:${request._id}` });

    await notify.roomTransferLifecycleOnce(request.tenantId, declined ? 'Room Transfer Request Declined' : 'Room Transfer Request Received',
      declined ? `Your room transfer request was declined.${request.declineReason ? ` Reason: ${request.declineReason}` : ''}` : 'Your room transfer request was received and is pending Admin review.',
      `tenant_transfer_request_${declined ? 'declined' : 'received'}:${request._id}`, { entityId: String(request.reservationId), event: declined ? 'declined' : 'received' });
  });
  for (const [kind, Model] of [['transfer', TenantTransferRequest], ['extension', StayExtensionRequest]]) {
    for (const request of await Model.find({ acknowledgedAt: { $ne: null } }).lean()) await attempt(() => notifyRequestAcknowledgement(request, kind));
  }
  return report;
}
