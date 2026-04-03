import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { utilityApi } from "../../api/utilityApi.js";

// Basic key generators
export const utilityKeys = {
  all: (utilityType) => ["utilities", utilityType],
  rooms: (utilityType, branch) => [...utilityKeys.all(utilityType), "rooms", branch],
  readings: (utilityType, roomId) => [...utilityKeys.all(utilityType), "readings", roomId],
  latestReading: (utilityType, roomId) => [...utilityKeys.all(utilityType), "latestReading", roomId],
  periods: (utilityType, roomId) => [...utilityKeys.all(utilityType), "periods", roomId],
  result: (utilityType, periodId) => [...utilityKeys.all(utilityType), "result", periodId],
  diagnostics: (branch) => ["utilities", "diagnostics", branch],
  myBills: (utilityType) => [...utilityKeys.all(utilityType), "myBills"],
  myBreakdown: (utilityType, periodId) => [...utilityKeys.all(utilityType), "myBreakdown", periodId],
};

export function useUtilityRooms(utilityType, branch) {
  return useQuery({
    queryKey: utilityKeys.rooms(utilityType, branch),
    queryFn: () => utilityApi.getRooms(utilityType, branch),
    enabled: !!utilityType,
  });
}

export function useUtilityReadings(utilityType, roomId) {
  return useQuery({
    queryKey: utilityKeys.readings(utilityType, roomId),
    queryFn: () => utilityApi.getReadings(utilityType, roomId),
    enabled: !!utilityType && !!roomId,
  });
}

export function useUtilityLatestReading(utilityType, roomId) {
  return useQuery({
    queryKey: utilityKeys.latestReading(utilityType, roomId),
    queryFn: () => utilityApi.getLatestReading(utilityType, roomId),
    enabled: !!utilityType && !!roomId,
  });
}

export function useUtilityPeriods(utilityType, roomId) {
  return useQuery({
    queryKey: utilityKeys.periods(utilityType, roomId),
    queryFn: () => utilityApi.getPeriods(utilityType, roomId),
    enabled: !!utilityType && !!roomId,
  });
}

export function useUtilityResult(utilityType, periodId) {
  return useQuery({
    queryKey: utilityKeys.result(utilityType, periodId),
    queryFn: () => utilityApi.getResult(utilityType, periodId),
    enabled: !!utilityType && !!periodId,
  });
}

export function useUtilityDiagnostics(branch) {
  return useQuery({
    queryKey: utilityKeys.diagnostics(branch),
    queryFn: () => utilityApi.getDiagnostics(branch),
  });
}

// Tenant Queries
export function useMyUtilityBills(utilityType) {
  return useQuery({
    queryKey: utilityKeys.myBills(utilityType),
    queryFn: () => utilityApi.getMyUtilityBills?.(utilityType) || Promise.resolve({ bills: [] }),
    enabled: !!utilityType,
  });
}

export function useMyUtilityBreakdown(utilityType, periodId) {
  return useQuery({
    queryKey: utilityKeys.myBreakdown(utilityType, periodId),
    queryFn: () => utilityApi.getResult(utilityType, periodId), // Use getResult for breakdown fallback
    enabled: !!utilityType && !!periodId,
  });
}

// Mutations
export function useRecordUtilityReading(utilityType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => utilityApi.recordReading(utilityType, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: utilityKeys.all(utilityType) });
    },
  });
}

export function useOpenUtilityPeriod(utilityType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => utilityApi.openPeriod(utilityType, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: utilityKeys.all(utilityType) });
    },
  });
}

export function useUpdateUtilityPeriod(utilityType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ periodId, ...data }) => utilityApi.updatePeriod(utilityType, periodId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: utilityKeys.all(utilityType) });
    },
  });
}

export function useCloseUtilityPeriod(utilityType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ periodId, ...data }) => utilityApi.closePeriod(utilityType, periodId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: utilityKeys.all(utilityType) });
    },
  });
}

export function useBatchCloseUtilityPeriods(utilityType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => utilityApi.batchClose(utilityType, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: utilityKeys.all(utilityType) });
    },
  });
}

export function useReviseUtilityResult(utilityType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ periodId, revisionNote }) => utilityApi.reviseResult(utilityType, periodId, revisionNote),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: utilityKeys.all(utilityType) });
    },
  });
}

export function useDeleteUtilityReading(utilityType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (readingId) => utilityApi.deleteReading(utilityType, readingId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: utilityKeys.all(utilityType) });
    },
  });
}

export function useUpdateUtilityReading(utilityType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ readingId, ...data }) => utilityApi.updateReading(utilityType, readingId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: utilityKeys.all(utilityType) });
    },
  });
}

export function useDeleteUtilityPeriod(utilityType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (periodId) => utilityApi.deletePeriod(utilityType, periodId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: utilityKeys.all(utilityType) });
    },
  });
}
