import { useQuery } from "@tanstack/react-query";
import { analyticsApi } from "../../api/apiClient";
import { queryKeys } from "../../lib/queryKeys";

const DEFAULT_OPTIONS = {
  retry: 2,
  retryDelay: 1000,
};

export function useOccupancyReport(params) {
  return useQuery({
    queryKey: queryKeys.analytics.occupancyReport(params),
    queryFn: () => analyticsApi.getOccupancyReport(params),
    ...DEFAULT_OPTIONS,
  });
}

export function useBillingReport(params) {
  return useQuery({
    queryKey: queryKeys.analytics.billingReport(params),
    queryFn: () => analyticsApi.getBillingReport(params),
    ...DEFAULT_OPTIONS,
  });
}

export function useOperationsReport(params) {
  return useQuery({
    queryKey: queryKeys.analytics.operationsReport(params),
    queryFn: () => analyticsApi.getOperationsReport(params),
    ...DEFAULT_OPTIONS,
  });
}

export function useOccupancyForecast(params) {
  return useQuery({
    queryKey: queryKeys.analytics.occupancyForecast(params),
    queryFn: () => analyticsApi.getOccupancyForecast(params),
    ...DEFAULT_OPTIONS,
  });
}

export function useFinancialsAnalytics(params) {
  return useQuery({
    queryKey: queryKeys.analytics.financials(params),
    queryFn: () => analyticsApi.getFinancials(params),
    ...DEFAULT_OPTIONS,
  });
}

export function useAuditAnalytics(params) {
  return useQuery({
    queryKey: queryKeys.analytics.audit(params),
    queryFn: () => analyticsApi.getAuditSummary(params),
    ...DEFAULT_OPTIONS,
  });
}

export function useAnalyticsInsights(params, options = {}) {
  return useQuery({
    queryKey: queryKeys.analytics.insights(params),
    queryFn: () => analyticsApi.getInsights(params),
    enabled: Boolean(params?.reportType) && (options.enabled ?? true),
    ...DEFAULT_OPTIONS,
    ...options,
  });
}

export function useAnalyticsInsightsHub(params, options = {}) {
  return useAnalyticsInsights(
    {
      ...params,
      reportType: "hub",
    },
    options,
  );
}
