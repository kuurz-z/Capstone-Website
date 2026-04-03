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
    // Dynamic custom charges (appliance fees, etc.)
    additionalCharges: {
      type: [
        {
          name: { type: String, required: true },
          amount: { type: Number, required: true },
        },
      ],
      default: [],
    },

    // --- Bill Period ---
    billingMonth: {
      type: Date,
      required: true,
      index: true,
    },
    dueDate: {
      type: Date,
      required: false,
      default: null,
    },
    billingCycleStart: {
      type: Date,
      default: null,
    },
    billingCycleEnd: {
      type: Date,
      default: null,
    },
    utilityCycleStart: {
      type: Date,
      default: null,
    },
    utilityCycleEnd: {
      type: Date,
      default: null,
    },
    utilityReadingDate: {
      type: Date,
      default: null,
    },
    isFirstCycleBill: {
      type: Boolean,
      default: false,
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
    grossAmount: {
      type: Number,
      default: 0,
    },
    reservationCreditApplied: {
      type: Number,
      default: 0,
    },
    remainingAmount: {
      type: Number,
      default: 0,
    },

    // --- Payment Status ---
    status: {
      type: String,
      enum: ["draft", "pending", "paid", "overdue", "partially-paid"],
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
    paymentMethod: {
      type: String,
      enum: [
        "bank",
        "gcash",
        "card",
        "check",
        "cash",
        "paymongo",
        "paymaya",
        "grab_pay",
        "maya",
        "online",
      ],
      default: null,
    },
    paymongoSessionId: {
      type: String,
      default: null,
    },
    paymongoPaymentId: {
      type: String,
      default: null,
    },

    // --- Metadata ---
    notes: {
      type: String,
      default: "",
    },
    isManuallyAdjusted: {
      type: Boolean,
      default: false,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    issuedAt: {
      type: Date,
      default: null,
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },

    // --- PDF Bill ---
    // Populated automatically when sendBills is triggered.
    // Relative path from server root: "uploads/bills/BILLID.pdf"
    pdfPath: {
      type: String,
      default: null,
    },
    pdfGeneratedAt: {
      type: Date,
      default: null,
    },

    // --- Payment Proof (tenant submission) ---
    paymentProof: {
      imageUrl: { type: String, default: null },
      submittedAmount: { type: Number, default: null },
      submittedAt: { type: Date, default: null },
      verificationStatus: {
        type: String,
        enum: ["none", "pending-verification", "approved", "rejected"],
        default: "none",
        index: true,
      },
      rejectionReason: { type: String, default: null },
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      verifiedAt: { type: Date, default: null },
    },

    // --- Penalty Details ---
    penaltyDetails: {
      daysLate: { type: Number, default: 0 },
      ratePerDay: { type: Number, default: 50 },
      appliedAt: { type: Date, default: null },
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
  this.remainingAmount = Math.max(this.totalAmount - amount, 0);
  this.status = this.remainingAmount <= 0 ? "paid" : "partially-paid";
  this.paymentDate = new Date();
  return this.save();
};

billSchema.methods.markAsOverdue = function () {
  if (
    this.status !== "draft" &&
    (this.remainingAmount ?? this.totalAmount - this.paidAmount) > 0
  ) {
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
