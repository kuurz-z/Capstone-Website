/**
 * ============================================================================
 * BILL MODEL
 * ============================================================================
 *
 * Stores billing/invoice records for tenant stays.
 * Supports multi-branch environments and scalable queries for forecasting.
 *
 * BRANCH ISOLATION:
 * - Each bill is tied to a specific branch via reservation.branch
 * - Bills are automatically associated with the tenant's branch
 * - Forecasting queries can aggregate by branch
 *
 * FOR AI FEATURES:
 * - Timestamps for time-series analysis
 * - Status tracking for payment prediction
 * - Historical data for trend forecasting
 *
 * ============================================================================
 */

import mongoose from "mongoose";

// ============================================================================
// SCHEMA DEFINITION
// ============================================================================

const billSchema = new mongoose.Schema(
  {
    // --- Bill Identity ---
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reservation",
      default: null,
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

    // --- Room Bill Link (for room-based billing) ---
    roomBillId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RoomBill",
      default: null,
      index: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      default: null,
    },
    proRataDays: {
      type: Number,
      default: null,
    },

    // --- Bill Period ---
    billingMonth: {
      type: Date,
      required: true,
      index: true,
    },
    dueDate: {
      type: Date,
      required: true,
    },

    // --- Charges ---
    charges: {
      rent: {
        type: Number,
        default: 0,
      },
      electricity: {
        type: Number,
        default: 0,
      },
      water: {
        type: Number,
        default: 0,
      },
      applianceFees: {
        type: Number,
        default: 0,
      },
      corkageFees: {
        type: Number,
        default: 0,
      },
      penalty: {
        type: Number,
        default: 0,
      },
      discount: {
        type: Number,
        default: 0,
      },
    },

    // --- Total ---
    totalAmount: {
      type: Number,
      required: true,
      index: true,
    },

    // --- Payment Status ---
    status: {
      type: String,
      enum: ["pending", "paid", "overdue", "partially-paid"],
      default: "pending",
      index: true,
    },
    paidAmount: {
      type: Number,
      default: 0,
    },
    paymentDate: {
      type: Date,
      default: null,
    },

    // --- Metadata ---
    notes: {
      type: String,
      default: "",
    },
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
billSchema.index({ branch: 1, billingMonth: -1 });
billSchema.index({ branch: 1, status: 1 });
billSchema.index({ branch: 1, userId: 1, billingMonth: -1 });

// For forecasting and trend analysis
billSchema.index({ billingMonth: -1, totalAmount: 1 });
billSchema.index({ branch: 1, billingMonth: -1, status: 1 });

// ============================================================================
// INSTANCE METHODS
// ============================================================================

billSchema.methods.markAsPaid = function (amount = this.totalAmount) {
  this.paidAmount = amount;
  this.status = amount >= this.totalAmount ? "paid" : "partially-paid";
  this.paymentDate = new Date();
  return this.save();
};

billSchema.methods.markAsOverdue = function () {
  if (this.status === "pending") {
    this.status = "overdue";
    return this.save();
  }
  return this;
};

// ============================================================================
// STATIC METHODS
// ============================================================================

// Find active (non-archived) bills
billSchema.statics.findActive = function () {
  return this.find({ isArchived: false });
};

// Find bills by branch for forecasting
billSchema.statics.findByBranch = function (branch, options = {}) {
  const query = { branch, isArchived: false };
  return this.find(query)
    .sort({ billingMonth: -1 })
    .limit(options.limit || 100);
};

// Get monthly revenue by branch (for forecasting)
billSchema.statics.getMonthlyRevenueByBranch = async function (
  branch,
  months = 12,
) {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  return this.aggregate([
    {
      $match: {
        branch,
        billingMonth: { $gte: startDate },
        status: { $in: ["paid", "partially-paid"] },
        isArchived: false,
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m", date: "$billingMonth" },
        },
        totalRevenue: { $sum: "$paidAmount" },
        billCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
};

// Get payment statistics by branch
billSchema.statics.getPaymentStats = async function (branch) {
  return this.aggregate([
    {
      $match: {
        branch,
        isArchived: false,
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmount: { $sum: "$totalAmount" },
      },
    },
  ]);
};

// ============================================================================
// MODEL EXPORT
// ============================================================================

export default mongoose.model("Bill", billSchema);
