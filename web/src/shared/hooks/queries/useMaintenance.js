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
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.maintenance.admin(filters),
    queryFn: () => maintenanceApi.getAdminAll(filters),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,       // reduced from 15 s — less network churn
    refetchOnWindowFocus: false,   // tab-switching no longer triggers a fetch
  });

  const refresh = () =>
    qc.invalidateQueries({ queryKey: queryKeys.maintenance.admin(filters) });

  return { ...query, refresh };
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
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.maintenance.all });
      if (variables?.requestId) {
        qc.invalidateQueries({
          queryKey: queryKeys.maintenance.detail(variables.requestId),
        });
      }
    },
  });
}

/** Cancel a pending maintenance request (tenant) */
export function useCancelMaintenanceRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requestId) => maintenanceApi.cancelRequest(requestId),
    onSuccess: (_data, requestId) => {
      qc.invalidateQueries({ queryKey: queryKeys.maintenance.all });
      if (requestId) {
        qc.invalidateQueries({
          queryKey: queryKeys.maintenance.detail(requestId),
        });
      }
    },
  });
}

/** Reopen a resolved/completed maintenance request (tenant) */
export function useReopenMaintenanceRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, note }) =>
      maintenanceApi.reopenRequest(requestId, note),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.maintenance.all });
      if (variables?.requestId) {
        qc.invalidateQueries({
          queryKey: queryKeys.maintenance.detail(variables.requestId),
        });
      }
    },
  });
}

/** Update maintenance request status/notes/assignment (admin) */
export function useUpdateMaintenanceRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, payload }) =>
      maintenanceApi.updateAdminRequestStatus(requestId, payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.maintenance.all });
      if (variables?.requestId) {
        qc.invalidateQueries({
          queryKey: queryKeys.maintenance.detail(variables.requestId),
        });
      }
    },
  });
}

/** Bulk update maintenance requests (admin) */
export function useBulkMaintenanceUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => maintenanceApi.bulkUpdateAdminRequests(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.maintenance.all });
    },
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
