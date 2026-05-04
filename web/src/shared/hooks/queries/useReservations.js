import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { reservationApi } from "../../api/apiClient";
import { queryKeys } from "../../lib/queryKeys";

/**
 * Targeted invalidation after a reservation mutation.
 * Invalidates the list views and occupancy data, but NOT unrelated domains.
 * Pass reservationId to also bust the specific detail cache.
 */
const invalidateReservationSideEffects = (qc, reservationId = null) =>
  Promise.all([
    // All list/workspace variants under "reservations"
    qc.invalidateQueries({ queryKey: ["reservations", "list"] }),
    qc.invalidateQueries({ queryKey: ["reservations", "currentResidents"] }),
    qc.invalidateQueries({ queryKey: ["reservations", "tenantWorkspace"] }),
    // Room occupancy changes on bed assignment/release
    qc.invalidateQueries({ queryKey: ["rooms", "branchOccupancy"] }),
    qc.invalidateQueries({ queryKey: ["rooms", "occupancy"] }),
    // Current user's own reservation/profile state
    qc.invalidateQueries({ queryKey: ["users", "currentUser"] }),
    // Specific detail if known
    ...(reservationId
      ? [qc.invalidateQueries({ queryKey: queryKeys.reservations.detail(reservationId) })]
      : []),
  ]);

/** Fetch all reservations — 30s freshness, mutations trigger instant refresh */
export function useReservations(params = {}) {
  return useQuery({
    queryKey: queryKeys.reservations.all(params),
    queryFn: () => reservationApi.getAll(params),
    staleTime: 30 * 1000,        // data stays fresh 30s — prevents rapid refetches
    refetchOnMount: true,         // refetch if stale, but NOT if fresh
  });
}

/** Fetch current moved-in residents for admin tenants page */
export function useCurrentResidents(params = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.reservations.currentResidents(params),
    queryFn: () => reservationApi.getCurrentResidents(params),
    staleTime: 30 * 1000,
    refetchOnMount: true,
    ...options,
  });
}

/** Fetch tenancy workspace rows for admin tenants page */
export function useTenantWorkspace(params = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.reservations.tenantWorkspace(params),
    queryFn: () => reservationApi.getTenantWorkspace(params),
    staleTime: 30 * 1000,
    refetchOnMount: true,
    ...options,
  });
}

/** Fetch tenancy workspace detail for a single reservation */
export function useTenantWorkspaceDetail(reservationId, options = {}) {
  return useQuery({
    queryKey: queryKeys.reservations.tenantWorkspaceDetail(reservationId),
    queryFn: () => reservationApi.getTenantWorkspaceById(reservationId),
    enabled: !!reservationId,
    ...options,
  });
}

export function useTenantActionContext(reservationId, options = {}) {
  return useQuery({
    queryKey: queryKeys.reservations.tenantActionContext(reservationId),
    queryFn: () => reservationApi.getTenantActionContext(reservationId),
    enabled: !!reservationId,
    ...options,
  });
}

/** Fetch a single reservation by ID */
export function useReservation(reservationId) {
  return useQuery({
    queryKey: queryKeys.reservations.detail(reservationId),
    queryFn: () => reservationApi.getById(reservationId),
    enabled: !!reservationId,
  });
}

/** Create a new reservation */
export function useCreateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => reservationApi.create(data),
    onSuccess: () => invalidateReservationSideEffects(qc),
  });
}

/** Update a reservation (admin) */
export function useUpdateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reservationId, data }) =>
      reservationApi.update(reservationId, data),
    onSuccess: (_data, { reservationId }) =>
      invalidateReservationSideEffects(qc, reservationId),
  });
}

/** Update a reservation (tenant) */
export function useUpdateReservationByUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reservationId, data }) =>
      reservationApi.updateByUser(reservationId, data),
    onSuccess: (_data, { reservationId }) =>
      invalidateReservationSideEffects(qc, reservationId),
  });
}

/** Cancel a reservation */
export function useCancelReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reservationId) => reservationApi.cancel(reservationId),
    onSuccess: (_data, reservationId) =>
      invalidateReservationSideEffects(qc, reservationId),
  });
}

/** Extend reservation move-in date (admin) */
export function useExtendReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reservationId, data }) =>
      reservationApi.extend(reservationId, data),
    onSuccess: (_data, { reservationId }) =>
      invalidateReservationSideEffects(qc, reservationId),
  });
}

/** Release reservation slot (admin) */
export function useReleaseReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reservationId, data }) =>
      reservationApi.release(reservationId, data),
    onSuccess: (_data, { reservationId }) =>
      invalidateReservationSideEffects(qc, reservationId),
  });
}

/** Archive reservation (admin) */
export function useArchiveReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reservationId, data }) =>
      reservationApi.archive(reservationId, data),
    onSuccess: (_data, { reservationId }) =>
      invalidateReservationSideEffects(qc, reservationId),
  });
}
