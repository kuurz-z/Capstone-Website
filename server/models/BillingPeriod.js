/**
 * ============================================================================
 * BILLING PERIOD MODEL
 * ============================================================================
 *
 * Tracks open/closed billing periods per room.
 * Each room has independent billing periods.
 *
 * LIFECYCLE:
 * - Branch Admin opens a period with a start reading + rate per kWh.
 * - Period stays "open" while readings accumulate (move-in / move-out).
 * - Branch Admin closes the period with an end reading → triggers computation.
 * - A closed period can be "revised" by re-running computation.
 *
 * RATE VERSIONING:
 * - ratePerKwh is locked at period creation time.
 * - Historical bills are never affected by future rate changes.
 *
 * ============================================================================
 */

import mongoose from "mongoose";
import { ROOM_BRANCHES } from "../config/branches.js";

const billingPeriodSchema = new mongoose.Schema(
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
      enum: ROOM_BRANCHES,
      required: true,
      index: true,
    },

    // --- Period Date Range ---
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      default: null,
    },

    // --- Meter Readings at Boundaries ---
    startReading: {
      type: Number,
      required: true,
    },
    endReading: {
      type: Number,
      default: null,
    },

    // --- Electricity Rate ---
    ratePerKwh: {
      type: Number,
      required: true,
    },

    // --- Status ---
    status: {
      type: String,
      enum: ["open", "closed", "revised"],
      default: "open",
      index: true,
    },

    // --- Close Metadata ---
    closedAt: {
      type: Date,
      default: null,
    },
    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

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

// Prevent duplicate periods for the same room + start date
billingPeriodSchema.index({ roomId: 1, startDate: 1 }, { unique: true });

// For branch-scoped queries
billingPeriodSchema.index({ branch: 1, status: 1 });

// ============================================================================
// EXPORT
// ============================================================================

export default mongoose.model("BillingPeriod", billingPeriodSchema);
