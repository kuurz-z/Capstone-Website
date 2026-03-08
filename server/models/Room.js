/**
 * ============================================================================
 * ROOM MODEL
 * ============================================================================
 *
 * Stores dormitory room information.
 *
 * BRANCHES:
 * - Each room belongs to a specific branch (gil-puyat or guadalupe)
 * - Rooms cannot be "general" - they must have a physical location
 *
 * ROOM TYPES:
 * - private: Single occupancy
 * - double-sharing: 2 occupants
 * - quadruple-sharing: 4 occupants
 *
 * OCCUPANCY:
 * - capacity: Maximum number of tenants
 * - currentOccupancy: Current number of tenants
 * - isFull virtual: Returns true when room is at capacity
 *
 * SOFT DELETE:
 * - Use isArchived=true to soft delete
 * - Archived rooms are hidden from listings
 *
 * ============================================================================
 */

import mongoose from "mongoose";

// ============================================================================
// SCHEMA DEFINITION
// ============================================================================

const roomSchema = new mongoose.Schema(
  {
    // --- Basic Info ---
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    roomNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    description: {
      type: String,
      default: "",
    },

    // --- Location Details ---
    floor: {
      type: Number,
      default: 1,
      min: 1,
    },

    // --- Branch ---
    branch: {
      type: String,
      required: true,
      enum: ["gil-puyat", "guadalupe"],
      index: true,
    },

    // --- Room Type & Capacity ---
    type: {
      type: String,
      required: true,
      enum: ["private", "double-sharing", "quadruple-sharing"],
    },
    capacity: {
      type: Number,
      required: true,
      min: 1,
    },
    currentOccupancy: {
      type: Number,
      default: 0,
      min: 0,
    },

    // --- Pricing ---
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    monthlyPrice: {
      type: Number,
      default: null,
    },

    // --- Features ---
    amenities: {
      type: [String],
      default: [],
    },
    policies: {
      type: [String],
      default: [],
    },
    intendedTenant: {
      type: String,
      default: "",
    },
    images: {
      type: [String],
      default: [],
    },

    // --- Bed Details ---
    beds: {
      type: [
        {
          id: { type: String },
          position: {
            type: String,
            enum: ["upper", "lower", "single"],
            required: true,
          },
          available: { type: Boolean, default: true },
          occupiedBy: {
            userId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
              default: null,
            },
            reservationId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "Reservation",
              default: null,
            },
            occupiedSince: {
              type: Date,
              default: null,
            },
          },
        },
      ],
      default: [],
    },

    // --- Availability ---
    available: {
      type: Boolean,
      default: true,
    },

    // --- Soft Delete ---
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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

roomSchema.index({ branch: 1, type: 1 });
roomSchema.index({ branch: 1, available: 1 });
roomSchema.index({ isArchived: 1, available: 1 });

// ============================================================================
// VIRTUALS
// ============================================================================

/**
 * Check if room is at full capacity
 */
roomSchema.virtual("isFull").get(function () {
  return this.currentOccupancy >= this.capacity;
});

/**
 * Get available slots
 */
roomSchema.virtual("availableSlots").get(function () {
  return Math.max(0, this.capacity - this.currentOccupancy);
});

// ============================================================================
// METHODS
// ============================================================================

/**
 * Soft delete this room
 */
roomSchema.methods.archive = async function (archivedById = null) {
  this.isArchived = true;
  this.available = false;
  this.archivedAt = new Date();
  this.archivedBy = archivedById;
  return this.save();
};

/**
 * Restore an archived room
 */
roomSchema.methods.restore = async function () {
  this.isArchived = false;
  this.available = true;
  this.archivedAt = null;
  this.archivedBy = null;
  return this.save();
};

/**
 * Mark a bed as occupied
 * @param {string} bedId - The bed ID to occupy
 * @param {string} userId - User ID occupying the bed
 * @param {string} reservationId - Reservation ID for tracking
 * @returns {boolean} - true if successful, false if bed not found
 */
roomSchema.methods.occupyBed = function (bedId, userId, reservationId) {
  const bed = this.beds.find((b) => b.id === bedId);
  if (!bed) return false;

  bed.available = false;
  bed.occupiedBy = {
    userId,
    reservationId,
    occupiedSince: new Date(),
  };
  return true;
};

/**
 * Mark a bed as vacant
 * @param {string} bedId - The bed ID to vacate
 * @returns {boolean} - true if successful, false if bed not found
 */
roomSchema.methods.vacateBed = function (bedId) {
  const bed = this.beds.find((b) => b.id === bedId);
  if (!bed) return false;

  bed.available = true;
  bed.occupiedBy = {
    userId: null,
    reservationId: null,
    occupiedSince: null,
  };
  return true;
};

/**
 * Get all available beds
 * @returns {array} - Array of available beds
 */
roomSchema.methods.getAvailableBeds = function () {
  return this.beds.filter((bed) => bed.available);
};

/**
 * Get all occupied beds
 * @returns {array} - Array of occupied beds
 */
roomSchema.methods.getOccupiedBeds = function () {
  return this.beds.filter((bed) => !bed.available);
};

/**
 * Check if a specific bed is available
 * @param {string} bedId - The bed ID to check
 * @returns {boolean} - true if bed is available
 */
roomSchema.methods.isBedAvailable = function (bedId) {
  const bed = this.beds.find((b) => b.id === bedId);
  return bed ? bed.available : false;
};

/**
 * Increase room occupancy (ATOMIC — prevents race conditions)
 * Uses MongoDB $inc to guarantee no two concurrent operations can overbook.
 *
 * @param {string} roomId - The room ObjectId
 * @returns {Promise<Room|null>} Updated room or null if already at capacity
 */
roomSchema.statics.atomicIncreaseOccupancy = async function (roomId) {
  return this.findOneAndUpdate(
    {
      _id: roomId,
      $expr: { $lt: ["$currentOccupancy", "$capacity"] },
    },
    [
      {
        $set: {
          currentOccupancy: { $add: ["$currentOccupancy", 1] },
          available: {
            $lt: [{ $add: ["$currentOccupancy", 1] }, "$capacity"],
          },
        },
      },
    ],
    { new: true },
  );
};

/**
 * Decrease room occupancy (ATOMIC — prevents negative values)
 *
 * @param {string} roomId - The room ObjectId
 * @returns {Promise<Room|null>} Updated room or null if already at 0
 */
roomSchema.statics.atomicDecreaseOccupancy = async function (roomId) {
  return this.findOneAndUpdate(
    {
      _id: roomId,
      currentOccupancy: { $gt: 0 },
    },
    [
      {
        $set: {
          currentOccupancy: { $subtract: ["$currentOccupancy", 1] },
          available: true,
        },
      },
    ],
    { new: true },
  );
};

/**
 * Increase room occupancy (instance method — backward compat)
 */
roomSchema.methods.increaseOccupancy = function () {
  this.currentOccupancy = Math.min(this.currentOccupancy + 1, this.capacity);
  this.available = this.currentOccupancy < this.capacity;
  return this;
};

/**
 * Decrease room occupancy (instance method — backward compat)
 */
roomSchema.methods.decreaseOccupancy = function () {
  this.currentOccupancy = Math.max(this.currentOccupancy - 1, 0);
  this.available = this.currentOccupancy < this.capacity;
  return this;
};

/**
 * Update room availability based on current occupancy
 */
roomSchema.methods.updateAvailability = function () {
  this.available = this.currentOccupancy < this.capacity && !this.isArchived;
  return this;
};

// ============================================================================
// STATICS
// ============================================================================

/**
 * Find all active (non-archived) rooms
 */
roomSchema.statics.findActive = function (filter = {}) {
  return this.find({ ...filter, isArchived: false });
};

/**
 * Find all archived rooms
 */
roomSchema.statics.findArchived = function (filter = {}) {
  return this.find({ ...filter, isArchived: true });
};

/**
 * Find available rooms for a branch
 */
roomSchema.statics.findAvailable = function (branch = null) {
  const filter = { isArchived: false, available: true };
  if (branch) filter.branch = branch;
  return this.find(filter);
};

// ============================================================================
// EXPORT
// ============================================================================

const Room = mongoose.model("Room", roomSchema);

export default Room;
