/**
 * =============================================================================
 * APPLICATION CONSTANTS
 * =============================================================================
 *
 * Centralized constants for the Lilycrest application.
 * These values must match the backend model enums exactly.
 *
 * IMPORTANT: When modifying these values, ensure they match:
 * - Backend: server/models/*.js enum definitions
 * - Database: Existing data in MongoDB collections
 * =============================================================================
 */

// -----------------------------------------------------------------------------
// User Roles (matches server/models/User.js)
// -----------------------------------------------------------------------------
export const USER_ROLES = {
  APPLICANT: "applicant", // Registered, not yet a tenant
  TENANT: "tenant", // Active tenant (moved in)
  BRANCH_ADMIN: "branch_admin", // Branch administrator
  OWNER: "owner", // System-wide owner
};

// -----------------------------------------------------------------------------
// Room Types (matches server/models/Room.js)
// -----------------------------------------------------------------------------
export const ROOM_TYPES = {
  PRIVATE: "private",
  DOUBLE_SHARING: "double-sharing",
  QUADRUPLE_SHARING: "quadruple-sharing",
};

// -----------------------------------------------------------------------------
// Branches (matches server/models/Room.js and User.js)
// -----------------------------------------------------------------------------
export const BRANCHES = {
  GIL_PUYAT: "gil-puyat", // Gil Puyat branch in Makati
  GUADALUPE: "guadalupe", // Guadalupe branch in Makati
};

// Branch display names for UI
export const BRANCH_DISPLAY_NAMES = {
  "gil-puyat": "Gil Puyat • Makati",
  guadalupe: "Guadalupe • Makati",
};

// -----------------------------------------------------------------------------
// Reservation Status (matches server/models/Reservation.js)
// -----------------------------------------------------------------------------
export const RESERVATION_STATUS = {
  PENDING: "pending",
  RESERVED: "reserved",
  MOVE_IN: "moveIn",
  MOVE_OUT: "moveOut",
  CANCELLED: "cancelled",
};

// -----------------------------------------------------------------------------
// Inquiry Status (matches server/models/Inquiry.js)
// -----------------------------------------------------------------------------
export const INQUIRY_STATUS = {
  PENDING: "pending", // New inquiry, not yet reviewed
  IN_PROGRESS: "in-progress", // Admin is working on it
  RESOLVED: "resolved", // Issue has been addressed
  CLOSED: "closed", // Inquiry is complete
};

// -----------------------------------------------------------------------------
// Payment Status (matches server/models/Reservation.js)
// -----------------------------------------------------------------------------
export const PAYMENT_STATUS = {
  PENDING: "pending",
  PARTIAL: "partial",
  PAID: "paid",
};

// -----------------------------------------------------------------------------
// Inquiry Priority (matches server/models/Inquiry.js)
// -----------------------------------------------------------------------------
export const INQUIRY_PRIORITY = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  URGENT: "urgent",
};
