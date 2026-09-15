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
// MODEL IMPORTS (Grouped by Functional Domain)
// ============================================================================

// 1. Identity & Auth Domain
import User from "./User.js";
import UserSession from "./UserSession.js";
import LoginLog from "./LoginLog.js";

// 2. Rooms & Occupancy Domain
import Room from "./Room.js";
import BedHistory from "./BedHistory.js";
import Stay from "./Stay.js";
import StayExtensionRequest from "./StayExtensionRequest.js";
import Contract from "./Contract.js";
import ContractCounter from "./ContractCounter.js";
import ContractAcknowledgement from "./ContractAcknowledgement.js";
import BedCheckoutLock from "./BedCheckoutLock.js";

// 3. Reservations & Visit Domain
import Reservation from "./Reservation.js";
import ScheduledRoomTransfer from "./ScheduledRoomTransfer.js";
import TenantTransferRequest from "./TenantTransferRequest.js";
import VisitAvailability from "./VisitAvailability.js";
import VisitAvailabilityHistory from "./VisitAvailabilityHistory.js";
import VisitConflictLog from "./VisitConflictLog.js";
import LeaseRenewal from "./LeaseRenewal.js";

// 4. Billing & Utility Domain (Active Modular System)
import UtilityPeriod from "./UtilityPeriod.js";
import UtilityReading from "./UtilityReading.js";
import UtilityFinalization from "./UtilityFinalization.js";
import UtilityHistoricalGap from "./UtilityHistoricalGap.js";
import Bill from "./Bill.js";
import Payment from "./Payment.js";
import TenantCredit from "./TenantCredit.js";
import AcknowledgmentAccount from "./AcknowledgmentAccount.js";

// 4b. Legacy Billing Models (@deprecated - replaced by UtilityPeriod, UtilityReading, Bill)
/** @deprecated Replaced by UtilityPeriod & Bill */
import BillingPeriod from "./BillingPeriod.js";
/** @deprecated Integrated into Bill subdocuments */
import BillingResult from "./BillingResult.js";
/** @deprecated Replaced by UtilityReading */
import MeterReading from "./MeterReading.js";
/** @deprecated Replaced by UtilityPeriod */
import WaterBillingRecord from "./WaterBillingRecord.js";

// 5. Operations & Services Domain
import MaintenanceRequest from "./MaintenanceRequest.js";
import Inquiry from "./Inquiry.js";
import SupportInquiry from "./SupportInquiry.js";
import Announcement from "./Announcement.js";
import Notification from "./Notification.js";
import ServiceProvider from "./ServiceProvider.js";
import OverdueNotice from "./OverdueNotice.js";
import TerminationReview from "./TerminationReview.js";
import BillingDispute from "./BillingDispute.js";
import TenantViolation from "./TenantViolation.js";
import MoveOutClearance from "./MoveOutClearance.js";

// 6. Communication Domain
import ChatConversation from "./ChatConversation.js";
import ChatMessage from "./ChatMessage.js";
import ChatAttachment from "./ChatAttachment.js";

// 7. System Administration Domain
import AuditLog from "./AuditLog.js";
import BusinessSettings from "./BusinessSettings.js";
import Appliance from "./Appliance.js";
import BackupConfig from "./BackupConfig.js";
import BackupRecord from "./BackupRecord.js";
import PaymongoWebhookEvent from "./PaymongoWebhookEvent.js";
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
  ScheduledRoomTransfer,
  TenantTransferRequest,
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
  TenantCredit,
  LoginLog,
  UserSession,
  AcknowledgmentAccount,
  BusinessSettings,
  Appliance,
  VisitAvailability,
  VisitAvailabilityHistory,
  VisitConflictLog,
  LeaseRenewal,
  ChatConversation,
  ChatMessage,
  ChatAttachment,
  WaterBillingRecord,
  UtilityPeriod,
  UtilityReading,
  UtilityFinalization,
  UtilityHistoricalGap,
  BedHistory,
  Stay,
  StayExtensionRequest,
  Contract,
  ContractCounter,
  ContractAcknowledgement,
  BedCheckoutLock,
  BackupConfig,
  BackupRecord,
  ServiceProvider,
  OverdueNotice,
  TerminationReview,
  BillingDispute,
  TenantViolation,
  MoveOutClearance,
  PaymongoWebhookEvent,
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
  ScheduledRoomTransfer,
  TenantTransferRequest,
  Inquiry,
  SupportInquiry,
  AuditLog,
  Bill,
  MeterReading,
  BillingPeriod,
  BillingResult,
  Announcement,
  MaintenanceRequest,
  AcknowledgmentAccount,
  BusinessSettings,
  VisitAvailability,
  VisitAvailabilityHistory,
  VisitConflictLog,
  LeaseRenewal,
  ChatConversation,
  ChatMessage,
  ChatAttachment,
  WaterBillingRecord,
  UtilityPeriod,
  UtilityReading,
  UtilityFinalization,
  UtilityHistoricalGap,
  BedHistory,
  Stay,
  Contract,
  ContractCounter,
  BackupConfig,
  BackupRecord,
  ServiceProvider,
  BedCheckoutLock,
  OverdueNotice,
  TerminationReview,
  BillingDispute,
  TenantViolation,
  MoveOutClearance,
  Notification,
  Payment,
  TenantCredit,
  LoginLog,
  UserSession,
  PaymongoWebhookEvent,
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
