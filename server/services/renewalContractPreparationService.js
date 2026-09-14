import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { Contract, Reservation, Room, Stay } from '../models/index.js';
import { OFFICIAL_CONTRACT_TEMPLATES } from '../config/contractTemplateRegistry.js';
import { getBusinessSettings } from '../utils/businessSettings.js';
import { notifyBranchAdmins } from './notifications/notificationService.js';
import logger from '../middleware/logger.js';

const permanentCodes = new Set([
  'CONTRACT_TEMPLATE_DURATION_MISMATCH', 'LEASE_DURATION_CONFLICT',
  'LEASE_TYPE_DURATION_MISMATCH', 'LEASE_DATE_RANGE_INVALID', 'LEASE_DATES_REQUIRED',
  'INVALID_RENEWAL_DATES', 'CONTRACT_LEASE_DURATION_INVALID', 'CONTRACT_LEASE_START_DATE_INVALID',
  'CONTRACT_TEMPLATE_NOT_FOUND', 'CONTRACT_TEMPLATE_INACTIVE', 'CONTRACT_TEMPLATE_UNAVAILABLE',
  'CONTRACT_TEMPLATE_MISSING', 'CONTRACT_TEMPLATE_FILE_MISSING', 'CONTRACT_TEMPLATE_CHECKSUM_MISMATCH',
  'CONTRACT_TEMPLATE_METADATA_MISSING', 'CONTRACT_TEMPLATE_INVALID_PDF', 'CONTRACT_TEMPLATE_NOT_PDF', 'CONTRACT_TEMPLATE_INVALID',
  'ROOM_LABEL_TOO_LONG_FOR_TEMPLATE', 'CONTRACT_TEMPLATE_MISMATCH', 'ROOM_TYPE_NOT_ALLOWED_FOR_BRANCH',
  'CONTRACT_SOURCE_RECORD_MISSING', 'CONTRACT_SOURCE_IDENTITY_CONFLICT',
  'CONTRACT_ROOM_TYPE_CONFLICT', 'CONTRACT_BRANCH_CONFLICT', 'PREVIOUS_CONTRACT_REQUIRED',
  'RENEWAL_PREPARATION_CLOSED', 'MULTIPLE_RENEWAL_SUCCESSORS', 'CONTRACT_REQUIRED_FIELD_MISSING',
]);

export function classifyRenewalPreparationError(error) {
  const nested = error?.details?.errors?.[0] || error?.details?.conflicts?.[0];
  const code = nested?.code || error?.code || 'RENEWAL_PREPARATION_FAILED';
  return { code, message: nested?.message || error?.message || 'Unable to prepare renewal contract.',
    status: permanentCodes.has(code) || [400, 422].includes(error?.statusCode) ? 'action_required' : 'retryable' };
}

const pick = (value, keys) => Object.fromEntries(keys.map(key => [key, value?.[key] ?? null]));
const termFields = ['leaseStartDate', 'leaseEndDate', 'leaseDurationMonths', 'roomId', 'roomType', 'branch',
  'bedId', 'roomNumber', 'templateType', 'templateVersion', 'tenantLegalName', 'tenantAddress', 'tenantNationality', 'tenantBirthDate', 'leaseType',
  'regularMonthlyRate', 'discountPercentage', 'discountAmount', 'approvedMonthlyRate',
  'advanceRentAmount', 'securityDepositAmount', 'reservationFeeAmount', 'reservationFeeCreditAmount',
  'pricingApprovedBy', 'pricingApprovedAt', 'advanceCoverageStart', 'advanceCoverageEnd'];

export async function renewalPreparationContext({ newStay, oldContract, reservationId }) {
  const [stay, contract, room, reservation, settings, templates] = await Promise.all([
    Stay.findById(newStay._id).lean(),
    Contract.findOne({ stayId: newStay._id, contractPurpose: 'renewal' }).sort({ createdAt: -1 }).lean(),
    Room.findById(oldContract?.roomId || newStay.roomId).lean(),
    Reservation.findById(reservationId).lean(), getBusinessSettings(),
    Promise.all(OFFICIAL_CONTRACT_TEMPLATES.map(async t => {
      let file;
      try { const stat = await fs.stat(t.sourceFilePath); file = [stat.size, stat.mtimeMs]; }
      catch (e) { file = e.code; }
      return [t.templateId, t.templateVersion, t.checksum, t.active, file];
    })),
  ]);
  const inputHash = crypto.createHash('sha256').update(JSON.stringify({ version: 1,
    stay: pick(stay || newStay, [...termFields, 'renewalOfferId', 'renewalPricingSnapshot', 'previousStayId']),
    predecessor: pick(oldContract, termFields), contract: contract ? pick(contract, [...termFields, 'status']) : null,
    room: pick(room, ['type', 'branch', 'regularLongRate', 'regularShortRate', 'isDiscountEnabled']),
    reservation: pick(reservation, ['userId', 'roomId', 'applicationReviewedAt', 'applicationReviewedBy',
      'paymentStatus', 'reservationFeeAmount', 'renewalOffers', 'pricingSnapshot']), settings, templates,
  })).digest('hex');
  return { stay, contract, inputHash };
}

async function alertFailure(params, failure) {
  if (failure.adminNotified) return;
  const notifications = await notifyBranchAdmins(params.oldContract?.branch || params.newStay.branch, 'contract_error',
    'Renewal Contract Preparation Requires Attention', failure.message, {
      entityType: 'reservation', entityId: String(params.reservationId),
      reservationId: String(params.reservationId),
      actionUrl: `/admin/tenants?reservationId=${params.reservationId}`,
      reuseExisting: true,
      dedupeKey: `renewal_preparation:${params.newStay._id}:${failure.inputHash}:${failure.code}`,
    });
  if (notifications.length) await Stay.updateOne({ _id: params.newStay._id, 'contractPreparation.inputHash': failure.inputHash },
    { $set: { 'contractPreparation.adminNotified': true } });
}

export async function skipBlockedRenewalPreparation(params) {
  const context = await renewalPreparationContext(params);
  const failure = context.stay?.contractPreparation;
  if (!params.retry && failure?.status === 'action_required' && failure.inputHash === context.inputHash) {
    // Replaying the same dedupe key also recovers a previously failed notification delivery.
    await alertFailure(params, failure);
    return { success: false, actionRequired: true, skipped: true, code: failure.code, error: failure.message };
  }
  if (['cancelled', 'voided', 'rejected', 'archived'].includes(context.contract?.status)) {
    throw Object.assign(new Error('This renewal Contract was closed; Admin review is required.'), { code: 'RENEWAL_PREPARATION_CLOSED' });
  }
  if (context.contract && !['draft', 'incomplete', 'ready_for_generation'].includes(context.contract.status)) {
    await Stay.updateOne({ _id: params.newStay._id }, { $set: { contractPreparation: null } });
    return { success: true, successorContractId: String(context.contract._id), status: context.contract.status };
  }
  return null;
}

export async function recordRenewalPreparationFailure(params, error) {
  const context = await renewalPreparationContext(params);
  const failure = { ...classifyRenewalPreparationError(error), inputHash: context.inputHash, failedAt: new Date() };
  const previous = context.stay?.contractPreparation;
  failure.adminNotified = previous?.inputHash === failure.inputHash && previous?.code === failure.code && previous.adminNotified;
  await Stay.updateOne({ _id: params.newStay._id }, { $set: { contractPreparation: failure } });
  logger.warn({ code: failure.code, stayId: params.newStay._id }, 'Renewal contract preparation failed');
  await alertFailure(params, failure);
  return { success: false, code: failure.code, error: failure.message, actionRequired: failure.status === 'action_required' };
}

export async function clearRenewalPreparationFailure(stayId) {
  await Stay.updateOne({ _id: stayId }, { $set: { contractPreparation: null } });
}

export async function reconcileRenewalContractPreparation() {
  const report = { recovered: 0, actionRequired: 0, retryable: 0 };
  const { autoGenerateRenewalContract } = await import('./autoContractOrchestratorService.js');
  for (const stay of await Stay.find({ status: 'upcoming', previousStayId: { $ne: null } }).lean()) {
    try {
      const predecessor = await Contract.findOne({ stayId: stay.previousStayId, isCurrent: true });
      const result = await autoGenerateRenewalContract({ reservationId: stay.reservationId, oldContract: predecessor,
        newStay: stay, actorId: stay.updatedBy || stay.createdBy });
      if (result?.success && !result.incomplete) report.recovered++;
      else if (result?.actionRequired) report.actionRequired++;
      else report.retryable++;
    } catch (error) {
      report.retryable++;
      logger.warn({ err: error, stayId: stay._id }, 'Renewal preparation reconciliation will retry');
    }
  }
  return report;
}

// Coordinate inline, manual, and scheduled preparation across application instances.
// Expiry makes an interrupted worker recoverable without a new index or repair job.
export async function withRenewalPreparationLock(stayId, prepare) {
  const token = crypto.randomUUID();
  const now = new Date();
  const acquired = await Stay.findOneAndUpdate({ _id: stayId, $or: [
    { contractPreparationLease: null }, { 'contractPreparationLease.expiresAt': { $lte: now } },
  ] }, { $set: { contractPreparationLease: { token, expiresAt: new Date(now.getTime() + 15 * 60 * 1000) } } });
  if (!acquired) return { success: false, inProgress: true, code: 'RENEWAL_PREPARATION_IN_PROGRESS' };
  try { return await prepare(); }
  finally {
    await Stay.updateOne({ _id: stayId, 'contractPreparationLease.token': token },
      { $set: { contractPreparationLease: null } });
  }
}
