/**
 * ============================================================================
 * USER MODEL
 * ============================================================================
 *
 * Stores user profile and account information.
 *
 * AUTHENTICATION:
 * - Firebase Auth is the source of truth for authentication
 * - This model stores profile data and access control
 *
 * BRANCHES:
 * - Users are assigned to a branch (gil-puyat, guadalupe, or empty)
 * - Empty branch means user hasn't selected one yet (Gmail signup)
 *
 * ROLES:
 * - applicant: Default role, pre-tenant browsing & reserving (Web only)
 * - tenant: Active resident with signed contract (Web + Mobile)
 * - branch_admin: Branch operations staff (Web only)
 * - owner: System owner, multi-branch (Web only)
 *
 * SOFT DELETE:
 * - Use isArchived=true to soft delete
 * - Archived users cannot log in
 *
 * ============================================================================
 */

import mongoose from "mongoose";
import { ROOM_BRANCHES } from "../config/branches.js";
import {
  getDefaultPermissionsForRole,
  normalizePermissions,
} from "../config/accessControl.js";

// ============================================================================
// SCHEMA DEFINITION
// ============================================================================

const userSchema = new mongoose.Schema(
  {
    // --- Authentication Link ---
    firebaseUid: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // --- Credentials ---
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      index: true,
    },

    // --- Profile ---
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    profileImage: {
      type: String,
      default: "",
    },

    // --- Extended Profile ---
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer-not-to-say", ""],
      default: "",
    },
    civilStatus: {
      type: String,
      enum: ["single", "married", "widowed", "separated", "divorced", ""],
      default: "",
    },
    nationality: {
      type: String,
      trim: true,
      default: "",
    },
    occupation: {
      type: String,
      trim: true,
      default: "",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    city: {
      type: String,
      trim: true,
      default: "",
    },
    province: {
      type: String,
      trim: true,
      default: "",
    },
    zipCode: {
      type: String,
      trim: true,
      default: "",
    },
    dateOfBirth: {
      type: Date,
      default: null,
    },
    emergencyContact: {
      type: String,
      trim: true,
      default: "",
    },
    emergencyPhone: {
      type: String,
      trim: true,
      default: "",
    },
    emergencyRelationship: {
      type: String,
      trim: true,
      default: "",
    },
    // Legacy student fields — kept for backward compatibility
    studentId: {
      type: String,
      trim: true,
      default: "",
    },
    school: {
      type: String,
      trim: true,
      default: "",
    },
    yearLevel: {
      type: String,
      trim: true,
      default: "",
    },

    // --- Branch & Role ---
    branch: {
      type: String,
      enum: [...ROOM_BRANCHES, ""],
      default: null,
      index: true,
    },

    // --- Role & Reservation Status ---
    role: {
      type: String,
      enum: ["applicant", "tenant", "branch_admin", "owner"],
      default: "applicant",
      // Role lifecycle:
      // - "applicant" (registered, browsing, reserving — web only)
      // - "tenant" (signed contract, active resident — web + mobile)
      // - "branch_admin" (branch operations staff — web only)
      // - "owner" (system owner, multi-branch — web only)
    },

    tenantStatus: {
      type: String,
      enum: ["applicant", "active", "inactive", "evicted", "blacklisted"],
      default: "applicant",
      // Usage:
      // - "applicant": not a tenant yet (applicant / pre-tenant)
      // - "active": moved in and physically occupying a bed
      // - "inactive": moved out / contract ended
      // - "evicted": forcefully removed by admin
      // - "blacklisted": banned from future reservations
    },

    // --- Granular Permissions ---
    permissions: {
      type: [String],
      default: [],
      // Populated based on role. Owner can customise per branch_admin.
      // Available permissions:
      // - manageReservations: view/update/cancel reservations
      // - manageTenants: view/edit tenant profiles, account actions
      // - manageBilling: generate bills, verify payments, apply penalties
      // - manageRooms: edit rooms, beds, occupancy
      // - manageMaintenance: handle maintenance requests
      // - manageAnnouncements: create/edit/delete announcements
      // - viewReports: access reports & analytics
      // - manageUsers: create/edit/delete user accounts
    },

    // --- Account Status ---
    accountStatus: {
      type: String,
      enum: ["active", "suspended", "banned", "pending_verification"],
      default: "active",
      index: true,
      // Lifecycle:
      // - "active": account in good standing
      // - "suspended": temporarily disabled by admin
      // - "banned": permanently disabled by admin
      // - "pending_verification": awaiting email verification
    },
    statusChangedAt: {
      type: Date,
      default: null,
    },
    statusChangedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    statusReason: {
      type: String,
      default: null,
    },

    // --- Status (backward-compatible – kept in sync via pre-save) ---
    isActive: {
      type: Boolean,
      default: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    // --- Soft Delete ---
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// ============================================================================
// PRE-SAVE HOOK — sync isActive with accountStatus
// ============================================================================

userSchema.pre("save", function (next) {
  // Backward compatibility for legacy records/scripts that still send "none".
  if (this.tenantStatus === "none") {
    this.tenantStatus = "applicant";
  }

  if (this.role === "branch_admin") {
    const normalized = normalizePermissions(this.permissions);
    this.permissions =
      normalized.length > 0
        ? normalized
        : getDefaultPermissionsForRole("branch_admin");
  } else if (this.role === "owner") {
    this.permissions = getDefaultPermissionsForRole("owner");
  } else {
    this.permissions = [];
  }

  if (this.isModified("accountStatus")) {
    this.isActive = this.accountStatus === "active";
  }
  next();
});

// ============================================================================
// INDEXES
// ============================================================================

userSchema.index({ branch: 1, role: 1 });
userSchema.index({ isArchived: 1, isActive: 1 });
userSchema.index({
  isArchived: 1,
  branch: 1,
  accountStatus: 1,
  role: 1,
  createdAt: -1,
});
userSchema.index({ isArchived: 1, accountStatus: 1, createdAt: -1 });

// ============================================================================
// VIRTUALS
// ============================================================================

userSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// ============================================================================
// METHODS
// ============================================================================

/**
 * Soft delete this user
 * @param {ObjectId} archivedById - ID of user performing the archive
 */
userSchema.methods.archive = async function (archivedById = null) {
  this.isArchived = true;
  this.accountStatus = "banned";
  this.archivedAt = new Date();
  this.archivedBy = archivedById;
  return this.save();
};

/**
 * Restore an archived user
 */
userSchema.methods.restore = async function () {
  this.isArchived = false;
  this.accountStatus = "active";
  this.archivedAt = null;
  this.archivedBy = null;
  return this.save();
};

/**
 * Suspend user account
 * @param {ObjectId} changedById - Admin performing the action
 * @param {string} reason - Reason for suspension
 */
userSchema.methods.suspend = async function (changedById, reason = null) {
  this.accountStatus = "suspended";
  this.statusChangedAt = new Date();
  this.statusChangedBy = changedById;
  this.statusReason = reason;
  return this.save();
};

/**
 * Ban user account
 * @param {ObjectId} changedById - Admin performing the action
 * @param {string} reason - Reason for ban
 */
userSchema.methods.ban = async function (changedById, reason = null) {
  this.accountStatus = "banned";
  this.statusChangedAt = new Date();
  this.statusChangedBy = changedById;
  this.statusReason = reason;
  return this.save();
};

/**
 * Reactivate user account
 * @param {ObjectId} changedById - Admin performing the action
 */
userSchema.methods.reactivate = async function (changedById) {
  this.accountStatus = "active";
  this.statusChangedAt = new Date();
  this.statusChangedBy = changedById;
  this.statusReason = null;
  return this.save();
};

// ============================================================================
// STATICS
// ============================================================================

/**
 * Find all active (non-archived) users
 */
userSchema.statics.findActive = function (filter = {}) {
  return this.find({ ...filter, isArchived: false });
};

/**
 * Find all archived users
 */
userSchema.statics.findArchived = function (filter = {}) {
  return this.find({ ...filter, isArchived: true });
};

// ============================================================================
// EXPORT
// ============================================================================

const User = mongoose.model("User", userSchema);

export default User;
