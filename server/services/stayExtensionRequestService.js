import mongoose from 'mongoose';
import { isOwnerRole, isAdminRole } from '../config/roles.js';
import StayExtensionRequest from '../models/StayExtensionRequest.js';
import { Contract, Reservation, Room, Stay, User } from '../models/index.js';
import MoveOutClearance from '../models/MoveOutClearance.js';
import TerminationReview from '../models/TerminationReview.js';
import LeaseRenewal from '../models/LeaseRenewal.js';
import TenantTransferRequest from '../models/TenantTransferRequest.js';
import ScheduledRoomTransfer, { OPEN_SCHEDULED_ROOM_TRANSFER_STATUSES } from '../models/ScheduledRoomTransfer.js';
import { resolveCurrentStayForTenant, resolveAuthoritativeCurrentContract } from './tenantContractSelectionService.js';
import { resolveAuthoritativeLeasePricing } from './contractPricingResolver.js';
import { getBusinessSettings } from '../utils/businessSettings.js';
import { hasReservationStatus } from '../utils/lifecycleNaming.js';
import { getManilaToday, toManilaStartOfDay } from '../utils/dateUtils.js';
import { renewStayWorkflow } from '../utils/tenantActionService.js';
import { notify, notifyBranchAdmins } from './notifications/notificationService.js';

const fail = (message, statusCode = 409) => { throw Object.assign(new Error(message), { statusCode }); };
const id = (value) => String(value?._id || value || '');
const text = (value, limit) => {
  if (value != null && typeof value !== 'string') fail('Invalid text field.', 400);
  if ((value || '').length > limit) fail(`Text must be ${limit} characters or fewer.`, 400);
  return (value || '').trim();
};

function validRequestedDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return false;
  const day = value.slice(0, 10);
  const parsed = new Date(`${day}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day && Number.isFinite(new Date(value).getTime());
}

export function extensionDates(currentEndDate, months) {
  if (!Number.isInteger(months) || months < 1 || months > 24) fail('Choose an extension of 1 to 24 whole months.', 400);
  const current = toManilaStartOfDay(currentEndDate);
  if (!current || current.isBefore(getManilaToday(), 'day')) fail('Your current lease must not have ended.', 400);
  const start = current.add(1, 'day');
  return { start: start.toDate(), end: start.add(months, 'month').subtract(1, 'day').toDate() };
}

async function currentContext(tenantId, session = null) {
  const user = await User.findById(tenantId).session(session);
  if (!user || user.role !== 'tenant' || user.tenantStatus !== 'active') fail('Only active tenants may extend a stay.', 403);
  const stay = await resolveCurrentStayForTenant(tenantId, { session });
  if (!stay || stay.endedAt || !['active', 'ending_soon'].includes(stay.status)) fail('A current active stay is required.');
  const reservation = await Reservation.findOne({ _id: stay.reservationId, userId: tenantId, isArchived: { $ne: true } }).session(session);
  if (!reservation || !hasReservationStatus(reservation.status, 'moveIn') ||
      (reservation.currentStayId && id(reservation.currentStayId) !== id(stay))) fail('Your current stay has changed.');
  const contract = await resolveAuthoritativeCurrentContract({ reservationId: reservation._id, tenantId, session, strictIntegrityCheck: true });
  if (!contract || !['active', 'published', 'expiring_soon'].includes(contract.status)) fail('A current contract is required.');
  if (!contract.leaseEndDate || toManilaStartOfDay(contract.leaseEndDate)?.valueOf() !== toManilaStartOfDay(stay.leaseEndDate)?.valueOf()) fail('The current stay and contract dates require Admin review.');
  if (toManilaStartOfDay(stay.leaseStartDate)?.isAfter(getManilaToday(), 'day')) fail('Your renewed stay has not started yet.');
  if (id(contract.roomId) && id(contract.roomId) !== id(stay.roomId)) fail('Your current room and contract require Admin review.');
  const room = await Room.findById(stay.roomId).session(session);
  if (!room) fail('Current room details are unavailable.');
  return { user, stay, reservation, contract, room };
}

async function assertNoConflicts(context, session = null) {
  const { stay, reservation } = context;
  if (await MoveOutClearance.exists({ reservationId: reservation._id }).session(session)) fail('Move-out clearance has already started.');
  if (await TerminationReview.exists({ reservationId: reservation._id, $or: [{ status: { $in: ['open', 'under_review', 'pending_response'] } }, { executionStatus: 'pending_execution' }] }).session(session)) fail('Resolve the active termination review first.');
  if (await LeaseRenewal.exists({ reservationId: reservation._id, status: { $in: ['draft', 'pending_approval', 'approved', 'tenant_notified', 'tenant_acknowledged'] }, isArchived: { $ne: true } }).session(session)) fail('Resolve the existing renewal workflow first.');
  if (await Contract.exists({ replacesContractId: context.contract._id, status: { $nin: ['cancelled', 'voided', 'rejected', 'archived', 'replaced', 'expired', 'terminated'] }, archivedAt: null }).session(session)) fail('A successor contract already exists.');
  if (reservation.renewalOffers?.some((offer) => offer.status === 'pending')) fail('Resolve the existing renewal offer first.');
  if (await Stay.exists({ previousStayId: stay._id, status: { $nin: ['cancelled', 'terminated'] } }).session(session)) fail('A renewal already exists.');
  if (await TenantTransferRequest.exists({ tenantId: stay.tenantId, status: { $in: ['pending', 'scheduling', 'scheduled'] } }).session(session)) fail('Resolve the room transfer request first.');
  if (await ScheduledRoomTransfer.exists({ tenantId: stay.tenantId, status: { $in: OPEN_SCHEDULED_ROOM_TRANSFER_STATUSES }, isArchived: { $ne: true } }).session(session)) fail('Resolve the scheduled room transfer first.');
}

async function sendLifecycle(request, event) {
  await notify.stayExtensionLifecycleOnce(request.tenantId, `Stay Extension ${event}`, event === 'Submitted'
    ? 'Your stay extension request is pending Admin review.'
    : event === 'Approved'
      ? 'Your extension was approved. Your successor lease follows the contract preparation and signing process.'
      : `Your extension request was rejected.${request.adminNote ? ` ${request.adminNote}` : ''}`,
  `stay_extension:${request._id}:${event}`, {
    entityType: 'reservation', entityId: request.reservationId,
    actionUrl: '/extend-stay', data: { screen: 'extend-stay' },
  });
}

export async function getMyStayExtension(tenantId) {
  const request = await StayExtensionRequest.findOne({ tenantId }).sort({ createdAt: -1 }).lean();
  try {
    const context = await currentContext(tenantId);
    const current = { stayId: id(context.stay), startDate: context.stay.leaseStartDate, endDate: context.stay.leaseEndDate, room: context.room.name };
    if (request?.status === 'pending') return { request, current, canRequest: false };
    await assertNoConflicts(context);
    extensionDates(context.stay.leaseEndDate, 1);
    const settings = await getBusinessSettings();
    const options = [1, 3, 6, 12].map((months) => ({
      months, endDate: extensionDates(context.stay.leaseEndDate, months).end,
      monthlyRent: resolveAuthoritativeLeasePricing({ room: context.room, roomType: context.room.type, branch: context.room.branch, leaseDurationMonths: months, settings }).finalMonthlyRate,
    }));
    return { request, current, options, canRequest: true };
  } catch (error) {
    if (!error.statusCode) throw error;
    return { request, current: null, canRequest: false, reason: error.message };
  }
}

export async function createStayExtension({ tenantId, payload = {} }) {
  const months = Number(payload.months);
  if (payload.requestedEndDate != null && !validRequestedDate(payload.requestedEndDate)) fail('Enter a valid requested end date.', 400);
  const reason = text(payload.reason, 500), note = text(payload.note, 1000);
  const session = await mongoose.startSession();
  let request;
  try {
    await session.withTransaction(async () => {
      const context = await currentContext(tenantId, session);
      const { stay, reservation, contract, room } = context;
      if (id(stay) !== id(payload.stayId)) fail('Your stay changed. Refresh before submitting.');
      await assertNoConflicts(context, session);
      const dates = extensionDates(stay.leaseEndDate, months);
      if (payload.requestedEndDate && toManilaStartOfDay(payload.requestedEndDate)?.valueOf() !== toManilaStartOfDay(dates.end).valueOf()) fail('The requested end date does not match the extension duration.', 400);
      const pricing = resolveAuthoritativeLeasePricing({ room, roomType: room.type, branch: room.branch, leaseDurationMonths: months, settings: await getBusinessSettings() });
      if (!pricing || !Number.isFinite(pricing.finalMonthlyRate)) fail('Extension pricing needs Admin review.');
      if (payload.expectedMonthlyRent != null && Number(payload.expectedMonthlyRent) !== pricing.finalMonthlyRate) fail('Extension pricing changed. Refresh and review the new rate before submitting.');
      if (reservation.pendingExtensionRequestId || await StayExtensionRequest.exists({ tenantId, status: 'pending' }).session(session)) fail('An extension request is already pending.');
      [request] = await StayExtensionRequest.create([{
        tenantId, reservationId: reservation._id, stayId: stay._id, contractId: contract._id, roomId: room._id, branch: room.branch,
        currentStartDate: stay.leaseStartDate, currentEndDate: stay.leaseEndDate, requestedEndDate: dates.end,
        months, monthlyRent: pricing.finalMonthlyRate, reason, note,
      }], { session });
      reservation.pendingExtensionRequestId = request._id;
      await reservation.save({ session, validateModifiedOnly: true });
    });
  } catch (error) {
    if (error.code === 11000) fail('An extension request is already pending.');
    throw error;
  } finally { await session.endSession(); }
  await sendLifecycle(request, 'Submitted');
  await notifyBranchAdmins(request.branch, 'general', 'New Stay Extension Request', 'Review the tenant extension request in the Tenants workspace.', {
    entityType: 'reservation', entityId: request.reservationId, actionUrl: '/admin/tenants', dedupeKey: `extension_admin:${request._id}`,
  });
  return request;
}

export async function reviewStayExtension({ requestId, actor, decision, adminNote }) {
  if (!['approved', 'rejected'].includes(decision)) fail('Choose approve or reject.', 400);
  const request = await StayExtensionRequest.findById(requestId);
  if (!request) fail('Request not found.', 404);
  if (!isAdminRole(actor?.role) || (!isOwnerRole(actor.role) && actor.branch !== request.branch)) fail('This request belongs to another branch.', 403);
  if (request.status !== 'pending') fail('This request has already been reviewed.');
  const note = text(adminNote, 1000);
  if (decision === 'approved') {
    const context = await currentContext(request.tenantId);
    await assertNoConflicts(context);
    const dates = extensionDates(request.currentEndDate, request.months);
    const pricing = resolveAuthoritativeLeasePricing({ room: context.room, roomType: context.room.type, branch: context.room.branch, leaseDurationMonths: request.months, settings: await getBusinessSettings() });
    if (pricing.finalMonthlyRate !== request.monthlyRent) fail('Pricing changed. Reject this request and ask the tenant to submit a new request.');
    await renewStayWorkflow({ reservationId: request.reservationId, actorId: actor._id, extensionRequestId: request._id,
      payload: { confirm: true, newLeaseStartDate: dates.start, newLeaseEndDate: dates.end, monthlyRent: request.monthlyRent, notes: note } });
  } else {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const changed = await StayExtensionRequest.updateOne({ _id: request._id, status: 'pending' }, { $set: { status: decision, adminNote: note, reviewedBy: actor._id, reviewedAt: new Date() } }, { session });
        if (!changed.modifiedCount) fail('This request has already been reviewed.');
        await Reservation.updateOne({ _id: request.reservationId, pendingExtensionRequestId: request._id }, { $unset: { pendingExtensionRequestId: '' } }, { session });
      });
    } finally { await session.endSession(); }
  }
  const reviewed = await StayExtensionRequest.findById(request._id);
  await sendLifecycle(reviewed, decision === 'approved' ? 'Approved' : 'Rejected');
  return reviewed;
}
