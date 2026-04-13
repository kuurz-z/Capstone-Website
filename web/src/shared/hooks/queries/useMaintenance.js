import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { maintenanceApi } from "../../api/apiClient";
import { queryKeys } from "../../lib/queryKeys";

/** Fetch current tenant's maintenance requests */
export function useMyMaintenanceRequests(filters) {
  return useQuery({
    queryKey: queryKeys.maintenance.mine(filters),
    queryFn: () => maintenanceApi.getMyRequests(filters),
    placeholderData: keepPreviousData,
  });
}

/** Fetch maintenance requests for admins */
export function useAdminMaintenanceRequests(filters) {
  return useQuery({
    queryKey: queryKeys.maintenance.admin(filters),
    queryFn: () => maintenanceApi.getAdminAll(filters),
    placeholderData: keepPreviousData,
  });
}

/** Fetch single maintenance request */
export function useMaintenanceRequest(requestId) {
  return useQuery({
    queryKey: queryKeys.maintenance.detail(requestId),
    queryFn: () => maintenanceApi.getRequest(requestId),
    enabled: !!requestId,
  });
}

/** Create maintenance request */
export function useCreateMaintenanceRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => maintenanceApi.createRequest(data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.maintenance.all }),
  });
}

/** Update a pending maintenance request (tenant) */
export function useUpdateMyMaintenanceRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, data }) =>
      maintenanceApi.updateMyRequest(requestId, data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.maintenance.all }),
  });
}

/** Cancel a pending maintenance request (tenant) */
export function useCancelMaintenanceRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requestId) => maintenanceApi.cancelRequest(requestId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.maintenance.all }),
  });
}

/** Reopen a resolved/completed maintenance request (tenant) */
export function useReopenMaintenanceRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, note }) =>
      maintenanceApi.reopenRequest(requestId, note),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.maintenance.all }),
  });
}

/** Update maintenance request status/notes/assignment (admin) */
export function useUpdateMaintenanceRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, payload }) =>
      maintenanceApi.updateAdminRequestStatus(requestId, payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.maintenance.all }),
  });
}

/** Backward-compatible alias for previous admin callers */
export const useMaintenanceByBranch = useAdminMaintenanceRequests;

export function useMaintenanceCompletionStats(days) {
  return useQuery({
    queryKey: ["maintenance", "completionStats", days],
    queryFn: () => maintenanceApi.getCompletionStats(days),
  });
}

export function useIssueFrequency(limit, months) {
  return useQuery({
    queryKey: ["maintenance", "issueFrequency", limit, months],
    queryFn: () => maintenanceApi.getIssueFrequency(limit, months),
  });
}
