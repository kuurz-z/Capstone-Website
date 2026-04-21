const PAGE_META = {
  "/admin/dashboard": {
    title: "Dashboard",
    description:
      "Monitor branch activity, queue pressure, and urgent follow-up from one operations view.",
  },
  "/admin/reservations": {
    title: "Reservations",
    description:
      "Review applications, confirm documents, and move accepted residents toward assignment.",
  },
  "/admin/tenants": {
    title: "Tenants",
    description:
      "Handle renewals, transfers, move-out actions, and current-stay visibility in one workspace.",
  },
  "/admin/users": {
    title: "Accounts",
    description:
      "Manage access, verify account states, and resolve sign-in or lifecycle issues.",
  },
  "/admin/room-availability": {
    title: "Room Management",
    description:
      "Track available capacity, assignments, and turnover across rooms without leaving operations.",
  },
  "/admin/audit-logs": {
    title: "Audit & Security",
    description:
      "Review audit events, trace administrative changes, and inspect security-relevant activity.",
  },
  "/admin/billing": {
    title: "Billing",
    description:
      "Generate statements, review balances, and follow payment progress without leaving the admin workspace.",
  },
  "/admin/analytics": {
    title: "Analytics",
    description:
      "Scan occupancy, billing, operations, and owner signals from one chart-first summary page.",
  },
  "/admin/analytics/details": {
    title: "Analytics Details",
    description:
      "Review detailed analytics tabs, exports, and deeper operational breakdowns.",
  },
  "/admin/maintenance": {
    title: "Maintenance",
    description:
      "Review tenant repair requests, assign work, and keep the tenant-visible admin response up to date.",
  },
  "/admin/announcements": {
    title: "Announcements",
    description:
      "Publish notices with clearer targeting and follow-up visibility.",
  },
  "/admin/branches": {
    title: "Branches",
    description:
      "Manage branch-level details that affect room inventory and resident operations.",
  },
  "/admin/roles": {
    title: "Roles & Permissions",
    description:
      "Adjust branch admin capabilities carefully so access stays predictable and auditable.",
  },
  "/admin/settings": {
    title: "Policies & Settings",
    description:
      "Control platform policies, defaults, safeguards, and shared operational behavior.",
  },
};

const ANALYTICS_DETAILS_META = {
  occupancy: {
    title: "Analytics Details - Occupancy",
    description:
      "Track room utilization, capacity shifts, and current availability from the detailed analytics workspace.",
  },
  billing: {
    title: "Analytics Details - Billing",
    description:
      "Monitor collections, overdue balances, and branch billing performance without leaving detailed analytics.",
  },
  operations: {
    title: "Analytics Details - Operations",
    description:
      "Inspect reservation flow, inquiry timing, and maintenance workload in the detailed analytics workspace.",
  },
  financials: {
    title: "Analytics Details - Financials",
    description:
      "Review owner financial performance, overdue exposure, and collection trends across branches.",
  },
  monitoring: {
    title: "Analytics Details - System Monitoring",
    description:
      "Inspect owner-level audit activity, security signals, and operational anomalies from detailed analytics.",
  },
};

export function getPageMeta(pathname, search = "") {
  if (pathname === "/admin/analytics/details") {
    const params = new URLSearchParams(search);
    const tab = params.get("tab") || "occupancy";
    return ANALYTICS_DETAILS_META[tab] || ANALYTICS_DETAILS_META.occupancy;
  }

  if (pathname === "/admin/room-availability") {
    const params = new URLSearchParams(search);
    const tab = params.get("tab") || "rooms";

    if (tab === "occupancy") {
      return {
        title: "Room Occupancy",
        description:
          "See who is assigned where and catch room-level conflicts early.",
      };
    }

    if (tab === "forecast") {
      return {
        title: "Vacancy Forecast",
        description:
          "Plan around expected openings, pending reservations, and room turnover.",
      };
    }
  }

  return (
    PAGE_META[pathname] || {
      title: "Admin",
      description:
        "Manage daily operations, resident workflows, and branch performance.",
    }
  );
}

export { PAGE_META, ANALYTICS_DETAILS_META };
