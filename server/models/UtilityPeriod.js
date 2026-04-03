import mongoose from "mongoose";

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
    billId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bill",
      default: null,
    },
  },
  { _id: false },
);

const utilityPeriodSchema = new mongoose.Schema(
  {
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
      enum: ["gil-puyat", "guadalupe"],
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
    },
    endReading: {
      type: Number,
      default: null,
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

    status: {
      type: String,
      enum: ["open", "closed", "revised"],
      default: "open",
      index: true,
    },

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
  { timestamps: true },
);

// Prevent duplicate open periods for the same room & utility type
utilityPeriodSchema.index(
  { utilityType: 1, roomId: 1, startDate: 1 },
  { unique: true, partialFilterExpression: { isArchived: false } },
);
utilityPeriodSchema.index({ branch: 1, status: 1 });

export default mongoose.model("UtilityPeriod", utilityPeriodSchema);
