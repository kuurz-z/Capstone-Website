/**
 * =============================================================================
 * QUERY KEY FACTORY — Centralized Cache Key Management
 * =============================================================================
 *
 * All TanStack Query cache keys are defined here to:
 * - Prevent key collisions across features
 * - Enable targeted cache invalidation after mutations
 * - Keep keys consistent across hooks and components
 *
 * Pattern: queryKeys.domain.scope(params?)
 * =============================================================================
 */

export const queryKeys = {
  // ── Auth ──
  auth: {
    profile: ["auth", "profile"],
  },

  // ── Rooms ──
  rooms: {
    all: (filters) => ["rooms", "list", filters || {}],
    detail: (id) => ["rooms", "detail", id],
    occupancy: (id) => ["rooms", "occupancy", id],
    branchOccupancy: (branch) => ["rooms", "branchOccupancy", branch || "all"],
  },

  // ── Reservations ──
  reservations: {
    all: (params) => ["reservations", "list", params || {}],
    detail: (id) => ["reservations", "detail", id],
    currentResidents: (params) => ["reservations", "currentResidents", params || {}],
    tenantWorkspace: (params) => ["reservations", "tenantWorkspace", params || {}],
    tenantWorkspaceDetail: (id) => ["reservations", "tenantWorkspaceDetail", id],
    tenantActionContext: (id) => ["reservations", "tenantActionContext", id],
    visitAvailability: (params) => ["reservations", "visitAvailability", params || {}],
    visitAvailabilitySettings: (branch) => ["reservations", "visitAvailabilitySettings", branch || ""],
  },

  // ── Billing ──
  billing: {
    myBills: ["billing", "myBills"],
    current: ["billing", "current"],
    history: (limit) => ["billing", "history", limit],
    stats: ["billing", "stats"],
    byBranch: (params) => ["billing", "byBranch", params || {}],
    roomsWithTenants: (branch) => ["billing", "roomsWithTenants", branch],
    pendingVerifications: ["billing", "pendingVerifications"],
    report: ["billing", "report"],
  },

  // ── Inquiries ──
  inquiries: {
    all: (params) => ["inquiries", "list", params || {}],
    stats: ["inquiries", "stats"],
  },

  // ── Users / Tenants ──
  users: {
    all: ["users", "list"],
    stats: ["users", "stats"],
    detail: (id) => ["users", "detail", id],
  },

  // ── Audit Logs ──
  auditLogs: {
    all: (params) => ["auditLogs", "list", params || {}],
    paged: (params) => ["auditLogs", "paged", params || {}],
    failedLogins: (hours) => ["auditLogs", "failedLogins", hours || 24],
  },

  // ── Maintenance ──
  maintenance: {
    all: ["maintenance"],
    mine: (filters) => ["maintenance", "mine", filters || {}],
    admin: (filters) => ["maintenance", "admin", filters || {}],
    detail: (id) => ["maintenance", "detail", id],
  },

  // ── Announcements ──
  announcements: {
    all: ["announcements", "list"],
  },

  // ── Dashboard (composite) ──
  dashboard: {
    admin: (params) => ["dashboard", "admin", params || {}],
    tenant: ["dashboard", "tenant"],
  },

  analytics: {
    occupancyReport: (params) => ["analytics", "occupancy-report", params || {}],
    billingReport: (params) => ["analytics", "billing-report", params || {}],
    operationsReport: (params) => ["analytics", "operations-report", params || {}],
    occupancyForecast: (params) => ["analytics", "occupancy-forecast", params || {}],
    financials: (params) => ["analytics", "financials", params || {}],
    audit: (params) => ["analytics", "audit", params || {}],
    insights: (params) => ["analytics", "insights", params || {}],
  },

  settings: {
    business: ["settings", "business"],
  },

  financial: {
    overview: (branch) => ["financial", "overview", branch || "all"],
  },

  // ── Digital Twin ──
  digitalTwin: {
    snapshot: (branch) => ["digital-twin", "snapshot", branch || "all"],
    roomDetail: (roomId) => ["digital-twin", "roomDetail", roomId],
  },

  // ── Electricity Billing ──
  electricity: {
    rooms: (branch) => ["electricity", "rooms", branch || "all"],
    readings: (roomId) => ["electricity", "readings", roomId],
    latestReading: (roomId) => ["electricity", "latestReading", roomId],
    periods: (roomId) => ["electricity", "periods", roomId],
    result: (periodId) => ["electricity", "result", periodId],
    draftBills: (periodId) => ["electricity", "draftBills", periodId],
    breakdownByBill: (billId) => ["electricity", "breakdownByBill", billId],
    myBills: ["electricity", "myBills", "v3"],
    myBreakdown: (periodId) => ["electricity", "myBreakdown", periodId],
  },

  // —— Water Billing ——
  water: {
    rooms: (branch) => ["water", "rooms", branch || "all"],
    records: (roomId) => ["water", "records", roomId],
    periods: (roomId) => ["water", "periods", roomId],
    result: (periodId) => ["water", "result", periodId],
    draftBills: (periodId) => ["water", "draftBills", periodId],
    latestRecord: (roomId) => ["water", "latestRecord", roomId],
    myBills: ["water", "myBills", "v2"],
    myRecords: ["water", "myRecords"],
    myBreakdown: (periodId) => ["water", "myBreakdown", periodId],
    breakdownByBill: (billId) => ["water", "breakdownByBill", billId],
  },
};
