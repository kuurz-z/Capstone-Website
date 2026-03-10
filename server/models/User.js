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
 * - admin: Branch operations staff (Web only)
 * - superAdmin: System owner, multi-branch (Web only)
 *
 * SOFT DELETE:
 * - Use isArchived=true to soft delete
 * - Archived users cannot log in
 *
 * ============================================================================
 */

import mongoose from "mongoose";

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

    // --- Branch & Role ---
    branch: {
      type: String,
      enum: ["gil-puyat", "guadalupe", ""],
      default: null,
      index: true,
    },

    // --- Role & Reservation Status ---
    role: {
      type: String,
      enum: ["applicant", "tenant", "admin", "superAdmin"],
      default: "applicant",
      // Role lifecycle:
      // - "applicant" (registered, browsing, reserving — web only)
      // - "tenant" (signed contract, active resident — web + mobile)
      // - "admin" (branch operations staff — web only)
      // - "superAdmin" (system owner, multi-branch — web only)
    },

    tenantStatus: {
      type: String,
      enum: ["registered", "reserved", "active", "inactive"],
      default: null,
      // Usage:
      // - null: applicant (not yet registered / email unverified)
      // - "registered": email verified, ready to reserve
      // - "reserved": payment confirmed, bed held
      // - "active": checked in, physically moved in
      // - "inactive": moved out / contract ended
    },

    // --- Status ---
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
// INDEXES
// ============================================================================

userSchema.index({ branch: 1, role: 1 });
userSchema.index({ isArchived: 1, isActive: 1 });

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
  this.isActive = false;
  this.archivedAt = new Date();
  this.archivedBy = archivedById;
  return this.save();
};

/**
 * Restore an archived user
 */
userSchema.methods.restore = async function () {
  this.isArchived = false;
  this.isActive = true;
  this.archivedAt = null;
  this.archivedBy = null;
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
