/**
 * ============================================================================
 * BED HISTORY MODEL
 * ============================================================================
 *
 * Tracks historical occupancy of each bed.
 * Created when a tenant checks in, updated when they check out.
 *
 * BENEFITS:
 * - Occupancy analytics
 * - Tenant stay history
 * - Maintenance insights
 *
 * ============================================================================
 */

import mongoose from "mongoose";

const bedHistorySchema = new mongoose.Schema(
  {
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
      required: true,
      index: true,
    },
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reservation",
      default: null,
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
    moveInDate,
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

bedHistorySchema.statics.recordCheckIn = bedHistorySchema.statics.recordMoveIn;
bedHistorySchema.statics.recordCheckOut = bedHistorySchema.statics.recordMoveOut;

bedHistorySchema.pre("validate", function (next) {
  if (!this.moveInDate && this.checkInDate) {
    this.moveInDate = this.checkInDate;
  }
  if (!this.moveOutDate && this.checkOutDate) {
    this.moveOutDate = this.checkOutDate;
  }

  next();
});

// ============================================================================
// EXPORT
// ============================================================================

const BedHistory = mongoose.model("BedHistory", bedHistorySchema);

export default BedHistory;
