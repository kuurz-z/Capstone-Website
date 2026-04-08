/**
 * ============================================================================
 * METER READING MODEL
 * ============================================================================
 *
 * Immutable log of all submeter readings for electricity billing.
 * One document is created per event (move-in, move-out, regular billing).
 *
 * USAGE:
 * - Branch Admin records a reading whenever a tenant moves in/out or
 *   at the regular billing date (e.g. 15th of each month).
 * - The reading value must always be >= the previous reading for the room.
 * - activeTenantIds is a snapshot of who was in the room at recording time.
 *
 * ============================================================================
 */

import mongoose from "mongoose";
import {
  CANONICAL_UTILITY_EVENT_TYPES,
  normalizeUtilityEventType,
} from "../utils/lifecycleNaming.js";

const meterReadingSchema = new mongoose.Schema(
  {
    // --- Room Reference ---
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

    // --- Reading Data ---
    reading: {
      type: Number,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    eventType: {
      type: String,
      enum: CANONICAL_UTILITY_EVENT_TYPES,
      required: true,
      set: normalizeUtilityEventType,
    },

    // --- Tenant Reference (for move-in / move-out events) ---
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // --- Snapshot of all active tenants at time of recording ---
    activeTenantIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // --- Admin who recorded ---
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // --- Optional link to billing period ---
    billingPeriodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillingPeriod",
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

// For fetching readings per room sorted by date
meterReadingSchema.index({ roomId: 1, date: 1 });

// For fetching readings within a billing period
meterReadingSchema.index({ roomId: 1, billingPeriodId: 1 });

// For branch-scoped queries
meterReadingSchema.index({ branch: 1, date: -1 });

meterReadingSchema.pre("validate", function (next) {
  if (this.eventType) {
    this.eventType = normalizeUtilityEventType(this.eventType);
  }

  next();
});

// ============================================================================
// EXPORT
// ============================================================================

export default mongoose.model("MeterReading", meterReadingSchema);
