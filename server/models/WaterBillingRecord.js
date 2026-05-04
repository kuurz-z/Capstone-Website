import mongoose from "mongoose";

const tenantShareSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reservation",
      default: null,
    },
    tenantName: {
      type: String,
      required: true,
    },
    shareAmount: {
      type: Number,
      required: true,
    },
    billId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bill",
      default: null,
    },
  },
  { _id: false },
);

const waterBillingRecordSchema = new mongoose.Schema(
  {
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
    cycleStart: {
      type: Date,
      required: true,
    },
    cycleEnd: {
      type: Date,
      required: true,
    },
    previousReading: {
      type: Number,
      required: true,
    },
    currentReading: {
      type: Number,
      required: true,
    },
    usage: {
      type: Number,
      required: true,
      default: 0,
    },
    ratePerUnit: {
      type: Number,
      required: true,
    },
    computedAmount: {
      type: Number,
      required: true,
      default: 0,
    },
    finalAmount: {
      type: Number,
      required: true,
      default: 0,
    },
    isOverridden: {
      type: Boolean,
      default: false,
    },
    overrideReason: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["draft", "finalized"],
      default: "draft",
      index: true,
    },
    tenantShares: {
      type: [tenantShareSchema],
      default: [],
    },
    notes: {
      type: String,
      default: "",
    },
    finalizedAt: {
      type: Date,
      default: null,
    },
    finalizedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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

waterBillingRecordSchema.index(
  { roomId: 1, cycleStart: 1 },
  { unique: true },
);
waterBillingRecordSchema.index({ branch: 1, cycleEnd: -1 });
waterBillingRecordSchema.index({ branch: 1, status: 1, cycleEnd: -1 });

export default mongoose.model("WaterBillingRecord", waterBillingRecordSchema);
