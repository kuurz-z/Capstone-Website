import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "../../api/settingsApi.js";
import { queryKeys } from "../../lib/queryKeys.js";

export function useBusinessSettings(enabled = true) {
  return useQuery({
    queryKey: queryKeys.settings.business,
    queryFn: () => settingsApi.getBusinessSettings(),
    enabled,
  });
}

export function useUpdateBusinessSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => settingsApi.updateBusinessSettings(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.business });
    },
  });
}

export function useUpdateBranchSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ branch, ...payload }) => settingsApi.updateBranchSettings(branch, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.business });
      qc.invalidateQueries({ queryKey: ["rooms"] });
    },
  });
}
