/**
 * TanStack Query hooks for the Digital Twin feature.
 */

import { useQuery } from "@tanstack/react-query";
import { digitalTwinApi } from "../../api/digitalTwinApi.js";
import { queryKeys } from "../../lib/queryKeys.js";

/** Fetch branch snapshot (rooms + KPIs + health scores) */
export function useDigitalTwinSnapshot(branch) {
  return useQuery({
    queryKey: queryKeys.digitalTwin.snapshot(branch),
    queryFn: () => digitalTwinApi.getSnapshot(branch),
    refetchOnWindowFocus: false,
  });
}

/** Fetch deep-dive detail for a single room */
export function useDigitalTwinRoomDetail(roomId) {
  return useQuery({
    queryKey: queryKeys.digitalTwin.roomDetail(roomId),
    queryFn: () => digitalTwinApi.getRoomDetail(roomId),
    enabled: !!roomId,
  });
}
