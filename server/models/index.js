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
import UserSession from "./UserSession.js";
import AcknowledgmentAccount from "./AcknowledgmentAccount.js";
import BusinessSettings from "./BusinessSettings.js";
import ChatConversation from "./ChatConversation.js";
import ChatMessage from "./ChatMessage.js";
import WaterBillingRecord from "./WaterBillingRecord.js";
import UtilityPeriod from "./UtilityPeriod.js";
import UtilityReading from "./UtilityReading.js";
import BedHistory from "./BedHistory.js";
import Stay from "./Stay.js";
import {
  CANONICAL_RESERVATION_STATUSES,
  USER_ROLE_NAMES,
} from "../utils/lifecycleNaming.js";
import {
  INQUIRY_BRANCHES,
  ROOM_BRANCHES,
  ROOM_BRANCH_LABELS,
  isValidInquiryBranch,
  isValidRoomBranch,
} from "../config/branches.js";

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
  UserSession,
  AcknowledgmentAccount,
  BusinessSettings,
  ChatConversation,
  ChatMessage,
  WaterBillingRecord,
  UtilityPeriod,
  UtilityReading,
  BedHistory,
  Stay,
};

// ============================================================================
// CONSTANTS
// ============================================================================

export {
  ROOM_BRANCHES,
  INQUIRY_BRANCHES,
  ROOM_BRANCH_LABELS,
  isValidRoomBranch,
  isValidInquiryBranch,
};

/**
 * Valid user roles
 */
export const USER_ROLES = USER_ROLE_NAMES;

/**
 * Valid tenant statuses
 */
export const TENANT_STATUSES = [
  "none",
  "active",
  "inactive",
  "moved_out",
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
export const RESERVATION_STATUSES = CANONICAL_RESERVATION_STATUSES;

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
  ChatConversation,
  ChatMessage,
  WaterBillingRecord,
  UtilityPeriod,
  UtilityReading,
  BedHistory,
  Stay,
  Notification,
  Payment,
  LoginLog,
  UserSession,
  ROOM_BRANCHES,
  INQUIRY_BRANCHES,
  ROOM_BRANCH_LABELS,
  USER_ROLES,
  TENANT_STATUSES,
  INQUIRY_STATUSES,
  RESERVATION_STATUSES,
  INQUIRY_TAGS,
  isValidRoomBranch,
  isValidInquiryBranch,
  isValidRole,
};
