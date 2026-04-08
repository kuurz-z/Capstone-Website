export const ROOM_BRANCHES = Object.freeze(["gil-puyat", "guadalupe"]);

export const INQUIRY_BRANCHES = Object.freeze([
  ...ROOM_BRANCHES,
  "general",
]);

export const ROOM_BRANCH_LABELS = Object.freeze({
  "gil-puyat": "Gil Puyat",
  guadalupe: "Guadalupe",
});

export const isValidRoomBranch = (branch) => ROOM_BRANCHES.includes(branch);

export const isValidInquiryBranch = (branch) =>
  INQUIRY_BRANCHES.includes(branch);
