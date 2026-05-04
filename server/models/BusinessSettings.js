import mongoose from "mongoose";
import { BUSINESS } from "../config/constants.js";

const settingsChangeActorSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      default: "",
      trim: true,
    },
    role: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false },
);

const branchOverrideSchema = new mongoose.Schema(
  {
    isApplianceFeeEnabled: {
      type: Boolean,
      default: false,
    },
    applianceFeeAmountPerUnit: {
      type: Number,
      default: 0,
      min: 0,
    },
    changedBy: {
      type: settingsChangeActorSchema,
      default: null,
    },
    changedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const businessSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "global",
    },
    reservationFeeAmount: {
      type: Number,
      default: BUSINESS.DEPOSIT_AMOUNT,
      min: 0,
    },
    penaltyRatePerDay: {
      type: Number,
      default: BUSINESS.PENALTY_RATE_PER_DAY,
      min: 0,
    },
    maxPenaltyCapPercent: {
      type: Number,
      default: BUSINESS.MAX_PENALTY_CAP_PERCENT,
      min: 0,
      max: 100,
    },
    defaultElectricityRatePerKwh: {
      type: Number,
      default: BUSINESS.DEFAULT_ELECTRICITY_RATE_PER_KWH,
      min: 0,
    },
    defaultWaterRatePerUnit: {
      type: Number,
      default: 0,
      min: 0,
    },
    noShowGraceDays: {
      type: Number,
      default: BUSINESS.NOSHOW_GRACE_DAYS,
      min: 0,
    },
    stalePendingHours: {
      type: Number,
      default: BUSINESS.STALE_PENDING_HOURS,
      min: 0,
    },
    staleVisitPendingHours: {
      type: Number,
      default: BUSINESS.STALE_VISIT_PENDING_HOURS,
      min: 0,
    },
    visitPendingWarnDays: {
      type: Number,
      default: BUSINESS.VISIT_PENDING_WARN_DAYS,
      min: 0,
    },
    staleVisitApprovedHours: {
      type: Number,
      default: BUSINESS.STALE_VISIT_APPROVED_HOURS,
      min: 0,
    },
    stalePaymentPendingHours: {
      type: Number,
      default: BUSINESS.STALE_PAYMENT_PENDING_HOURS,
      min: 0,
    },
    archiveCancelledAfterDays: {
      type: Number,
      default: BUSINESS.ARCHIVE_CANCELLED_AFTER_DAYS,
      min: 0,
    },
    branchOverrides: {
      type: Map,
      of: branchOverrideSchema,
      default: () => ({
        "gil-puyat": {
          isApplianceFeeEnabled: false,
          applianceFeeAmountPerUnit: 0,
          changedBy: null,
          changedAt: null,
        },
        guadalupe: {
          isApplianceFeeEnabled: true,
          applianceFeeAmountPerUnit: 200,
          changedBy: null,
          changedAt: null,
        },
      }),
    },
    changedBy: {
      type: settingsChangeActorSchema,
      default: null,
    },
    changedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

export default mongoose.model("BusinessSettings", businessSettingsSchema);
