const PAGE_META = {
  "/admin/dashboard": {
    title: "Dashboard",
    description:
      "Monitor branch activity, queue pressure, and urgent follow-up from one operations view.",
  },
  "/admin/reservations": {
    title: "Reservations",
    description:
      "Review applications, confirm documents, and move accepted tenants toward assignment.",
  },
  "/admin/inquiries": {
    title: "Inquiries & Leads",
    description:
      "Review prospective tenant questions, schedule viewings, and respond to incoming leads.",
  },
  "/admin/tenants": {
    title: "Tenants",
    description:
      "Handle renewals, transfers, move-out actions, and current-stay visibility in one workspace.",
  },
  "/admin/users": {
    title: "Accounts & Access",
    description:
      "Manage user accounts, credentials, and configure granular branch admin access permissions.",
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
      "Review occupancy, billing, operations, and owner-level indicators from one consolidated analytics overview.",
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
  "/admin/chat": {
    title: "Support Chat",
    description:
      "View tenant conversations, respond from the dashboard, and keep branch messages moving.",
  },
  "/admin/announcements": {
    title: "Announcements",
    description:
      "Publish notices with clearer targeting and follow-up visibility.",
  },
  "/admin/notifications": {
    title: "Notifications",
    description:
      "Review SLA breaches, billing alerts, maintenance updates, and all system events in one place.",
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
    title: "Settings & Policies",
    description:
      "Control platform policies, defaults, branch overrides, and manage database backup and recovery.",
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

const PAGE_TAB_META = {
  "/admin/analytics": {
    occupancy: "Occupancy",
    billing: "Billing & Revenue",
    revenue: "Billing & Revenue",
    operations: "Operations",
    demographics: "Demographics",
    acquisition: "Lead Acquisition",
    financials: "Financials",
    monitoring: "Monitoring",
    consolidated: "Consolidated",
  },
  "/admin/billing": {
    electricity: "Electricity",
    water: "Water",
    rent: "Rent",
    "reservation-payments": "Reservation Payments",
    "overdue-notices": "Overdue Notices",
    violations: "Violations",
  },
  "/admin/users": {
    roles: "Roles & Permissions",
    permissions: "Roles & Permissions",
    activity: "Activity Logs",
  },
  "/admin/reservations": {
    visits: "Visit Schedules",
    pipeline: "Visit Pipeline",
    schedules: "Visit Schedules",
    availability: "Availability Slots",
    inquiries: "Inquiries",
    conflicts: "Conflict Warnings",
    blackout: "Blackout Dates",
  },
  "/admin/audit-logs": {
    signals: "Security Signals",
    "security-signals": "Security Signals",
    security: "Security Alerts",
    actions: "Admin Actions",
  },
  "/admin/maintenance": {
    analytics: "Analytics",
    branch_reports: "Branch Reports",
    service_providers: "Service Providers",
    history: "Service History",
    schedules: "Schedules",
  },
  "/admin/settings": {
    backups: "Database Backup",
    database: "Database Backup",
  },
};

export function getPageMeta(pathname, search = "") {
  const params = new URLSearchParams(search);

  if (pathname === "/admin/analytics/details") {
    const tab = params.get("tab") || "occupancy";
    const detailMeta = ANALYTICS_DETAILS_META[tab] || ANALYTICS_DETAILS_META.occupancy;
    const tabLabel = PAGE_TAB_META["/admin/analytics"]?.[tab] || "Occupancy";
    return {
      ...detailMeta,
      activeTab: tab,
      breadcrumbs: [
        { label: "Admin", href: "/admin/dashboard" },
        { label: "Analytics", href: "/admin/analytics" },
        { label: `Details - ${tabLabel}` },
      ],
    };
  }

  const baseMeta = PAGE_META[pathname] || {
    title: "Admin",
    description: "Manage daily operations, resident workflows, and branch performance.",
  };

  // Dashboard route
  if (pathname === "/admin/dashboard") {
    return {
      ...baseMeta,
      breadcrumbs: [
        { label: "Admin", href: "/admin/dashboard" },
        { label: "Dashboard" },
      ],
    };
  }

  // Check if a specific sub-tab parameter is requested in the URL and defined in PAGE_TAB_META
  const tabParam = params.get("tab");
  const tabMap = PAGE_TAB_META[pathname];
  if (tabParam && tabMap && tabMap[tabParam]) {
    const activeTabLabel = tabMap[tabParam];
    return {
      ...baseMeta,
      activeTab: tabParam,
      breadcrumbs: [
        { label: "Admin", href: "/admin/dashboard" },
        { label: baseMeta.title, href: pathname },
        { label: activeTabLabel },
      ],
    };
  }

  return {
    ...baseMeta,
    activeTab: tabParam || null,
    breadcrumbs: [
      { label: "Admin", href: "/admin/dashboard" },
      { label: baseMeta.title },
    ],
  };
}

export { PAGE_META, ANALYTICS_DETAILS_META, PAGE_TAB_META };
