/**
 * ============================================================================
 * RESERVATION CONTROLLERS BARREL EXPORTS
 * ============================================================================
 *
 * Exposes all domain-specific reservation controllers from a single barrel index.
 */

// 1. Tenant Workspace Domain
export {
  getCurrentResidents,
  getTenantWorkspace,
  getTenantWorkspaceById,
  markTenantWorkspaceAsViewed,
  getTenantActionContext,
  getRoomMeterBaseline,
} from "./tenantWorkspaceController.js";

// 2. Visit Management & AI Pre-checks Domain
export {
  getVisitAvailability,
  getVisitAvailabilityRules,
  getVisitAvailabilityHistory,
  updateVisitAvailabilityRules,
  preflightVisitAvailabilityRules,
  getVisitConflictHistory,
  toggleResolveVisitConflict,
  getVisitSlotVisitors,
  getVisitScheduledUsersHistory,
  precheckReservationDocument,
} from "./visitManagementController.js";

// 3. Cancellation & Modification Domain
export {
  cancelReservationByUser,
  requestCancellationByUser,
  withdrawCancellationRequestByUser,
  approveCancellationRequest,
  rejectCancellationRequest,
  requestPreMoveInModification,
  approvePreMoveInModification,
  rejectPreMoveInModification,
} from "./cancellationController.js";

// 4. Tenancy Actions Domain
export {
  archiveReservation,
  restoreReservation,
  renewContract,
  previewRenewalPricing,
  createRenewalOffer,
  cancelRenewalOffer,
  respondToRenewalOffer,
  getMyRenewalOffers,
  moveOutReservation,
  checkoutReservation,
  transferTenant,
  prepareRoomTransferAddendumAction,
  discardRoomTransferAddendumAction,
  cancelScheduledRoomTransferAction,
  retryScheduledRoomTransferAction,
  rescheduleRoomTransferAction,
  completeRoomTransferAction,
  processDepositRefund,
  cancelMoveOutAction,
  earlyTerminationAction,
  swapRoomsAction,
  triggerAbandonmentAction,
  checkExtensionConflictAction,
} from "./tenancyActionsController.js";

// 5. CRUD Domain
export {
  getReservations,
  getReservationById,
  createReservation,
  deleteReservation,
  getMyContract,
} from "./reservationCrudController.js";

// 6. Reservation Lifecycle Domain
export {
  updateReservation,
  updateReservationByUser,
  extendReservation,
  releaseSlot,
  manageReservationVisit,
  touchReservationActivity,
} from "./reservationLifecycleController.js";

// 7. Visit Scheduling Domain
export {
  updateVisitPreferenceAndSchedule,
} from "./visitSchedulingController.js";

// 8. Application & Payment Domain
export {
  saveApplicationDraft,
  submitApplication,
  uploadPaymentProof,
} from "./applicationController.js";

// 7. Shared Helpers & Cache Invalidation
export {
  invalidateUserCache,
} from "./_helpers.js";
