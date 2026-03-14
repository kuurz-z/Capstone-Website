import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { roomApi } from "../../api/apiClient";
import { queryKeys } from "../../lib/queryKeys";

/** Fetch all rooms with optional filters */
export function useRooms(filters) {
  return useQuery({
    queryKey: queryKeys.rooms.all(filters),
    queryFn: () => roomApi.getAll(filters),
    placeholderData: keepPreviousData,   // keep stale data visible during refetch
    refetchOnWindowFocus: false,          // prevent tab-switch refetches
  });
}

/** Fetch a single room by ID */
export function useRoom(roomId) {
  return useQuery({
    queryKey: queryKeys.rooms.detail(roomId),
    queryFn: () => roomApi.getById(roomId),
    enabled: !!roomId,
  });
}

/** Fetch branch occupancy stats */
export function useBranchOccupancy(branch) {
  return useQuery({
    queryKey: queryKeys.rooms.branchOccupancy(branch),
    queryFn: () => roomApi.getBranchOccupancy(branch),
  });
}

/** Create a new room */
export function useCreateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roomData) => roomApi.create(roomData),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rooms"] }),
  });
}

/** Update an existing room */
export function useUpdateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, data }) => roomApi.update(roomId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rooms"] }),
  });
}

/** Delete a room */
export function useDeleteRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roomId) => roomApi.delete(roomId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rooms"] }),
  });
}
