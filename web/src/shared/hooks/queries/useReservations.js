import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { reservationApi } from "../../api/apiClient";
import { queryKeys } from "../../lib/queryKeys";

const invalidateReservationSideEffects = (qc) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: ["reservations"] }),
    qc.invalidateQueries({ queryKey: ["rooms"] }),
    qc.invalidateQueries({ queryKey: ["users", "currentUser"] }),
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
    onSuccess: () => invalidateReservationSideEffects(qc),
  });
}

/** Update a reservation (tenant) */
export function useUpdateReservationByUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reservationId, data }) =>
      reservationApi.updateByUser(reservationId, data),
    onSuccess: () => invalidateReservationSideEffects(qc),
  });
}

/** Cancel a reservation */
export function useCancelReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reservationId) => reservationApi.cancel(reservationId),
    onSuccess: () => invalidateReservationSideEffects(qc),
  });
}

/** Extend reservation move-in date (admin) */
export function useExtendReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reservationId, data }) =>
      reservationApi.extend(reservationId, data),
    onSuccess: () => invalidateReservationSideEffects(qc),
  });
}

/** Release reservation slot (admin) */
export function useReleaseReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reservationId, data }) =>
      reservationApi.release(reservationId, data),
    onSuccess: () => invalidateReservationSideEffects(qc),
  });
}

/** Archive reservation (admin) */
export function useArchiveReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reservationId, data }) =>
      reservationApi.archive(reservationId, data),
    onSuccess: () => invalidateReservationSideEffects(qc),
  });
}
