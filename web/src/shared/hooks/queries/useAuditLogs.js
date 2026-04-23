import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { auditApi } from "../../api/apiClient";
import { queryKeys } from "../../lib/queryKeys";

/** Fetch audit logs with filters */
export function useAuditLogs(params, options = {}) {
  return useQuery({
    queryKey: queryKeys.auditLogs.all(params),
    queryFn: () => auditApi.getLogs(params),
    ...options,
  });
}

/** Fetch paginated audit logs with preserved envelope metadata */
export function usePaginatedAuditLogs(params, options = {}) {
  return useQuery({
    queryKey: queryKeys.auditLogs.paged(params),
    queryFn: () => auditApi.getLogsPage(params),
    ...options,
  });
}

/** Fetch audit log statistics */
export function useAuditStats(branch, options = {}) {
  return useQuery({
    queryKey: ["auditLogs", "stats", branch],
    queryFn: () => auditApi.getStats(branch),
    ...options,
  });
}

/** Fetch owner-only failed login monitoring data */
export function useFailedLoginSignals(hours = 24, options = {}) {
  return useQuery({
    queryKey: queryKeys.auditLogs.failedLogins(hours),
    queryFn: () => auditApi.getFailedLogins(hours),
    ...options,
  });
}

/** Export audit logs */
export function useExportAuditLogs() {
  return useMutation({
    mutationFn: (filters) => auditApi.export(filters),
  });
}

/** Cleanup old logs (owner) */
export function useCleanupAuditLogs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (daysToKeep) => auditApi.cleanup(daysToKeep),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auditLogs"] }),
  });
}
