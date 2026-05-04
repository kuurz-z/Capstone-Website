import assert from "node:assert/strict";

import {
  buildBranchScopedHref,
  normalizeBranchFilterValue,
  syncBranchSearchParam,
} from "./branchFilterQuery.mjs";

assert.equal(
  normalizeBranchFilterValue({ requestedBranch: "gil-puyat" }),
  "gil-puyat",
);

assert.equal(
  normalizeBranchFilterValue({
    requestedBranch: "invalid-branch",
    fallbackBranch: "guadalupe",
  }),
  "guadalupe",
);

assert.equal(
  normalizeBranchFilterValue({
    requestedBranch: null,
    allValue: "",
  }),
  "",
);

const ownerSearch = syncBranchSearchParam(
  new URLSearchParams("tab=occupancy"),
  "guadalupe",
);
assert.equal(ownerSearch.get("tab"), "occupancy");
assert.equal(ownerSearch.get("branch"), "guadalupe");

const clearedSearch = syncBranchSearchParam(
  new URLSearchParams("tab=rooms&branch=gil-puyat"),
  "all",
);
assert.equal(clearedSearch.get("tab"), "rooms");
assert.equal(clearedSearch.has("branch"), false);

const disabledSearch = syncBranchSearchParam(
  new URLSearchParams("branch=gil-puyat&tab=forecast"),
  "gil-puyat",
  { enabled: false },
);
assert.equal(disabledSearch.get("tab"), "forecast");
assert.equal(disabledSearch.has("branch"), false);

assert.equal(
  buildBranchScopedHref("/admin/room-availability", "gil-puyat", {
    tab: "occupancy",
  }),
  "/admin/room-availability?tab=occupancy&branch=gil-puyat",
);

assert.equal(
  buildBranchScopedHref("/admin/inquiries", null),
  "/admin/inquiries",
);

console.log("branchFilterQuery tests passed");
