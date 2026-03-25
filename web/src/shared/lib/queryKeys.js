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
    all: ["reservations", "list"],
    detail: (id) => ["reservations", "detail", id],
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
  },

  // ── Maintenance ──
  maintenance: {
    all: ["maintenance", "list"],
    detail: (id) => ["maintenance", "detail", id],
  },

  // ── Announcements ──
  announcements: {
    all: ["announcements", "list"],
  },

  // ── Dashboard (composite) ──
  dashboard: {
    admin: ["dashboard", "admin"],
    tenant: ["dashboard", "tenant"],
  },

  // ── Digital Twin ──
  digitalTwin: {
    snapshot: (branch) => ["digital-twin", "snapshot", branch || "all"],
    roomDetail: (roomId) => ["digital-twin", "roomDetail", roomId],
  },
};
