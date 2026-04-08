import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "../../api/apiClient";
import { queryKeys } from "../../lib/queryKeys";

// ── Tenant Hooks ──

/** Get tenant's own bills */
export function useMyBills() {
  return useQuery({
    queryKey: queryKeys.billing.myBills,
    queryFn: () => billingApi.getMyBills(),
  });
}

/** Get current month billing */
export function useCurrentBilling() {
  return useQuery({
    queryKey: queryKeys.billing.current,
    queryFn: () => billingApi.getCurrentBilling(),
  });
}


// ── Admin Hooks ──

/** Get billing statistics */
export function useBillingStats() {
  return useQuery({
    queryKey: queryKeys.billing.stats,
    queryFn: () => billingApi.getStats(),
  });
}

/** Get bills by branch */
export function useBillsByBranch(params) {
  return useQuery({
    queryKey: queryKeys.billing.byBranch(params),
    queryFn: () => billingApi.getBillsByBranch(params),
  });
}

/** Get rooms with tenants for bill generation */
export function useRoomsWithTenants(branch) {
  return useQuery({
    queryKey: queryKeys.billing.roomsWithTenants(branch),
    queryFn: () => billingApi.getRoomsWithTenants(branch),
  });
}

/** Get billing report */
export function useBillingReport() {
  return useQuery({
    queryKey: queryKeys.billing.report,
    queryFn: () => billingApi.getBillingReport(),
  });
}

/** Mark bill as paid */
export function useMarkAsPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ billId, amount, note }) =>
      billingApi.markAsPaid(billId, amount, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["billing"] }),
  });
}

/** Apply penalties to overdue bills */
export function useApplyPenalties() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => billingApi.applyPenalties(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["billing"] }),
  });
}
