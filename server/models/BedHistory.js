/**
 * ============================================================================
 * BED HISTORY MODEL
 * ============================================================================
 *
 * Tracks historical occupancy of each bed.
 * Created when a tenant moves in, updated when they move out.
 *
 * BENEFITS:
 * - Occupancy analytics
 * - Tenant stay history
 * - Maintenance insights
 *
 * ============================================================================
 */

import mongoose from "mongoose";
import { isValidOptionalPhysicalMeterReading } from "../utils/physicalMeterReading.js";

const bedHistorySchema = new mongoose.Schema(
  {
    observedStartAt: Date,
    observedEndAt: Date,
    bedId: {
      type: String,
      required: true,
      index: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reservation",
      default: null,
    },
    stayId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stay",
      default: null,
      index: true,
    },
    branch: {
      type: String,
      default: "",
      index: true,
    },
    moveInDate: {
      type: Date,
      required: true,
    },
    checkInDate: {
      type: Date,
      default: null,
    },
    moveOutDate: {
      type: Date,
      default: null,
    },
    checkOutDate: {
      type: Date,
      default: null,
    },
    effectiveStartDate: {
      type: Date,
      default: null,
    },
    effectiveEndDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "transferred", "completed", "maintenance"],
      default: "active",
      index: true,
    },
    closedByAction: {
      type: String,
      enum: ["transfer", "move_out", "correction", "maintenance", "restored", ""],
      default: "",
    },
    reason: {
      type: String,
      default: "",
    },
    notes: {
      type: String,
      default: "",
    },
    transferSourceReading: {
      type: Number,
      default: null,
      validate: { validator: isValidOptionalPhysicalMeterReading, message: "Transfer source reading must be finite and non-negative." },
    },
    transferTargetReading: {
      type: Number,
      default: null,
      validate: { validator: isValidOptionalPhysicalMeterReading, message: "Transfer destination reading must be finite and non-negative." },
    },
    proratedRentAdjustment: {
      type: Number,
      default: null,
    },

    // --- Source Room Snapshot (transfer only) ---
    // Permanently records what room/price the tenant left.
    // Populated on the closed BedHistory record when closedByAction === "transfer".
    fromRoomSnapshot: {
      type: new mongoose.Schema(
        {
          roomId:       { type: mongoose.Schema.Types.ObjectId, ref: "Room", default: null },
          name:         { type: String, default: "" },
          roomNumber:   { type: String, default: "" },
          type:         { type: String, default: "" },
          floor:        { type: Number, default: null },
          branch:       { type: String, default: "" },
          monthlyPrice: { type: Number, default: 0 },
        },
        { _id: false },
      ),
      default: null,
    },

    // --- Billing State at Transfer ---
    // Records the outstanding balance and pro-rata amounts at the exact
    // moment of transfer. Used for audit trails and billing history display.
    billingSnapshotAtTransfer: {
      type: new mongoose.Schema(
        {
          totalOutstanding: { type: Number, default: 0 },
          totalBilled:      { type: Number, default: 0 },
          totalPaid:        { type: Number, default: 0 },
          proRataDays:      { type: Number, default: 0 },
          proRataRent:      { type: Number, default: 0 },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// ============================================================================
// INDEXES
// ============================================================================

bedHistorySchema.index({ roomId: 1, bedId: 1, moveInDate: -1 });
bedHistorySchema.index({ tenantId: 1, moveInDate: -1 });
// Compound index optimizing the transfer workflow's active-history lookup:
// BedHistory.findOne({ reservationId, tenantId, status: "active" }).sort({ moveInDate: -1 })
bedHistorySchema.index(
  { reservationId: 1, tenantId: 1, status: 1, moveInDate: -1 },
  { name: "transfer_active_history_lookup" },
);

// ============================================================================
// STATICS
// ============================================================================

/**
 * Record a move-in
 */
bedHistorySchema.statics.recordMoveIn = async function (data) {
  const moveInDate = data.moveInDate || data.checkInDate || new Date();
  return this.create({
    bedId: data.bedId,
    roomId: data.roomId,
    tenantId: data.tenantId,
    reservationId: data.reservationId || null,
    stayId: data.stayId || null,
    branch: data.branch || "",
    moveInDate,
    effectiveStartDate: data.effectiveStartDate || moveInDate,
    status: data.status || "active",
    reason: data.reason || "",
    notes: data.notes || "",
  });
};

/**
 * Record a move-out
 */
bedHistorySchema.statics.recordMoveOut = async function (bedId, tenantId) {
  const record = await this.findOne({
    bedId,
    tenantId,
    moveOutDate: null,
  }).sort({ moveInDate: -1 });

  if (record) {
    const moveOutDate = new Date();
    record.moveOutDate = moveOutDate;
    record.effectiveEndDate = moveOutDate;
    record.status = "completed";
    record.closedByAction = "move_out";
    await record.save();
  }
  return record;
};

/**
 * Get history for a specific bed
 */
bedHistorySchema.statics.getBedHistory = function (bedId, roomId) {
  return this.find({ bedId, roomId })
    .populate("tenantId", "firstName lastName email")
    .sort({ moveInDate: -1 });
};

/**
 * Record a maintenance start event
 */
bedHistorySchema.statics.recordMaintenanceStart = async function (data) {
  const startDate = data.startDate || new Date();
  return this.create({
    bedId: data.bedId,
    roomId: data.roomId,
    tenantId: data.tenantId || null,
    branch: data.branch || "",
    moveInDate: startDate,
    effectiveStartDate: startDate,
    status: "maintenance",
    reason: data.reason || "Maintenance Lock",
    notes: data.notes || "Bed placed under maintenance",
  });
};

/**
 * Record a maintenance end (restoration) event
 */
bedHistorySchema.statics.recordMaintenanceEnd = async function (bedId, roomId) {
  const record = await this.findOne({
    bedId,
    roomId,
    status: "maintenance",
    moveOutDate: null,
  }).sort({ moveInDate: -1 });

  if (record) {
    const endDate = new Date();
    record.moveOutDate = endDate;
    record.effectiveEndDate = endDate;
    record.status = "completed";
    record.closedByAction = "restored";
    await record.save();
  }
  return record;
};

bedHistorySchema.statics.recordCheckIn = bedHistorySchema.statics.recordMoveIn;
bedHistorySchema.statics.recordCheckOut = bedHistorySchema.statics.recordMoveOut;

bedHistorySchema.pre("validate", function (next) {
  if (!this.moveInDate && this.checkInDate) {
    this.moveInDate = this.checkInDate;
  }
  if (!this.moveOutDate && this.checkOutDate) {
    this.moveOutDate = this.checkOutDate;
  }
  if (!this.effectiveStartDate && this.moveInDate) {
    this.effectiveStartDate = this.moveInDate;
  }
  if (!this.effectiveEndDate && this.moveOutDate) {
    this.effectiveEndDate = this.moveOutDate;
  }

  next();
});

// ============================================================================
// EXPORT
// ============================================================================

const BedHistory = mongoose.model("BedHistory", bedHistorySchema);

export default BedHistory;
