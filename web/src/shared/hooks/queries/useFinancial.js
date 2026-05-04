import { useQuery } from "@tanstack/react-query";
import { financialApi } from "../../api/financialApi";
import { queryKeys } from "../../lib/queryKeys";

export function useFinancialOverview(branch = "all") {
  return useQuery({
    queryKey: queryKeys.financial.overview(branch),
    queryFn: () => financialApi.getOverview(branch),
  });
}
