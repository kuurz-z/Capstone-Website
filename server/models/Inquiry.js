/**
 * ============================================================================
 * INQUIRY MODEL — Lead Capture & Conversion Pipeline (Spec §4)
 * ============================================================================
 *
 * This is the redesigned Inquiry model. It replaces the old contact form
 * model (now preserved as SupportInquiry.js) with a structured lead capture
 * and tenant conversion pipeline.
 *
 * PURPOSE (Spec §4):
 *   "Staff must be able to save that person even when they are not yet ready
 *   to apply, because inquiry sources feed the marketing reports Lilycrest
 *   wants later."
 *
 * LIFECYCLE (Spec §4.4):
 *   new → viewing_scheduled → viewing_completed → converted_to_application
 *      OR viewing_waived → converted_to_application
 *      OR closed (at any point)
 *
 * KEY PRINCIPLES:
 *   - `source` is REQUIRED — no anonymous inquiries in the pipeline.
 *   - After conversion, inquiry becomes read-only (except notes/response).
 *   - `derivedLeaseType` is computed from `expectedLengthOfStay` at save time.
 *
 * ============================================================================
 */

import mongoose from "mongoose";
import { INQUIRY_BRANCHES } from "../config/branches.js";

// ============================================================================
// CONSTANTS
// ============================================================================

export const INQUIRY_SOURCES = Object.freeze([
  "website",
  "facebook",
  "tiktok",
  "instagram",
  "text_message",
  "walk_in",
  "building_signage",
  "referral",
  "other",        // Requires sourceNote
]);

export const INQUIRY_VIEWING_STATUSES = Object.freeze([
  "new",                      // Captured, no action taken yet
  "viewing_scheduled",        // A viewing date and time are set
  "viewing_completed",        // Applicant saw the property
  "viewing_waived",           // Proceeding without viewing (admin-approved)
  "converted_to_application", // Registration started; reservationId linked
  "closed",                   // Inquiry did not convert
]);

export const INQUIRY_ROOM_TYPES = Object.freeze([
  "quadruple_sharing",
  "double_sharing",
  "private_room",
]);

// Threshold for "long" lease type (months). Drives marketing segmentation.
const LONG_LEASE_THRESHOLD_MONTHS = 6;

// ============================================================================
// VIEWING WAIVER SUBDOCUMENT
// ============================================================================
// Mirrors the viewingWaiver structure in Reservation.js (P1-05)
// so inquiry-level waivers are consistent with the application-level audit.

const inquiryViewingWaiverSchema = new mongoose.Schema(
  {
    waiverReason: {
      type: String,
      enum: [
        "out_of_province",
        "urgent_accommodation",
        "tenant_choice",
        "management_exception",
      ],
      default: null,
    },
    evidenceNote: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    acknowledgmentText: {
      type: String,
      default: null,
      trim: true,
    },
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    acknowledgedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

// ============================================================================
// MAIN INQUIRY SCHEMA
// ============================================================================

const inquirySchema = new mongoose.Schema(
  {
    // Optional reference to registered User if submitted by an authenticated account
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    // =========================================================================
    // LEAD CONTACT INFO (Spec §4.1)
    // =========================================================================
    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    name: {
      type: String,
      trim: true,
      maxlength: 150,
    },
    contactNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 20,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    // =========================================================================
    // ROOM INTEREST (Spec §4.1)
    // =========================================================================
    preferredBranch: {
      type: String,
      enum: [...INQUIRY_BRANCHES, null],
      default: null,
      index: true,
    },
    branch: {
      type: String,
      enum: [...INQUIRY_BRANCHES, null],
      default: null,
      index: true,
    },
    preferredRoomType: {
      type: String,
      enum: [...INQUIRY_ROOM_TYPES, null],
      default: null,
    },
    targetMoveInDate: {
      type: Date,
      default: null,
      // Provisional — not binding. Used for inventory planning.
    },
    expectedLengthOfStay: {
      type: Number,
      default: null,
      min: 1,
      // In months. Drives derivedLeaseType.
    },

    // Computed from expectedLengthOfStay and stored for fast querying.
    // short = < 6 months, long = >= 6 months (configurable via LONG_LEASE_THRESHOLD_MONTHS)
    derivedLeaseType: {
      type: String,
      enum: ["short", "long", null],
      default: null,
    },

    // =========================================================================
    // MARKETING SOURCE (Spec §4.1 — Required)
    // =========================================================================
    // Required on every inquiry — this is the primary key for marketing reports.
    source: {
      type: String,
      enum: INQUIRY_SOURCES,
      required: true,
      index: true,
    },
    sourceNote: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
      // Required when source = "other"
    },

    // =========================================================================
    // VIEWING WORKFLOW (Spec §4.4)
    // =========================================================================
    viewingChoice: {
      type: String,
      enum: ["schedule_viewing", "request_waiver", null],
      default: null,
    },
    viewingStatus: {
      type: String,
      enum: INQUIRY_VIEWING_STATUSES,
      default: "new",
      index: true,
    },
    viewingDate: {
      type: Date,
      default: null,
    },
    viewingTime: {
      type: String,
      default: null,
      trim: true,
    },
    viewingScheduledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    viewingScheduledAt: {
      type: Date,
      default: null,
    },
    viewingCompletedAt: {
      type: Date,
      default: null,
    },
    viewingOutcomeNotes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2000,
      // Admin's notes on what happened at the viewing
    },
    viewingWaiver: {
      type: inquiryViewingWaiverSchema,
      default: null,
    },

    // =========================================================================
    // CONVERSION TO APPLICATION (Spec §4.4)
    // =========================================================================
    // Populated when viewingStatus → "converted_to_application"
    convertedToApplicationAt: {
      type: Date,
      default: null,
    },
    convertedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      // The admin who triggered the conversion
    },
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reservation",
      default: null,
      index: true,
      // Linked Reservation created at conversion
    },

    // =========================================================================
    // ADMIN MANAGEMENT
    // =========================================================================
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
      // Admin responsible for following up on this inquiry
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },

    // Internal admin notes — always writable regardless of status
    notes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000,
    },

    // Subject / topic of the inquiry
    subject: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },

    // Original message from the prospective tenant
    message: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000,
    },

    // Admin's reply to the prospective tenant
    adminResponse: {
      type: String,
      default: "",
      trim: true,
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

    // Email delivery status tracking for official response
    emailDeliveryStatus: {
      type: String,
      enum: ["none", "sent", "failed", "pending"],
      default: "none",
      index: true,
    },
    emailDeliveryError: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1000,
    },
    emailLastAttemptAt: {
      type: Date,
      default: null,
    },

    // =========================================================================
    // CLOSURE TRACKING
    // =========================================================================
    closedAt: {
      type: Date,
      default: null,
    },
    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    closedReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
      // Why the inquiry did not convert (optional)
    },

    // Inquiry lifecycle status
    status: {
      type: String,
      enum: ["pending", "in-progress", "resolved", "closed"],
      default: "pending",
      index: true,
    },

    isRead: {
      type: Boolean,
      default: false,
    },
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
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Virtual aliases for backward compatibility across all admin views
inquirySchema.virtual("inquiryName").get(function () {
  return this.name || this.fullName || "";
});

inquirySchema.virtual("inquiryPhone").get(function () {
  return this.phone || this.contactNumber || "";
});

inquirySchema.virtual("response").get(function () {
  return this.adminResponse || "";
}).set(function (val) {
  this.adminResponse = val;
});

// ============================================================================
// INDEXES
// ============================================================================

// Marketing report queries (Spec §4 — source aggregation)
inquirySchema.index({ source: 1, preferredBranch: 1, createdAt: -1 });
inquirySchema.index({ preferredBranch: 1, viewingStatus: 1, createdAt: -1 });

// Dashboard queries
inquirySchema.index({ user: 1, createdAt: -1 });
inquirySchema.index({ assignedTo: 1, viewingStatus: 1 });
inquirySchema.index({ viewingDate: 1, viewingStatus: 1 });
inquirySchema.index({ isArchived: 1, viewingStatus: 1 });

// ============================================================================
// PRE-SAVE LOGIC
// ============================================================================

inquirySchema.pre("save", function computeLeaseType(next) {
  // 0. Sync branch and preferredBranch
  if (!this.preferredBranch && this.branch) {
    this.preferredBranch = this.branch;
  }
  if (!this.branch && this.preferredBranch) {
    this.branch = this.preferredBranch;
  }

  // 1. Compute derivedLeaseType from expectedLengthOfStay
  if (this.expectedLengthOfStay !== null && this.expectedLengthOfStay !== undefined) {
    this.derivedLeaseType =
      this.expectedLengthOfStay >= LONG_LEASE_THRESHOLD_MONTHS ? "long" : "short";
  } else {
    this.derivedLeaseType = null;
  }

  // 2. source = "other" requires sourceNote
  if (this.source === "other") {
    const hasNote =
      typeof this.sourceNote === "string" && this.sourceNote.trim().length > 0;
    if (!hasNote) {
      return next(
        new Error(
          `[Inquiry pre-save] source="other" requires a non-empty sourceNote ` +
            `describing the actual channel.`,
        ),
      );
    }
  }

  // 3. After conversion, block mutations to core fields (except notes & response)
  const CONVERTED_STATUS = "converted_to_application";
  if (!this.isNew && this.viewingStatus === CONVERTED_STATUS) {
    const LOCKED_FIELDS = [
      "fullName", "email", "contactNumber", "source",
      "preferredBranch", "preferredRoomType",
      "reservationId", "convertedBy", "convertedToApplicationAt",
    ];
    const mutations = LOCKED_FIELDS.filter((f) => this.isModified(f));
    if (mutations.length > 0) {
      return next(
        new Error(
          `[Inquiry pre-save] Cannot modify core fields after conversion: ` +
            `${mutations.join(", ")}. ` +
            `Only notes and adminResponse are editable post-conversion.`,
        ),
      );
    }
  }

  next();
});

// ============================================================================
// INSTANCE METHODS
// ============================================================================

inquirySchema.methods.archive = async function (archivedById = null) {
  this.isArchived = true;
  this.archivedAt = new Date();
  this.archivedBy = archivedById;
  return this.save();
};

inquirySchema.methods.restore = async function () {
  this.isArchived = false;
  this.archivedAt = null;
  this.archivedBy = null;
  return this.save();
};

inquirySchema.methods.respond = async function (
  responseText,
  responderId,
  options = {},
) {
  this.adminResponse = responseText;
  this.respondedBy = responderId;
  this.respondedAt = new Date();
  this.status = "resolved";
  if (options.emailDeliveryStatus) {
    this.emailDeliveryStatus = options.emailDeliveryStatus;
  }
  if (options.emailDeliveryError !== undefined) {
    this.emailDeliveryError = options.emailDeliveryError;
  }
  if (options.emailLastAttemptAt) {
    this.emailLastAttemptAt = options.emailLastAttemptAt;
  }
  return this.save();
};

inquirySchema.methods.markAsRead = async function () {
  this.isRead = true;
  return this.save();
};

// ============================================================================
// STATICS
// ============================================================================

inquirySchema.statics.findActive = function (filter = {}) {
  return this.find({ ...filter, isArchived: false });
};

inquirySchema.statics.findPending = function (branch = null) {
  const filter = { isArchived: false, status: "pending" };
  if (branch && branch !== "all") {
    filter.$or = [{ preferredBranch: branch }, { branch }];
  }
  return this.find(filter).sort({ createdAt: -1 });
};

/**
 * Marketing source report.
 * Returns counts grouped by source and branch for a given date range.
 *
 * @param {Date} fromDate
 * @param {Date} toDate
 * @param {string|null} branch  Filter to specific branch or null for all
 */
inquirySchema.statics.sourceReport = function (fromDate, toDate, branch = null) {
  const match = {
    isArchived: false,
    createdAt: { $gte: fromDate, $lte: toDate },
  };
  if (branch) match.preferredBranch = branch;

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          source: "$source",
          branch: "$preferredBranch",
          month: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
        },
        total: { $sum: 1 },
        converted: {
          $sum: {
            $cond: [{ $eq: ["$viewingStatus", "converted_to_application"] }, 1, 0],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        source: "$_id.source",
        branch: "$_id.branch",
        month: "$_id.month",
        total: 1,
        converted: 1,
        conversionRate: {
          $cond: [
            { $gt: ["$total", 0] },
            { $round: [{ $multiply: [{ $divide: ["$converted", "$total"] }, 100] }, 1] },
            0,
          ],
        },
      },
    },
    { $sort: { month: -1, total: -1 } },
  ]);
};

/**
 * Room type demand report — identifies which room types are most requested.
 */
inquirySchema.statics.roomTypeDemandReport = function (branch = null) {
  const match = { isArchived: false };
  if (branch) match.preferredBranch = branch;

  return this.aggregate([
    { $match: match },
    { $group: { _id: "$preferredRoomType", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
};

/**
 * Find unassigned active inquiries (for admin dashboard alert)
 */
inquirySchema.statics.findUnassigned = function (branch = null) {
  const filter = {
    isArchived: false,
    assignedTo: null,
    viewingStatus: { $nin: ["converted_to_application", "closed"] },
  };
  if (branch) filter.preferredBranch = branch;
  return this.find(filter).sort({ createdAt: 1 }); // Oldest first
};

// ============================================================================
// EXPORT
// ============================================================================

export default mongoose.model("Inquiry", inquirySchema);
