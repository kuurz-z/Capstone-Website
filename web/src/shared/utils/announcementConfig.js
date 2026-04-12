import { BRANCH_DISPLAY_NAMES } from "./constants";

export const ANNOUNCEMENT_CATEGORIES = Object.freeze([
  "general",
  "reminder",
  "maintenance",
  "policy",
  "event",
  "alert",
]);

export const ANNOUNCEMENT_CATEGORY_META = Object.freeze({
  general: { label: "General", tone: "neutral" },
  reminder: { label: "Reminder", tone: "info" },
  maintenance: { label: "Maintenance", tone: "warning" },
  policy: { label: "Policy", tone: "accent" },
  event: { label: "Event", tone: "success" },
  alert: { label: "Alert", tone: "danger" },
});

export const ANNOUNCEMENT_CATEGORY_OPTIONS = ANNOUNCEMENT_CATEGORIES.map(
  (category) => ({
    value: category,
    label: ANNOUNCEMENT_CATEGORY_META[category].label,
  }),
);

export const formatAnnouncementCategory = (category) => {
  if (!category) return "General";
  if (ANNOUNCEMENT_CATEGORY_META[category]) {
    return ANNOUNCEMENT_CATEGORY_META[category].label;
  }

  return String(category)
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join(" ");
};

export const getAnnouncementCategoryMeta = (category) => ({
  label: formatAnnouncementCategory(category),
  tone: ANNOUNCEMENT_CATEGORY_META[category]?.tone || "neutral",
});

export const formatAnnouncementBranch = (branch) => {
  if (branch === "both") return "All Branches";
  return BRANCH_DISPLAY_NAMES[branch] || branch || "Unknown Branch";
};
