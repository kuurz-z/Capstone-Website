import { BRANCH_OPTIONS } from "./constants.js";

export const ROOM_BRANCH_QUERY_VALUES = Object.freeze(
  BRANCH_OPTIONS.map((option) => option.value),
);

export const isRoomBranchQueryValue = (value) =>
  ROOM_BRANCH_QUERY_VALUES.includes(value);

export function normalizeBranchFilterValue({
  requestedBranch,
  allValue = "all",
  fallbackBranch = null,
} = {}) {
  if (isRoomBranchQueryValue(requestedBranch)) {
    return requestedBranch;
  }

  if (isRoomBranchQueryValue(fallbackBranch)) {
    return fallbackBranch;
  }

  return allValue;
}

export function syncBranchSearchParam(
  searchParams,
  branchValue,
  { enabled = true, allValue = "all" } = {},
) {
  const nextParams = new URLSearchParams(searchParams);

  if (!enabled) {
    nextParams.delete("branch");
    return nextParams;
  }

  if (isRoomBranchQueryValue(branchValue)) {
    nextParams.set("branch", branchValue);
    return nextParams;
  }

  if (
    branchValue === allValue ||
    branchValue === "" ||
    branchValue == null
  ) {
    nextParams.delete("branch");
    return nextParams;
  }

  nextParams.delete("branch");
  return nextParams;
}

export function buildBranchScopedHref(path, branch, extraParams = {}) {
  const params = new URLSearchParams();

  Object.entries(extraParams).forEach(([key, value]) => {
    if (value == null || value === "") return;
    params.set(key, String(value));
  });

  if (isRoomBranchQueryValue(branch)) {
    params.set("branch", branch);
  }

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
