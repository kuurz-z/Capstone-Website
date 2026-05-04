import { ROOM_BRANCHES } from "./branches.js";

export const ANNOUNCEMENT_CATEGORIES = Object.freeze([
  "general",
  "reminder",
  "maintenance",
  "policy",
  "event",
  "alert",
]);

export const ANNOUNCEMENT_VISIBILITY = Object.freeze([
  "public",
  "tenants-only",
  "staff-only",
]);

export const ANNOUNCEMENT_TARGET_BRANCHES = Object.freeze([
  "both",
  ...ROOM_BRANCHES,
]);
