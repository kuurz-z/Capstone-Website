import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inquiryApi } from "../../api/apiClient";
import { queryKeys } from "../../lib/queryKeys";

/** Fetch all inquiries with optional params */
export function useInquiries(params) {
  return useQuery({
    queryKey: queryKeys.inquiries.all(params),
    queryFn: () => inquiryApi.getAll(params),
  });
}

/** Fetch inquiry statistics */
export function useInquiryStats(options = {}) {
  return useQuery({
    queryKey: queryKeys.inquiries.stats,
    queryFn: () => inquiryApi.getStats(),
    ...options,
  });
}

/** Submit a public inquiry (no auth) */
export function useCreateInquiry() {
  return useMutation({
    mutationFn: (data) => inquiryApi.create(data),
  });
}

/** Update inquiry (admin) */
export function useUpdateInquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ inquiryId, data }) => inquiryApi.update(inquiryId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inquiries"] }),
  });
}

/** Archive inquiry (admin) */
export function useArchiveInquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inquiryId) => inquiryApi.archive(inquiryId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inquiries"] }),
  });
}

/** Respond to inquiry (admin) */
export function useRespondToInquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ inquiryId, response }) =>
      inquiryApi.respond(inquiryId, response),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inquiries"] }),
  });
}
