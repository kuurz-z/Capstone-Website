export const REPORT_TABS = [
  { key: "occupancy", label: "Occupancy" },
  { key: "billing", label: "Billing" },
  { key: "operations", label: "Operations" },
];

export const REPORT_ROUTES = {
  occupancy: "/admin/reports/occupancy",
  billing: "/admin/reports/billing",
  operations: "/admin/reports/operations",
};

export const formatPeso = (value) =>
  `PHP ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

export const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const formatBranch = (value) =>
  String(value || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "-";

export const buildRangeLabel = (range) => {
  const labels = {
    "30d": "Last 30 days",
    "60d": "Last 60 days",
    "90d": "Last 90 days",
    "3m": "Last 3 months",
    "6m": "Last 6 months",
    "12m": "Last 12 months",
  };
  return labels[range] || range;
};
