/**
 * ============================================================================
 * BILLING RESULT MODEL
 * ============================================================================
 *
 * Stores the computed output of the segment-based billing engine.
 * One document per closed billing period.
 *
 * Contains:
 * - segments[]: each consumption interval with per-tenant kWh shares
 * - tenantSummaries[]: final totals per tenant (kWh + bill amount)
 * - verified: whether sum of all tenant kWh equals total room kWh (±0.01)
 *
 * SNAPSHOT PATTERN:
 * - Tenant names and segment labels are snapshotted at computation time.
 * - This ensures billing records remain readable even if tenants are later
 *   archived or rooms are renamed.
 *
 * ============================================================================
 */

import mongoose from "mongoose";

// --- Segment Sub-Schema ---
const segmentSchema = new mongoose.Schema(
  {
    segmentIndex: { type: Number, required: true },
    periodLabel: { type: String, required: true }, // e.g. "Mar 15 – Mar 25"
    readingFrom: { type: Number, required: true },
    readingTo: { type: Number, required: true },
    kwhConsumed: { type: Number, required: true },
    totalCost: { type: Number, required: true },
    activeTenantCount: { type: Number, required: true },
    sharePerTenantKwh: { type: Number, required: true },
    sharePerTenantCost: { type: Number, required: true },
    startDate: { type: Date },
    endDate: { type: Date },
    activeTenantIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    ],
    coveredTenantNames: [{ type: String }], // snapshot for display
  },
  { _id: false },
);

// --- Tenant Summary Sub-Schema ---
const tenantSummarySchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tenantName: { type: String, required: true },
    totalKwh: { type: Number, required: true },
    billAmount: { type: Number, required: true },
    billId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bill",
      default: null,
    },
  },
  { _id: false },
);

// --- Main Schema ---
const billingResultSchema = new mongoose.Schema(
  {
    // --- References ---
    billingPeriodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillingPeriod",
      required: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    branch: {
      type: String,
      enum: ["gil-puyat", "guadalupe"],
      required: true,
      index: true,
    },

    // --- Computation Metadata ---
    computedAt: {
      type: Date,
      default: Date.now,
    },
    computedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    ratePerKwh: {
      type: Number,
      required: true,
    },
    totalRoomKwh: {
      type: Number,
      required: true,
    },
    totalRoomCost: {
      type: Number,
      required: true,
    },

    // --- Verification ---
    verified: {
      type: Boolean,
      default: true,
    },

    // --- Computed Data ---
    segments: [segmentSchema],
    tenantSummaries: [tenantSummarySchema],

    // --- Revision Metadata ---
    revised: {
      type: Boolean,
      default: false,
    },
    revisionNote: {
      type: String,
      default: null,
    },
    revisedAt: {
      type: Date,
      default: null,
    },

    // --- Soft Delete ---
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true },
);

// ============================================================================
// INDEXES
// ============================================================================

// One result per billing period (can be overwritten on revision)
billingResultSchema.index({ billingPeriodId: 1 }, { unique: true });

// For branch-scoped queries
billingResultSchema.index({ branch: 1, computedAt: -1 });

// ============================================================================
// EXPORT
// ============================================================================

export default mongoose.model("BillingResult", billingResultSchema);
