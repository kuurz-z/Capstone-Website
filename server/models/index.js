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
import MeterReading from "./MeterReading.js";
import BillingPeriod from "./BillingPeriod.js";
import BillingResult from "./BillingResult.js";
import Announcement from "./Announcement.js";
import MaintenanceRequest from "./MaintenanceRequest.js";
import Notification from "./Notification.js";
import Payment from "./Payment.js";
import LoginLog from "./LoginLog.js";
import AcknowledgmentAccount from "./AcknowledgmentAccount.js";
import BusinessSettings from "./BusinessSettings.js";
import WaterBillingRecord from "./WaterBillingRecord.js";
import UtilityPeriod from "./UtilityPeriod.js";
import UtilityReading from "./UtilityReading.js";

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
  MeterReading,
  BillingPeriod,
  BillingResult,
  Announcement,
  MaintenanceRequest,
  Notification,
  Payment,
  LoginLog,
  AcknowledgmentAccount,
  BusinessSettings,
  WaterBillingRecord,
  UtilityPeriod,
  UtilityReading,
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
export const USER_ROLES = ["applicant", "tenant", "branch_admin", "owner"];

/**
 * Valid tenant statuses
 */
export const TENANT_STATUSES = [
  "none",
  "active",
  "inactive",
  "evicted",
  "blacklisted",
];

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
  "visit_pending",
  "visit_approved",
  "payment_pending",
  "reserved",
  "checked-in",
  "checked-out",
  "cancelled",
  "archived",
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
  MeterReading,
  BillingPeriod,
  BillingResult,
  Announcement,
  MaintenanceRequest,
  AcknowledgmentAccount,
  BusinessSettings,
  WaterBillingRecord,
  UtilityPeriod,
  UtilityReading,
  Notification,
  Payment,
  LoginLog,
  ROOM_BRANCHES,
  INQUIRY_BRANCHES,
  USER_ROLES,
  TENANT_STATUSES,
  INQUIRY_STATUSES,
  RESERVATION_STATUSES,
  INQUIRY_TAGS,
  isValidRoomBranch,
  isValidInquiryBranch,
  isValidRole,
};
