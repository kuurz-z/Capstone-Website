/**
 * ============================================================================
 * INQUIRY MODEL
 * ============================================================================
 *
 * Stores contact form submissions and customer inquiries.
 *
 * BRANCHES:
 * - gil-puyat: Inquiry for Gil Puyat branch
 * - guadalupe: Inquiry for Guadalupe branch
 * - general: General inquiry (not branch-specific)
 *
 * STATUS WORKFLOW:
 * 1. pending: New inquiry, not yet reviewed
 * 2. in-progress: Admin is working on it
 * 3. resolved: Issue has been addressed
 * 4. closed: Inquiry is complete
 *
 * PRIORITY:
 * - low, medium, high, urgent
 * - Helps admins prioritize responses
 *
 * SOFT DELETE:
 * - Use isArchived=true to soft delete
 * - Archived inquiries are hidden from active lists
 *
 * ============================================================================
 */

import mongoose from "mongoose";

// ============================================================================
// CONSTANTS
// ============================================================================

const VALID_BRANCHES = ["gil-puyat", "guadalupe", "general"];
const VALID_STATUSES = ["pending", "in-progress", "resolved", "closed"];
const VALID_PRIORITIES = ["low", "medium", "high", "urgent"];
const VALID_TAGS = [
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
// SCHEMA DEFINITION
// ============================================================================

const inquirySchema = new mongoose.Schema(
  {
    // --- Sender Info ---
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },

    // --- Inquiry Content ---
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      maxlength: 5000,
    },

    // --- Classification ---
    branch: {
      type: String,
      required: true,
      enum: VALID_BRANCHES,
      index: true,
    },
    status: {
      type: String,
      enum: VALID_STATUSES,
      default: "pending",
      index: true,
    },
    priority: {
      type: String,
      enum: VALID_PRIORITIES,
      default: "medium",
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (tags) => tags.every((tag) => VALID_TAGS.includes(tag)),
        message: `Invalid tag. Valid tags: ${VALID_TAGS.join(", ")}`,
      },
    },

    // --- Admin Response ---
    response: {
      type: String,
      default: "",
      maxlength: 5000,
    },
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    respondedAt: {
      type: Date,
      default: null,
    },

    // --- Read Status ---
    isRead: {
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

inquirySchema.index({ branch: 1, status: 1 });
inquirySchema.index({ branch: 1, createdAt: -1 });
inquirySchema.index({ isArchived: 1, status: 1 });
inquirySchema.index({ isArchived: 1, createdAt: -1 });

// ============================================================================
// METHODS
// ============================================================================

/**
 * Soft delete this inquiry
 */
inquirySchema.methods.archive = async function (archivedById = null) {
  this.isArchived = true;
  this.archivedAt = new Date();
  this.archivedBy = archivedById;
  return this.save();
};

/**
 * Restore an archived inquiry
 */
inquirySchema.methods.restore = async function () {
  this.isArchived = false;
  this.archivedAt = null;
  this.archivedBy = null;
  return this.save();
};

/**
 * Add admin response
 */
inquirySchema.methods.respond = async function (responseText, responderId) {
  this.response = responseText;
  this.respondedBy = responderId;
  this.respondedAt = new Date();
  this.status = "resolved";
  return this.save();
};

/**
 * Mark as read
 */
inquirySchema.methods.markAsRead = async function () {
  this.isRead = true;
  return this.save();
};

// ============================================================================
// STATICS
// ============================================================================

/**
 * Find all active (non-archived) inquiries
 */
inquirySchema.statics.findActive = function (filter = {}) {
  return this.find({ ...filter, isArchived: false });
};

/**
 * Find all archived inquiries
 */
inquirySchema.statics.findArchived = function (filter = {}) {
  return this.find({ ...filter, isArchived: true });
};

/**
 * Find pending inquiries for a branch
 */
inquirySchema.statics.findPending = function (branch = null) {
  const filter = { isArchived: false, status: "pending" };
  if (branch && branch !== "all") filter.branch = branch;
  return this.find(filter).sort({ createdAt: -1 });
};

/**
 * Get valid tags list
 */
inquirySchema.statics.getValidTags = function () {
  return [...VALID_TAGS];
};

/**
 * Get valid branches list
 */
inquirySchema.statics.getValidBranches = function () {
  return [...VALID_BRANCHES];
};

// ============================================================================
// EXPORT
// ============================================================================

const Inquiry = mongoose.model("Inquiry", inquirySchema);

export default Inquiry;
