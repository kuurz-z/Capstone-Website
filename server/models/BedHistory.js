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
    checkInDate: {
      type: Date,
      required: true,
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

bedHistorySchema.index({ roomId: 1, bedId: 1, checkInDate: -1 });
bedHistorySchema.index({ tenantId: 1, checkInDate: -1 });

// ============================================================================
// STATICS
// ============================================================================

/**
 * Record a check-in
 */
bedHistorySchema.statics.recordCheckIn = async function (data) {
  return this.create({
    bedId: data.bedId,
    roomId: data.roomId,
    tenantId: data.tenantId,
    reservationId: data.reservationId || null,
    checkInDate: data.checkInDate || new Date(),
  });
};

/**
 * Record a check-out
 */
bedHistorySchema.statics.recordCheckOut = async function (bedId, tenantId) {
  const record = await this.findOne({
    bedId,
    tenantId,
    checkOutDate: null,
  }).sort({ checkInDate: -1 });

  if (record) {
    record.checkOutDate = new Date();
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
    .sort({ checkInDate: -1 });
};

// ============================================================================
// EXPORT
// ============================================================================

const BedHistory = mongoose.model("BedHistory", bedHistorySchema);

export default BedHistory;
