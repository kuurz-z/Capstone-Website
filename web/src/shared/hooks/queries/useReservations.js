import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { reservationApi } from "../../api/apiClient";
import { queryKeys } from "../../lib/queryKeys";

/** Fetch all reservations — always refetch on mount so profile shows fresh data */
export function useReservations() {
  return useQuery({
    queryKey: queryKeys.reservations.all,
    queryFn: () => reservationApi.getAll(),
    staleTime: 0,
    refetchOnMount: "always",
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reservations"] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
    },
  });
}

/** Update a reservation (admin) */
export function useUpdateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reservationId, data }) =>
      reservationApi.update(reservationId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reservations"] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
    },
  });
}

/** Update a reservation (tenant) */
export function useUpdateReservationByUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reservationId, data }) =>
      reservationApi.updateByUser(reservationId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reservations"] }),
  });
}

/** Cancel a reservation */
export function useCancelReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reservationId) => reservationApi.cancel(reservationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reservations"] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
    },
  });
}

/** Extend reservation move-in date (admin) */
export function useExtendReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reservationId, data }) =>
      reservationApi.extend(reservationId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reservations"] }),
  });
}

/** Release reservation slot (admin) */
export function useReleaseReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reservationId, data }) =>
      reservationApi.release(reservationId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reservations"] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
    },
  });
}

/** Archive reservation (admin) */
export function useArchiveReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reservationId, data }) =>
      reservationApi.archive(reservationId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reservations"] }),
  });
}
