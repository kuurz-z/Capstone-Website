import mongoose from "mongoose";
import { ROOM_BRANCHES } from "../config/branches.js";
import {
  CANONICAL_UTILITY_EVENT_TYPES,
  normalizeUtilityEventType,
} from "../utils/lifecycleNaming.js";
import {
  isValidOptionalPhysicalMeterReading,
  isValidPhysicalMeterReading,
} from "../utils/physicalMeterReading.js";

const segmentSchema = new mongoose.Schema(
  {
    segmentIndex: { type: Number, required: true },
    periodLabel: { type: String, required: true },
    readingFrom: { type: Number, required: true },
    readingTo: { type: Number, required: true },
    unitsConsumed: { type: Number, required: true },
    totalCost: { type: Number, required: true },
    activeTenantCount: { type: Number, required: true },
    sharePerTenantUnits: { type: Number, required: true },
    sharePerTenantCost: { type: Number, required: true },
    startDate: { type: Date },
    endDate: { type: Date },
    activeTenantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    coveredTenantNames: [{ type: String }],
    startEventType: {
      type: String,
      enum: CANONICAL_UTILITY_EVENT_TYPES,
      default: "regularBilling",
      set: normalizeUtilityEventType,
    },
    endEventType: {
      type: String,
      enum: CANONICAL_UTILITY_EVENT_TYPES,
      default: "regularBilling",
      set: normalizeUtilityEventType,
    },
  },
  { _id: false },
);

const overheadSegmentSchema = new mongoose.Schema(
  {
    segmentIndex: { type: Number },
    periodLabel: { type: String },
    startDate: { type: Date },
    endDate: { type: Date },
    readingFrom: { type: Number },
    readingTo: { type: Number },
    kwhConsumed: { type: Number },
    cost: { type: Number },
    reason: { type: String, default: "ZERO_OCCUPANCY_WITH_CONSUMPTION" },
  },
  { _id: false },
);

export const UTILITY_REVIEW_OUTCOMES = Object.freeze([
  "RECONSTRUCTED_FROM_VERIFIED_READING",
  "ACCOUNTING_ADJUSTMENT",
  "APPROVED_NON_CHARGE",
  "OTHER_REVIEWED_DISPOSITION",
]);

const manualReviewSchema = new mongoose.Schema(
  {
    reviewType: { type: String, required: true },
    reason: { type: String, required: true },
    openedAt: { type: Date, required: true },
    openedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reviewedAt: { type: Date, default: null },
    observationAt: { type: Date, required: true },
    affectedIntervalStart: { type: Date, required: true },
    affectedIntervalEnd: { type: Date, required: true },
    evidenceReferences: [{ type: String }],
    reviewOwner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reviewReference: { type: String, required: true },
    historicalGapId: { type: mongoose.Schema.Types.ObjectId, ref: "UtilityHistoricalGap", required: true },
    resolution: {
      outcome: { type: String, enum: UTILITY_REVIEW_OUTCOMES, default: null },
      explanation: { type: String, default: null },
      evidenceReferences: [{ type: String }],
      approvalReference: { type: String, default: null },
      financialDispositionType: { type: String, default: null },
      financialAmount: { type: Number, default: null },
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      resolvedAt: { type: Date, default: null },
      auditLogId: { type: String, default: null },
    },
  },
  { _id: false },
);

const tenantSummarySchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reservation",
      default: null,
    },
    tenantName: { type: String, required: true },
    totalUsage: { type: Number, required: true },
    billAmount: { type: Number, required: true },
    coveredDays: { type: Number, default: null },
    shareFactor: { type: Number, default: null },
    allocationRule: { type: String, default: null },
    billingBasis: { type: String, default: null },
    overlapStart: { type: Date, default: null },
    overlapEnd: { type: Date, default: null },
    billId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bill",
      default: null,
    },
    // True when this tenant's charge for the period was already settled on a
    // Room Transfer's transfer_settlement Bill (UtilityFinalization). No
    // separate draft Bill was created here; `billId` points at that Bill.
    settledOnTransfer: { type: Boolean, default: false },
    finalizedAmount: { type: Number, default: null },
    reconciliationVariance: { type: Number, default: null },
    reconciliationFlagged: { type: Boolean, default: false },
  },
  { _id: false },
);

const utilityPeriodSchema = new mongoose.Schema(
  {
    // No default: existing occupancy-day and migrated legacy snapshots stay legacy.
    calculationVersion: { type: String },
    unit: { type: String, enum: ['m3', 'kWh'] },
    pricingSnapshot: {
      ratePerUnit: Number,
      unit: String,
      capturedAt: Date,
      recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    pricingAudit: [{previousRate:Number,ratePerUnit:Number,capturedAt:Date,recordedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}}],
    calculationFingerprint: String,
    calculationInputs: mongoose.Schema.Types.Mixed,
    meterEvents: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    utilityType: {
      type: String,
      enum: ["electricity", "water"],
      required: true,
      index: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },
    branch: {
      type: String,
      enum: ROOM_BRANCHES,
      required: true,
      index: true,
    },

    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      default: null,
    },

    startReading: {
      type: Number,
      required: true,
      validate: {
        validator: isValidPhysicalMeterReading,
        message: "Opening meter reading must be finite and non-negative.",
      },
    },
    endReading: {
      type: Number,
      default: null,
      validate: {
        validator: isValidOptionalPhysicalMeterReading,
        message: "Closing meter reading must be finite and non-negative.",
      },
    },

    ratePerUnit: {
      type: Number,
      required: true,
    },

    // --- Embedded Results (replaces BillingResult and final amounts of WaterRecord) ---
    computedTotalUsage: {
      type: Number,
      default: 0,
    },
    computedTotalCost: {
      type: Number,
      default: 0,
    },
    verified: {
      type: Boolean,
      default: true,
    },
    segments: [segmentSchema],
    tenantSummaries: [tenantSummarySchema],
    // Plan 1 (D1): Branch overhead segments for vacant room consumption
    overheadSegments: [overheadSegmentSchema],

    status: {
      type: String,
      // "manual_review_required" — system has detected a data issue (e.g. missing
      // intermediate meter reading) that prevents confident billing. An admin must
      // review and resolve before the period can be closed. See Spec §18.6.
      enum: ["open", "manual_review_required", "closed", "revised"],
      default: "open",
      index: true,
    },

    // --- Manual Review Fields (Spec §18.6) ---
    // Populated when status transitions to "manual_review_required".
    // Cleared (set back to null) when an admin resolves the issue and
    // transitions the period back to "open" for a retry close.
    manualReviewReason: {
      type: String,
      default: null,
      // One of: "missing_move_in_reading", "missing_move_out_reading",
      // "negative_consumption", "segment_date_overlap",
      // "share_reconciliation_failure", "transfer_utility_reconciliation_variance"
    },
    manualReviewResolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    manualReviewResolvedAt: {
      type: Date,
      default: null,
    },
    manualReview: { type: manualReviewSchema, default: null },

    closedAt: {
      type: Date,
      default: null,
    },
    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    revised: {
      type: Boolean,
      default: false,
    },
    revisionNote: {
      type: String,
      default: null,
    },

    // Set at close when one or more transferring tenants had their source-room
    // electricity for THIS period finalized on transfer day (UtilityFinalization).
    // The invariant: draftBillTotal + finalizedTotal ≈ canonicalTotal. `flagged`
    // true => variance beyond tolerance; manualReviewReason is also set.
    transferFinalizationReconciliation: {
      finalizedTotal: { type: Number, default: null },
      draftBillTotal: { type: Number, default: null },
      canonicalTotal: { type: Number, default: null },
      variance: { type: Number, default: null },
      flagged: { type: Boolean, default: false },
      reconciledAt: { type: Date, default: null },
    },
    revisedAt: {
      type: Date,
      default: null,
    },

    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    // The lifecycle-active unique index is deployed only by the controlled
    // migration after its duplicate scan, never implicitly at app startup.
    autoIndex: false,
  },
);

utilityPeriodSchema.pre("validate", function (next) {
  if (Array.isArray(this.segments)) {
    this.segments = this.segments.map((segment) => ({
      ...segment,
      startEventType: normalizeUtilityEventType(segment.startEventType),
      endEventType: normalizeUtilityEventType(segment.endEventType),
    }));
  }

  next();
});

// Prevent duplicate periods for the same room, utility type and start boundary.
utilityPeriodSchema.index(
  { utilityType: 1, roomId: 1, startDate: 1 },
  { unique: true, partialFilterExpression: { isArchived: false } },
);
// At most one lifecycle-active cycle may exist for a room/utility. Historical
// closed/revised periods remain unrestricted. Deploy only after the read-only
// lifecycle audit confirms there are no pre-existing conflicts.
utilityPeriodSchema.index(
  { utilityType: 1, roomId: 1 },
  {
    unique: true,
    name: "unique_lifecycle_active_utility_period",
    partialFilterExpression: {
      isArchived: false,
      status: { $in: ["open", "manual_review_required"] },
    },
  },
);
utilityPeriodSchema.index({ branch: 1, status: 1 });

// Exported so controllers and services can reference the status list
// without hard-coding the strings.
export const UTILITY_PERIOD_STATUSES = Object.freeze([
  "open",
  "manual_review_required",
  "closed",
  "revised",
]);

export default mongoose.model("UtilityPeriod", utilityPeriodSchema);
