import { deriveContractLeaseDates } from './contractLeaseDateService.js';
import { stayContractEndDatesMatch } from './stayContractIntegrity.js';
import { hasReservationStatus } from '../utils/lifecycleNaming.js';
import { getManilaToday, toManilaStartOfDay } from '../utils/dateUtils.js';

const id = value => String(value?._id || value || '');
export function planStayContractDateRepair({ tenant, stays, contract, reservation, roomExists, blockers = [], now = new Date() }) {
  const review = reason => ({ status: 'review', reason });
  if (tenant?.role !== 'tenant' || tenant?.tenantStatus !== 'active') return review('inactive_tenant');
  if (stays?.length !== 1 || stays[0].endedAt) return review('missing_or_ambiguous_active_stay');
  const stay = stays[0];
  if (!contract || !['active', 'published', 'expiring_soon'].includes(contract.status)) return review('current_contract_not_ready');
  if (!reservation || !hasReservationStatus(reservation.status, 'moveIn') || reservation.isArchived ||
      id(reservation.userId) !== id(tenant) || (reservation.currentStayId && id(reservation.currentStayId) !== id(stay))) return review('reservation_relationship');
  if (id(contract.tenantId) !== id(tenant) || id(contract.reservationId || contract.applicationId) !== id(reservation) ||
      (contract.stayId && id(contract.stayId) !== id(stay)) || contract.isCurrent !== true || contract.isCanonical === false ||
      contract.archivedAt || contract.duplicateOfContractId || contract.supersededByContractId || contract.supersededBy) return review('contract_relationship');
  if (!roomExists || !contract.roomId || id(contract.roomId) !== id(stay.roomId) || id(reservation.roomId) !== id(stay.roomId)) return review('room_relationship');
  if (stayContractEndDatesMatch(stay.leaseEndDate, contract.leaseEndDate)) return { status: 'aligned' };
  if (blockers.length) return review('open_workflow');
  const start = toManilaStartOfDay(stay.leaseStartDate);
  const legalStart = toManilaStartOfDay(contract.leaseStartDate);
  const legalEnd = toManilaStartOfDay(contract.leaseEndDate);
  if (!start || !legalStart || !legalEnd || start.valueOf() !== legalStart.valueOf() ||
      start.isAfter(getManilaToday(now)) || !legalEnd.isAfter(getManilaToday(now))) return review('term_requires_review');
  try {
    const derived = deriveContractLeaseDates(contract);
    if (derived.leaseEndDate.getTime() !== new Date(contract.leaseEndDate).getTime()) return review('contract_term_requires_review');
  } catch { return review('contract_term_requires_review'); }
  return {
    status: 'repair', tenantId: id(tenant), stayId: id(stay), contractId: id(contract), reservationId: id(reservation),
    oldEndDate: new Date(stay.leaseEndDate).toISOString(), newEndDate: new Date(contract.leaseEndDate).toISOString(),
    stayUpdatedAt: stay.updatedAt ? new Date(stay.updatedAt).toISOString() : null,
    contractUpdatedAt: contract.updatedAt ? new Date(contract.updatedAt).toISOString() : null,
  };
}
