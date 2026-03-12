/**
 * ============================================================================
 * MAINTENANCE REQUEST MODEL
 * ============================================================================
 *
 * Tracks maintenance requests from tenants with branch separation.
 * Supports work tracking and historical analysis for predictive maintenance.
 *
 * BRANCH ISOLATION:
 * - Each request is tied to a branch via reservation
 * - Queries automatically filter by branch
 *
 * FOR AI FEATURES:
 * - Request patterns for predictive maintenance
 * - Time-to-completion metrics
 * - Issue frequency by category for forecasting
 *
 * ============================================================================
 */

import mongoose from "mongoose";

// ============================================================================
// SCHEMA DEFINITION
// ============================================================================

const maintenanceRequestSchema = new mongoose.Schema(
  {
    // --- Request Identity ---
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reservation",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    branch: {
      type: String,
      enum: ["gil-puyat", "guadalupe"],
      required: true,
      index: true,
    },

    // --- Issue Details ---
    category: {
      type: String,
      enum: [
        "plumbing",
        "electrical",
        "hardware",
        "appliance",
        "cleaning",
        "other",
      ],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    urgency: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },

    // --- Status Tracking ---
    status: {
      type: String,
      enum: ["pending", "in-progress", "on-hold", "completed", "cancelled"],
      default: "pending",
      index: true,
    },

    // --- Assignment ---
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignedAt: {
      type: Date,
      default: null,
    },

    // --- Progress ---
    completedAt: {
      type: Date,
      default: null,
    },
    completionNote: {
      type: String,
      default: "",
    },

    // --- Timeline for forecasting ---
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },

    // --- Room/Bed Reference (for room-specific maintenance) ---
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      default: null,
      index: true,
    },
    bedId: {
      type: String,
      default: null,
    },

    // --- Scheduling ---
    scheduledDate: {
      type: Date,
      default: null,
    },
    estimatedDuration: {
      type: String, // e.g. "2 hours", "1 day"
      default: null,
    },

    // --- Cost Tracking ---
    estimatedCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    actualCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    costNotes: {
      type: String,
      default: "",
    },

    // --- Metadata ---
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true },
);

// ============================================================================
// INDEXES FOR PERFORMANCE
// ============================================================================

// For branch-specific queries
maintenanceRequestSchema.index({ branch: 1, status: 1, createdAt: -1 });
maintenanceRequestSchema.index({ branch: 1, userId: 1, createdAt: -1 });

// For analytics and forecasting
maintenanceRequestSchema.index({ category: 1, branch: 1, createdAt: -1 });
maintenanceRequestSchema.index({ branch: 1, createdAt: -1, resolvedAt: 1 });

// For filtering
maintenanceRequestSchema.index({ status: 1, urgency: 1 });

// ============================================================================
// INSTANCE METHODS
// ============================================================================

maintenanceRequestSchema.methods.start = function (staffId) {
  this.status = "in-progress";
  this.assignedTo = staffId;
  this.assignedAt = new Date();
  return this.save();
};

maintenanceRequestSchema.methods.complete = function (note = "") {
  this.status = "completed";
  this.completedAt = new Date();
  this.resolvedAt = new Date();
  this.completionNote = note;
  return this.save();
};

maintenanceRequestSchema.methods.getResolutionTime = function () {
  if (!this.resolvedAt) return null;
  return this.resolvedAt - this.createdAt;
};

// ============================================================================
// STATIC METHODS
// ============================================================================

// Find requests by branch
maintenanceRequestSchema.statics.findByBranch = function (
  branch,
  options = {},
) {
  return this.find({ branch, isArchived: false })
    .sort({ createdAt: -1 })
    .limit(options.limit || 50);
};

// Get pending requests by branch
maintenanceRequestSchema.statics.getPendingByBranch = function (branch) {
  return this.find({
    branch,
    status: { $in: ["pending", "in-progress"] },
    isArchived: false,
  }).sort({ urgency: -1, createdAt: 1 });
};

// Get completion statistics by branch (for forecasting)
maintenanceRequestSchema.statics.getCompletionStats = async function (
  branch,
  days = 30,
) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.aggregate([
    {
      $match: {
        branch,
        resolvedAt: { $gte: startDate },
        status: "completed",
      },
    },
    {
      $group: {
        _id: "$category",
        completedCount: { $sum: 1 },
        avgResolutionTime: {
          $avg: {
            $subtract: ["$resolvedAt", "$createdAt"],
          },
        },
      },
    },
  ]);
};

// Get issue frequency by category (for predictive maintenance)
maintenanceRequestSchema.statics.getIssueFrequency = async function (
  branch,
  limit = 12,
  monthsBack = 6,
) {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - monthsBack);

  return this.aggregate([
    {
      $match: {
        branch,
        createdAt: { $gte: startDate },
        isArchived: false,
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m", date: "$createdAt" },
          category: "$category",
        },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { "_id.category": 1, _id: 1 },
    },
    {
      $limit: limit,
    },
  ]);
};

// ============================================================================
// MODEL EXPORT
// ============================================================================

export default mongoose.model("MaintenanceRequest", maintenanceRequestSchema);
