import { useQuery } from "@tanstack/react-query";
import { analyticsApi } from "../../api/apiClient";
import { queryKeys } from "../../lib/queryKeys";

/**
 * Fetch role-aware dashboard analytics from the unified analytics endpoint.
 */
export function useDashboardData(params = { range: "30d" }) {
  return useQuery({
    queryKey: queryKeys.dashboard.admin(params),
    queryFn: () => analyticsApi.getDashboard(params),
    retry: 2,
    retryDelay: 1000,
  });
}
