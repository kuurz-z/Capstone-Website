/**
 * ============================================================================
 * PAYMENT MODEL
 * ============================================================================
 *
 * Separate payment ledger for financial auditing.
 * Each record represents a single payment transaction.
 *
 * BENEFITS:
 * - Financial auditing separate from bill status
 * - Payment history and reporting
 * - Multiple payments per bill support
 *
 * ============================================================================
 */

import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const paymentSchema = new mongoose.Schema(
  {
    // --- Payment Identity ---
    paymentId: {
      type: String,
      required: true,
      unique: true,
      default: () => `PAY-${uuidv4().slice(0, 8).toUpperCase()}`,
      index: true,
    },

    // --- References ---
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    billId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bill",
      required: true,
      index: true,
    },

    // --- Payment Details ---
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    method: {
      type: String,
      enum: ["bank", "gcash", "card", "check", "cash", "paymongo"],
      required: true,
    },
    referenceNumber: {
      type: String,
      default: null,
    },
    proofImageUrl: {
      type: String,
      default: null,
    },

    // --- Status ---
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    // --- Verification ---
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: null,
    },

    // --- Branch ---
    branch: {
      type: String,
      enum: ["gil-puyat", "guadalupe"],
      required: true,
      index: true,
    },

    // --- Notes ---
    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

// ============================================================================
// INDEXES
// ============================================================================

paymentSchema.index({ tenantId: 1, createdAt: -1 });
paymentSchema.index({ billId: 1, status: 1 });
paymentSchema.index({ branch: 1, createdAt: -1 });

// ============================================================================
// STATICS
// ============================================================================

/**
 * Get payment history for a tenant
 */
paymentSchema.statics.getPaymentHistory = function (tenantId, options = {}) {
  const { limit = 50 } = options;
  return this.find({ tenantId })
    .populate("billId", "billingMonth totalAmount status")
    .sort({ createdAt: -1 })
    .limit(limit);
};

/**
 * Get payments for a specific bill
 */
paymentSchema.statics.getPaymentsForBill = function (billId) {
  return this.find({ billId }).sort({ createdAt: -1 });
};

// ============================================================================
// EXPORT
// ============================================================================

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
