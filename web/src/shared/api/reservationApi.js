/**
 * Reservation API - Domain-specific reservation operations
 */

import { authFetch } from "./httpClient.js";
import { normalizeLifecyclePayload } from "../utils/lifecycleNaming.js";

const withLifecycleNormalization = (promise) =>
  promise.then((payload) => normalizeLifecyclePayload(payload));

export const reservationApi = {
  declineTenantTransferRequest: (requestId, declineReason = "") =>
    authFetch(`/tenant/room-transfer-requests/${requestId}/decline`, {
      method: "PATCH",
      body: JSON.stringify({ declineReason }),
    }),
  /**
   * Get all reservations
   */
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `/reservations?${queryString}` : "/reservations";
    return withLifecycleNormalization(authFetch(url));
  },

  /**
   * Get current moved-in residents for admin tenants page
   */
  getCurrentResidents: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.branch && params.branch !== "all") {
      searchParams.set("branch", params.branch);
    }
    const query = searchParams.toString();
    return withLifecycleNormalization(
      authFetch(`/reservations/current-residents${query ? `?${query}` : ""}`),
    );
  },

  /**
   * Get tenancy workspace rows for the admin tenants page.
   */
  getTenantWorkspace: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.branch && params.branch !== "all") {
      searchParams.set("branch", params.branch);
    }
    const query = searchParams.toString();
    return authFetch(`/reservations/tenant-workspace${query ? `?${query}` : ""}`);
  },

  /**
   * Get a single tenancy workspace detail payload.
   */
  getTenantWorkspaceById: (reservationId) =>
    authFetch(`/reservations/tenant-workspace/${reservationId}`),

  /**
   * Mark a tenant workspace record as viewed by admin.
   */
  markTenantAsViewed: (reservationId) =>
    authFetch(`/reservations/tenant-workspace/${reservationId}/viewed`, {
      method: "POST",
    }),

  getTenantActionContext: (reservationId) =>
    authFetch(`/reservations/${reservationId}/tenant-actions/context`),

  // Same endpoint, additionally returning `transferPreview` — the canonical
  // rent-adjustment / additional-deposit / required-vs-held numbers for a
  // candidate destination room. Additive: base callers pass no params.
  // `includeCandidates` also returns `transferCandidates` — the
  // server-authoritative room selector list (availabilityStatus / selectable /
  // unavailableReason, per-bed the same).
  getRoomTransferPreview: (
    reservationId,
    { targetRoomId, effectiveTransferDate, includeCandidates } = {},
  ) => {
    const qs = new URLSearchParams();
    if (targetRoomId) qs.set("targetRoomId", String(targetRoomId));
    if (effectiveTransferDate) qs.set("effectiveTransferDate", String(effectiveTransferDate));
    if (includeCandidates) qs.set("includeCandidates", "1");
    return authFetch(`/reservations/${reservationId}/tenant-actions/context?${qs.toString()}`);
  },

  getVisitAvailability: (params = {}) => {
    const queryString = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ""),
    ).toString();
    return authFetch(`/reservations/visit-availability${queryString ? `?${queryString}` : ""}`);
  },

  getVisitAvailabilitySettings: (branch) => {
    const queryString = new URLSearchParams({ branch }).toString();
    return authFetch(`/reservations/visit-availability/settings?${queryString}`);
  },

  updateVisitAvailabilitySettings: (branch, data) => {
    const queryString = new URLSearchParams({ branch }).toString();
    return authFetch(`/reservations/visit-availability/settings?${queryString}`, {
      method: "PUT",
      body: JSON.stringify({ ...data, weekdaySystem: "js-get-day" }),
    });
  },

  /**
   * Get paginated availability rules change history for a branch.
   */
  getVisitAvailabilityHistory: (branch, params = {}) => {
    const searchParams = new URLSearchParams({ branch });
    if (params.page) searchParams.set("page", String(params.page));
    if (params.limit) searchParams.set("limit", String(params.limit));
    return authFetch(`/reservations/visit-availability/history?${searchParams.toString()}`);
  },

  /**
   * Preflight check for rule change conflicts.
   */
  preflightVisitAvailabilityRules: (branch, data) => {
    const queryString = new URLSearchParams({ branch }).toString();
    return authFetch(`/reservations/visit-availability/rules/preflight?${queryString}`, {
      method: "POST",
      body: JSON.stringify({ ...data, weekdaySystem: "js-get-day" }),
    });
  },

  /**
   * Get paginated rule change conflict history for a branch.
   */
  getVisitConflictHistory: (branch, params = {}) => {
    const searchParams = new URLSearchParams({ branch });
    if (params.page) searchParams.set("page", String(params.page));
    if (params.limit) searchParams.set("limit", String(params.limit));
    if (params.resolved !== undefined && params.resolved !== null && params.resolved !== "") {
      searchParams.set("resolved", String(params.resolved));
    }
    return authFetch(`/reservations/visit-availability/conflicts?${searchParams.toString()}`);
  },

  /**
   * Resolve or unresolve a visit conflict log entry.
   */
  toggleResolveVisitConflict: (branch, conflictId, resolved) => {
    const searchParams = new URLSearchParams({ branch });
    return authFetch(
      `/reservations/visit-availability/conflicts/${conflictId}/resolve?${searchParams.toString()}`,
      {
        method: "PATCH",
        body: JSON.stringify({ resolved }),
      },
    );
  },

  /**
   * Get booked visitors for a specific date and time slot.
   */
  getVisitSlotVisitors: (branch, date, slot) => {
    const searchParams = new URLSearchParams({ branch, date, slot });
    return authFetch(`/reservations/visit-availability/slot-visitors?${searchParams.toString()}`);
  },

  /**
   * Get scheduled users/visits history for a branch.
   */
  getVisitScheduledUsers: (branch, params = {}) => {
    const searchParams = new URLSearchParams({ branch });
    if (params.page) searchParams.set("page", String(params.page));
    if (params.limit) searchParams.set("limit", String(params.limit));
    if (params.status) searchParams.set("status", String(params.status));
    if (params.search) searchParams.set("search", String(params.search));
    return authFetch(`/reservations/visit-availability/scheduled-users?${searchParams.toString()}`);
  },

  /**
   * Get reservation by ID
   */
  getById: (reservationId) =>
    withLifecycleNormalization(authFetch(`/reservations/${reservationId}`)),

  /**
   * Create new reservation
   */
  create: (reservationData) =>
    withLifecycleNormalization(
      authFetch("/reservations", {
      method: "POST",
      body: JSON.stringify(reservationData),
      }),
    ),

  /**
   * Update reservation (admin only)
   */
  update: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}`, {
      method: "PUT",
      body: JSON.stringify(data),
      }),
    ),

  /**
   * Update reservation (tenant only)
   */
  updateByUser: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/user`, {
      method: "PUT",
      body: JSON.stringify(data),
      }),
    ),

  /**
   * Update visit preference & scheduling (tenant only)
   */
  updateVisitPreference: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/visit`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    ),

  /**
   * Save tenant application draft (tenant only)
   */
  saveApplicationDraft: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/application/draft`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    ),

  /**
   * Submit tenant application (tenant only)
   */
  submitApplication: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/application/submit`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    ),

  // uploadPaymentProof — REMOVED: manual proof upload decommissioned.

  /**
   * Validate applicant valid ID using backend OCR/manual review fallback.
   */
  validateIdDocument: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/id-validation`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    ),

  precheckDocument: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/document-precheck`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    ),

  manageVisit: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/visit-management`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    ),

  cancelByUser: (reservationId, reason = "") =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/cancel`, {
        method: "PATCH",
        body: JSON.stringify({ reason }),
      }),
    ),

  requestCancellation: (reservationId, reason = "") =>
    authFetch(`/reservations/${reservationId}/cancel-request`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  withdrawCancellationRequest: (reservationId) =>
    authFetch(`/reservations/${reservationId}/cancel-request/withdraw`, {
      method: "POST",
    }),

  approveCancellationRequest: (reservationId, note = "") =>
    authFetch(`/reservations/${reservationId}/cancel-request/approve`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),

  rejectCancellationRequest: (reservationId, note = "") =>
    authFetch(`/reservations/${reservationId}/cancel-request/reject`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),

  requestModification: (reservationId, data = {}) =>
    authFetch(`/reservations/${reservationId}/modification-request`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  approveModificationRequest: (reservationId, note = "") =>
    authFetch(`/reservations/${reservationId}/modification-request/approve`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),

  rejectModificationRequest: (reservationId, note = "") =>
    authFetch(`/reservations/${reservationId}/modification-request/reject`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),

  /**
   * Cancel reservation — legacy alias kept for backward compatibility.
   * New code should use cancelByUser instead.
   * @deprecated Use cancelByUser
   */
  cancel: (reservationId) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/cancel`, {
        method: "PATCH",
        body: JSON.stringify({}),
      }),
    ),

  /**
   * Keep-alive heartbeat for pending reservations.
   * Touches updatedAt to reset the rolling 30-minute inactivity timer.
   */
  sendHeartbeat: (reservationId) =>
    authFetch(`/reservations/${reservationId}/heartbeat`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  /**
   * Archive reservation (soft delete)
   */
  archive: (reservationId, data = {}) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/archive`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    ),

  /**
   * Restore archived reservation
   */
  restore: (reservationId) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/restore`, {
        method: "PATCH",
      }),
    ),

  /**
   * Delete reservation (soft delete by default, hard delete for owner on archived records)
   */
  delete: (reservationId, options = {}) => {
    const isHardDelete = Boolean(options.hardDelete);
    return authFetch(`/reservations/${reservationId}${isHardDelete ? "?hardDelete=true" : ""}`, {
      method: "DELETE",
    });
  },

  /**
   * Extend reservation move-in date (admin only)
   */
  extend: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/extend`, {
      method: "PUT",
      body: JSON.stringify(data),
      }),
    ),

  /**
   * Release reservation slot (admin only)
   */
  release: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/release`, {
      method: "PUT",
      body: JSON.stringify(data),
      }),
    ),

  /**
   * Renew a tenant's contract / extend lease (admin only)
   */
  renew: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/renew`, {
      method: "PUT",
      body: JSON.stringify(data),
      }),
    ),

  /**
   * Move out a tenant (admin only)
   * Uses the legacy /checkout route for compatibility.
   */
  moveOut: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/checkout`, {
      method: "PUT",
      body: JSON.stringify(data),
      }),
    ),

  // Legacy alias for the move-out route.
  checkout: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/checkout`, {
      method: "PUT",
      body: JSON.stringify(data),
      }),
    ),

  /**
   * Transfer tenant to a different room/bed (admin only)
   */
  transfer: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/transfer`, {
      method: "PUT",
      body: JSON.stringify(data),
      }),
    ),

  /**
   * R2 — Prepare (or reuse) the Room Transfer Addendum Draft + PDF for a
   * planned transfer, so Admin can preview / download it before Confirm.
   * Mutates nothing physical; does NOT activate the Addendum. Idempotent.
   * @param {string} reservationId
   * @param {{ targetRoomId: string, targetBedId?: string, effectiveTransferDate?: string }} data
   */
  prepareRoomTransferAddendum: (reservationId, data) =>
    authFetch(`/reservations/${reservationId}/transfer/prepare-addendum`, {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),

  /**
   * R4 — Discard a PRE-CUTOVER Room Transfer Addendum Draft. NOT a reversal of
   * a completed transfer. Leaves the current lease / Stay / room / occupancy /
   * utilities unchanged.
   * @param {string} reservationId
   */
  discardRoomTransferAddendum: (reservationId) =>
    authFetch(`/reservations/${reservationId}/transfer/discard-addendum`, {
      method: "POST",
    }),

  /**
   * Cancel a NOT-yet-executed scheduled room transfer. Automatic only when no
   * money was received; any payment -> action_required (Administration Office
   * settlement). Returns { outcome, reason, scheduledRoomTransfer }.
   * @param {string} reservationId
   */
  cancelScheduledRoomTransfer: (reservationId) =>
    authFetch(`/reservations/${reservationId}/scheduled-transfer/cancel`, {
      method: "POST",
    }),

  /**
   * Admin retry for an `action_required` scheduled room transfer. Delegates to
   * the Complete Transfer flow. Meter readings may be re-supplied.
   * Returns { outcome, reason, scheduledRoomTransfer }.
   * @param {string} reservationId
   * @param {{ sourceRoomMeterReading?, targetRoomMeterReading?, notes? }} [data]
   */
  retryScheduledRoomTransfer: (reservationId, data = {}) =>
    authFetch(`/reservations/${reservationId}/scheduled-transfer/retry`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /**
   * Reschedule an OPEN scheduled room transfer to a new date + time on the SAME
   * destination. Revalidates availability + (same-day) office hours.
   * Returns { message, scheduledRoomTransfer }.
   * @param {string} reservationId
   * @param {{ effectiveTransferDate, effectiveTransferTime?, effectiveTransferTimeMinutes?, reason? }} data
   */
  rescheduleRoomTransfer: (reservationId, data) =>
    authFetch(`/reservations/${reservationId}/scheduled-transfer/reschedule`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  /**
   * Admin-driven room transfer completion on/after the effective date + time:
   * meter reading -> settlement -> settle -> atomic cutover.
   * 200 { outcome:"executed" } / 202 { outcome:"awaiting_settlement", bill }
   * / 409 { code:"TRANSFER_SETTLEMENT_UNPAID" }.
   * @param {string} reservationId
   * @param {{ sourceRoomMeterReading?, targetRoomMeterReading?, notes?, depositHeldOverride?, depositHeldVerificationConfirmed?, depositVerificationSource?, depositVerificationReason? }} data
   */
  completeRoomTransfer: (reservationId, data = {}) =>
    authFetch(`/reservations/${reservationId}/scheduled-transfer/complete`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /**
   * Get the latest electricity meter reading for a room.
   * Used by the Transfer modal to pre-fill baseline readings.
   */
  getRoomMeterBaseline: (roomId) =>
    authFetch(`/reservations/room-meter-baseline/${roomId}`),

  /**
   * Read-only preview of the canonical room-type + duration pricing a
   * renewal offer would use (admin only) — same resolver createRenewalOffer
   * itself uses, so the preview and the created offer can never disagree.
   */
  previewRenewalPricing: (reservationId, months) =>
    authFetch(`/reservations/${reservationId}/renewal-offer/preview?months=${encodeURIComponent(months)}`),

  /**
   * Create lease renewal offer (admin only)
   */
  createRenewalOffer: (reservationId, data) =>
    authFetch(`/reservations/${reservationId}/renewal-offer`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /**
   * Cancel lease renewal offer (admin only)
   */
  cancelRenewalOffer: (reservationId, offerId) =>
    authFetch(`/reservations/${reservationId}/renewal-offer/${offerId}/cancel`, {
      method: "POST",
    }),

  /**
   * Respond to lease renewal offer (tenant or admin)
   */
  respondToRenewalOffer: (reservationId, offerId, action, tenantResponseReason = "") =>
    authFetch(`/reservations/${reservationId}/renewal-offer/${offerId}/respond`, {
      method: "POST",
      body: JSON.stringify({ action, tenantResponseReason }),
    }),

  /**
   * Get current tenant's active renewal offers
   */
  getMyRenewalOffers: () =>
    authFetch("/reservations/my-renewal-offers"),

  // SCENARIO 1 API METHODS
  cancelMoveOut: (reservationId) =>
    authFetch(`/reservations/${reservationId}/cancel-moveout`, { method: "POST" }),

  earlyTermination: (reservationId, data = {}) =>
    authFetch(`/reservations/${reservationId}/early-termination`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  swapRooms: (reservationAId, reservationBId) =>
    authFetch("/reservations/room-swap", {
      method: "POST",
      body: JSON.stringify({ reservationAId, reservationBId }),
    }),

  triggerAbandonment: (reservationId, data = {}) =>
    authFetch(`/reservations/${reservationId}/abandonment`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  checkExtensionConflict: (reservationId, requestedEndDate) =>
    authFetch(`/reservations/${reservationId}/check-extension?requestedEndDate=${encodeURIComponent(requestedEndDate)}`),

  // SCENARIO 3: Deposit Reconciliation & Payouts
  processDepositRefund: (reservationId, data = {}) =>
    authFetch(`/reservations/${reservationId}/deposit-refund`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  /**
   * List reservation payment ledger records for financial review.
   */
  listPaymentProofReviews: async (status = "") => {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const res = await authFetch(`/payments/admin/ledger${query}`);
    const list = Array.isArray(res?.data)
      ? res.data
      : Array.isArray(res?.payments)
      ? res.payments
      : Array.isArray(res)
      ? res
      : [];
    return {
      success: true,
      payments: list,
      data: list,
    };
  },

  /**
   * Submit manual payment proof (legacy compatibility fallback).
   */
  submitPaymentProof: (reservationId, data) =>
    authFetch(`/reservations/${reservationId}/payment-proof`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /**
   * Approve payment proof or confirm payment ledger item.
   */
  approvePaymentProof: (reservationId, paymentId) =>
    authFetch(
      `/reservations/${reservationId}/payment-proof/${paymentId}/approve`,
      { method: "POST", body: JSON.stringify({}) },
    ),

  /**
   * Reject payment proof or mark rejected in ledger.
   */
  rejectPaymentProof: (reservationId, paymentId, data = {}) =>
    authFetch(
      `/reservations/${reservationId}/payment-proof/${paymentId}/reject`,
      { method: "POST", body: JSON.stringify(data) },
    ),

  // ── Checkout Lock (P2-01) ──
  acquireBedLock: (roomId, bedId) =>
    authFetch("/reservations/checkout-lock", {
      method: "POST",
      body: JSON.stringify({ roomId, bedId }),
    }),

  releaseBedLock: (lockId) =>
    authFetch(`/reservations/checkout-lock/${lockId}`, { method: "DELETE" }),

  approveExpiredOccupancyMonthToMonth: (stayId) =>
    authFetch(`/reservations/expired-occupancy/${stayId}/approve-month-to-month`, {
      method: "POST",
    }),
};
