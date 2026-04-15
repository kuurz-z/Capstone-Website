const PAGE_META = {
  "/admin/dashboard": {
    title: "Dashboard",
    description: "Monitor branch activity, queue pressure, and urgent follow-up from one operations view.",
  },
  "/admin/reservations": {
    title: "Reservations",
    description: "Review applications, confirm documents, and move accepted residents toward assignment.",
  },
  "/admin/tenants": {
    title: "Tenants",
    description: "Handle renewals, transfers, move-out actions, and current-stay visibility in one workspace.",
  },
  "/admin/users": {
    title: "Accounts",
    description: "Manage access, verify account states, and resolve sign-in or lifecycle issues.",
  },
  "/admin/room-availability": {
    title: "Room Management",
    description: "Track available capacity, assignments, and turnover across rooms without leaving operations.",
  },
  "/admin/audit-logs": {
    title: "Activity Log",
    description: "Review system activity, administrative changes, and user-facing events.",
  },
  "/admin/billing": {
    title: "Billing",
    description: "Generate statements, review balances, and follow payment progress without leaving the admin workspace.",
  },
  "/admin/analytics": {
    title: "Analytics",
    description: "Review branch KPIs, occupancy trends, billing performance, and operating signals in one workspace.",
  },
  "/admin/maintenance": {
    title: "Maintenance",
    description: "Review tenant repair requests, assign work, and keep the tenant-visible admin response up to date.",
  },
  "/admin/announcements": {
    title: "Announcements",
    description: "Publish notices with clearer targeting and follow-up visibility.",
  },
  "/admin/branches": {
    title: "Branches",
    description: "Manage branch-level details that affect room inventory and resident operations.",
  },
  "/admin/roles": {
    title: "Permissions",
    description: "Adjust role capabilities carefully so admin actions remain predictable and auditable.",
  },
  "/admin/settings": {
    title: "Settings",
    description: "Control platform defaults, safeguards, and shared operational behavior.",
  },
};

const ANALYTICS_META = {
  overview: {
    title: "Analytics",
    description: "Review branch KPIs, occupancy trends, billing performance, and operating signals in one workspace.",
  },
  occupancy: {
    title: "Analytics · Occupancy",
    description: "Track room utilization, capacity shifts, and current availability from the analytics workspace.",
  },
  billing: {
    title: "Analytics · Billing",
    description: "Monitor collections, overdue balances, and branch billing performance without leaving analytics.",
  },
  operations: {
    title: "Analytics · Operations",
    description: "Inspect reservation flow, inquiry timing, and maintenance workload in one operations view.",
  },
  financials: {
    title: "Analytics · Financials",
    description: "Review owner financial performance, overdue exposure, and collection trends across branches.",
  },
  monitoring: {
    title: "Analytics · System Monitoring",
    description: "Inspect owner-level audit activity, security signals, and operational anomalies from analytics.",
  },
};

export function getPageMeta(pathname, search = "") {
  if (pathname === "/admin/analytics") {
    const params = new URLSearchParams(search);
    const tab = params.get("tab") || "overview";
    return ANALYTICS_META[tab] || ANALYTICS_META.overview;
  }

  if (pathname === "/admin/room-availability") {
    const params = new URLSearchParams(search);
    const tab = params.get("tab") || "rooms";

    if (tab === "occupancy") {
      return {
        title: "Room Occupancy",
        description: "See who is assigned where and catch room-level conflicts early.",
      };
    }

    if (tab === "forecast") {
      return {
        title: "Vacancy Forecast",
        description: "Plan around expected openings, pending reservations, and room turnover.",
      };
    }
  }

  return (
    PAGE_META[pathname] || {
      title: "Admin",
      description: "Manage daily operations, resident workflows, and branch performance.",
    }
  );
}

export { PAGE_META, ANALYTICS_META };
