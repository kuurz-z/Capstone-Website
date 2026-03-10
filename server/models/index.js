/**
 * ============================================================================
 * MODELS INDEX
 * ============================================================================
 *
 * Centralized export for all Mongoose models.
 *
 * USAGE:
 *   import { User, Room, Reservation, Inquiry } from "../models/index.js";
 *   // or
 *   import models from "../models/index.js";
 *   const user = await models.User.findById(id);
 *
 * SOFT DELETE:
 *   All models support soft delete via isArchived field.
 *   Use model.archive() to soft delete.
 *   Use model.restore() to restore.
 *   Use Model.findActive() to find non-archived records.
 *   Use Model.findArchived() to find archived records.
 *
 * BRANCHES:
 *   Valid branches: "gil-puyat", "guadalupe", "general" (inquiry only), ""
 *   Use the branch field to filter data by location.
 *
 * ============================================================================
 */

// ============================================================================
// MODEL IMPORTS
// ============================================================================

import User from "./User.js";
import Room from "./Room.js";
import Reservation from "./Reservation.js";
import Inquiry from "./Inquiry.js";
import AuditLog from "./AuditLog.js";
import Bill from "./Bill.js";
import RoomBill from "./RoomBill.js";
import Announcement from "./Announcement.js";
import MaintenanceRequest from "./MaintenanceRequest.js";
import AcknowledgmentAccount from "./AcknowledgmentAccount.js";

// ============================================================================
// NAMED EXPORTS
// ============================================================================

export {
  User,
  Room,
  Reservation,
  Inquiry,
  AuditLog,
  Bill,
  RoomBill,
  Announcement,
  MaintenanceRequest,
  AcknowledgmentAccount,
};

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Valid branch values for rooms and users
 */
export const ROOM_BRANCHES = ["gil-puyat", "guadalupe"];

/**
 * Valid branch values for inquiries (includes "general")
 */
export const INQUIRY_BRANCHES = ["gil-puyat", "guadalupe", "general"];

/**
 * Valid user roles
 */
export const USER_ROLES = ["user", "tenant", "admin", "superAdmin"];

/**
 * Valid inquiry statuses
 */
export const INQUIRY_STATUSES = [
  "pending",
  "in-progress",
  "resolved",
  "closed",
];

/**
 * Valid reservation statuses
 */
export const RESERVATION_STATUSES = [
  "pending",
  "confirmed",
  "checked-in",
  "checked-out",
  "cancelled",
];

/**
 * Valid inquiry tags
 */
export const INQUIRY_TAGS = [
  "room-inquiry",
  "pricing",
  "availability",
  "amenities",
  "location",
  "booking",
  "complaint",
  "feedback",
  "maintenance",
  "billing",
  "general",
  "urgent",
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a branch is valid for rooms/users
 * @param {string} branch
 * @returns {boolean}
 */
export const isValidRoomBranch = (branch) => ROOM_BRANCHES.includes(branch);

/**
 * Check if a branch is valid for inquiries
 * @param {string} branch
 * @returns {boolean}
 */
export const isValidInquiryBranch = (branch) =>
  INQUIRY_BRANCHES.includes(branch);

/**
 * Check if a role is valid
 * @param {string} role
 * @returns {boolean}
 */
export const isValidRole = (role) => USER_ROLES.includes(role);

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  User,
  Room,
  Reservation,
  Inquiry,
  AuditLog,
  Bill,
  RoomBill,
  Announcement,
  MaintenanceRequest,
  AcknowledgmentAccount,
  ROOM_BRANCHES,
  INQUIRY_BRANCHES,
  USER_ROLES,
  INQUIRY_STATUSES,
  RESERVATION_STATUSES,
  INQUIRY_TAGS,
  isValidRoomBranch,
  isValidInquiryBranch,
  isValidRole,
};
