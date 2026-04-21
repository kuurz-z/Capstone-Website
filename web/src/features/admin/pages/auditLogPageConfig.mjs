export const AUDIT_TRAIL_TAB = "audit-trail";
export const SECURITY_SIGNALS_TAB = "security-signals";

export const AUDIT_TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "login", label: "Login" },
  { value: "registration", label: "Registration" },
  { value: "data_modification", label: "Data Modification" },
  { value: "data_deletion", label: "Data Deletion" },
  { value: "error", label: "Error" },
];

export const AUDIT_SEVERITY_OPTIONS = [
  { value: "all", label: "All Severity" },
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export const AUDIT_ROLE_OPTIONS = [
  { value: "all", label: "All Roles" },
  { value: "applicant", label: "Applicant" },
  { value: "tenant", label: "Tenant" },
  { value: "branch_admin", label: "Branch Admin" },
  { value: "owner", label: "Owner" },
];

export const AUDIT_BRANCH_OPTIONS = [
  { value: "all", label: "All Branches" },
  { value: "gil-puyat", label: "Gil Puyat" },
  { value: "guadalupe", label: "Guadalupe" },
  { value: "general", label: "General / System" },
];

const padDatePart = (value) => String(value).padStart(2, "0");

export function formatDateInputValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-");
}

export function getRelativeDateInputValue(daysAgo, now = new Date()) {
  const next = new Date(now);
  next.setDate(next.getDate() - daysAgo);
  return formatDateInputValue(next);
}

export function createDefaultAuditFilters(now = new Date()) {
  return {
    type: "all",
    severity: "all",
    branch: "all",
    role: "all",
    user: "",
    search: "",
    startDate: getRelativeDateInputValue(7, now),
    endDate: formatDateInputValue(now),
  };
}

export function getAllowedAuditTabs(isOwner) {
  return isOwner
    ? [AUDIT_TRAIL_TAB, SECURITY_SIGNALS_TAB]
    : [AUDIT_TRAIL_TAB];
}

export function normalizeAuditTab(requestedTab, isOwner) {
  const allowedTabs = getAllowedAuditTabs(isOwner);
  return allowedTabs.includes(requestedTab) ? requestedTab : allowedTabs[0];
}

export function formatAuditLabel(value, fallback = "Unknown") {
  if (!value) return fallback;

  return String(value)
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatAuditBranch(branch) {
  if (!branch || branch === "general") {
    return "General / System";
  }

  return formatAuditLabel(branch.replaceAll("-", "_"));
}

export function mapAuditSeverityToBadgeStatus(severity) {
  const statusMap = {
    info: "new",
    warning: "pending",
    high: "overdue",
    critical: "banned",
  };

  return statusMap[severity] || "archived";
}

const toDateBoundaryIso = (value, endOfDay = false) => {
  if (!value) return undefined;

  const [year, month, day] = String(value)
    .split("-")
    .map((part) => Number.parseInt(part, 10));

  if (!year || !month || !day) {
    return undefined;
  }

  const parsed = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0,
    ),
  );

  return parsed.toISOString();
};

export function buildAuditLogQueryParams(
  filters,
  { currentPage = 1, itemsPerPage = 10 } = {},
) {
  const params = {
    limit: String(itemsPerPage),
    offset: String((Math.max(currentPage, 1) - 1) * itemsPerPage),
  };

  if (filters?.type && filters.type !== "all") params.type = filters.type;
  if (filters?.severity && filters.severity !== "all") {
    params.severity = filters.severity;
  }
  if (filters?.branch && filters.branch !== "all") params.branch = filters.branch;
  if (filters?.role && filters.role !== "all") params.role = filters.role;
  if (filters?.user?.trim()) params.user = filters.user.trim();
  if (filters?.search?.trim()) params.search = filters.search.trim();

  const startDate = toDateBoundaryIso(filters?.startDate, false);
  const endDate = toDateBoundaryIso(filters?.endDate, true);

  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;

  return params;
}

export function buildAuditExportFilters(filters) {
  const params = buildAuditLogQueryParams(filters, {
    currentPage: 1,
    itemsPerPage: 10,
  });

  delete params.limit;
  delete params.offset;

  return params;
}
