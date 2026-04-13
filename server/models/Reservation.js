/**
 * ============================================================================
 * RESERVATION MODEL
 * ============================================================================
 *
 * Stores room reservation/booking information.
 *
 * WORKFLOW:
 * 1. User creates reservation (status: pending)
 * 2. User completes visit + details + payment (status: reserved)
 * 3. Admin verifies move-in (status: moveIn)
 * 4. Tenant moves out (status: moveOut)
 *
 * CANCELLATION:
 * - Reservations can be cancelled before move-in
 * - Cancelled reservations remain in system for records
 *
 * PAYMENT:
 * - paymentStatus tracks payment progress
 * - pending → partial → paid
 *
 * SOFT DELETE:
 * - Use isArchived=true to soft delete
 * - Archived reservations are hidden from active lists
 *
 * ============================================================================
 */

import mongoose from "mongoose";
import {
  CANONICAL_RESERVATION_STATUSES,
  normalizeReservationStatus,
} from "../utils/lifecycleNaming.js";

const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const RESERVATION_CODE_PREFIX = "RES-";
const VISIT_CODE_PREFIX = "VIS-";

const generateRandomCode = (prefix, length = 6) => {
  let code = prefix;
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return code;
};

// ============================================================================
// SCHEMA DEFINITION
// ============================================================================

const reservationSchema = new mongoose.Schema(
  {
    // --- Reservation ID & References ---
    reservationCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    // User-facing visit pass code — generated when visit is scheduled (before payment)
    // Format: VIS-XXXXXX (6 alphanumeric chars)
    visitCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    paymentReference: {
      type: String,
      unique: true,
      sparse: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    currentStayId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stay",
      default: null,
      index: true,
    },
    latestStayStatus: {
      type: String,
      default: "",
      index: true,
    },

    // Bed Assignment
    selectedBed: {
      id: String,
      position: String, // "upper", "lower", "single"
    },

    // =========================================================================
    // STAGE 1: SUMMARY
    // =========================================================================
    targetMoveInDate: Date,
    leaseDuration: Number,
    billingEmail: String,
    roomConfirmed: {
      type: Boolean,
      default: false,
    },

    // =========================================================================
    // STAGE 2: VISIT
    // =========================================================================
    viewingType: {
      type: String,
      default: "inperson",
    },
    visitDate: Date,
    visitTime: String,
    // When the tenant submitted the visit schedule request (≠ the visit appointment date)
    visitScheduledAt: {
      type: Date,
      default: null,
    },
    isOutOfTown: Boolean,
    currentLocation: String,
    scheduleApproved: {
      type: Boolean,
      default: false,
    },
    visitApproved: {
      type: Boolean,
      default: false,
    },
    // Timestamp of when admin approved the visit schedule
    scheduleApprovedAt: {
      type: Date,
      default: null,
    },

    // Visit Schedule Rejection
    scheduleRejected: {
      type: Boolean,
      default: false,
    },
    scheduleRejectionReason: {
      type: String,
      default: null,
    },
    scheduleRejectedAt: {
      type: Date,
      default: null,
    },
    scheduleRejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Visit History — each schedule/rejection attempt is logged here
    visitHistory: {
      type: [
        {
          visitDate: Date,
          visitTime: String,
          viewingType: { type: String, default: "inperson" },
          status: { type: String, enum: ["pending", "rejected", "approved", "cancelled"], default: "pending" },
          rejectionReason: String,
          scheduledAt: { type: Date, default: Date.now },
          rejectedAt: Date,
          rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          approvedAt: Date,
        },
      ],
      default: [],
    },

    // =========================================================================
    // STAGE 3: DETAILS
    // =========================================================================

    // Photo Documents
    selfiePhotoUrl: String,

    // Personal Information
    firstName: String,
    lastName: String,
    middleName: String,
    nickname: String,
    mobileNumber: String,
    birthday: Date,
    maritalStatus: String, // "single", "married", "divorced", "widowed"
    nationality: String,
    educationLevel: String, // "highschool", "college", "graduate", "other"

    // Address Information
    address: {
      region: String,
      unitHouseNo: String,
      street: String,
      barangay: String,
      city: String,
      province: String,
    },

    // Identity Documents
    validIDFrontUrl: String,
    validIDBackUrl: String,
    validIDType: String,
    nbiClearanceUrl: String,
    nbiReason: String,
    companyIDUrl: String,
    companyIDReason: String,
    personalNotes: String,

    // Emergency Contact
    emergencyContact: {
      name: String,
      relationship: String,
      contactNumber: String,
    },
    healthConcerns: String,

    // Employment Information
    employment: {
      employerSchool: String,
      employerAddress: String,
      employerContact: String,
      startDate: Date,
      occupation: String,
      previousEmployment: String,
    },

    // Dorm-Related Questions
    preferredRoomType: String, // "private", "double-sharing", "quadruple-sharing"
    preferredRoomNumber: String,
    referralSource: String,
    referrerName: String,
    estimatedMoveInTime: String,
    workSchedule: String, // "day", "night", "variable", "others"
    workScheduleOther: String,

    // Agreements
    agreedToPrivacy: {
      type: Boolean,
      default: false,
    },
    agreedToCertification: {
      type: Boolean,
      default: false,
    },
    // When the tenant submitted the application form (personal details step)
    applicationSubmittedAt: {
      type: Date,
      default: null,
    },

    // =========================================================================
    // STAGE 4: PAYMENT
    // =========================================================================
    finalMoveInDate: Date,
    paymentMethod: {
      type: String,
      enum: ["bank", "gcash", "card", "check", "cash", "paymongo", "paymaya", "grab_pay", "maya", "online"],
      default: "bank",
    },
    proofOfPaymentUrl: String,
    paymentDate: {
      type: Date,
      default: null,
    },
    paymongoSessionId: {
      type: String,
      default: null,
    },
    paymongoPaymentId: {
      type: String,
      default: null,
    },

    // --- Reservation Dates & Pricing ---
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
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    reservationFeeAmount: {
      type: Number,
      default: 2000,
      min: 0,
    },
    reservationCreditConsumedAt: {
      type: Date,
      default: null,
    },
    reservationCreditAppliedBillId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bill",
      default: null,
    },
    // Monthly rent locked at booking time (snapshot of room price)
    // Admin can adjust per-tenant for discounts/promotions
    monthlyRent: {
      type: Number,
      default: null, // null = fallback to totalPrice or room.price
    },
    // Recurring custom charges (appliance fees etc.)
    // Auto-populated into each monthly bill; admin can add/remove anytime
    customCharges: {
      type: [
        {
          name: { type: String, required: true },
          amount: { type: Number, required: true, min: 0 },
          addedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    applianceFees: {
      type: Number,
      default: 0,
    },

    // --- Status ---

    status: {
      type: String,
      enum: CANONICAL_RESERVATION_STATUSES,
      default: "pending",
      set: normalizeReservationStatus,
    },

    // --- Overdue Move-In Tracking ---
    moveInExtendedTo: {
      type: Date,
      default: null,
      // Admin can extend the move-in deadline if tenant is late
    },

    // --- Payment ---
    paymentStatus: {
      type: String,
      enum: ["pending", "partial", "paid"],
      default: "pending",
    },

    // --- Notes ---
    notes: {
      type: String,
      default: "",
    },

    // --- Contract ---
    contractFileUrl: {
      type: String,
      default: null,
      // Admin-uploaded signed PDF contract
    },
    leaseExtensions: {
      type: [
        {
          addedMonths: { type: Number, required: true },
          previousDuration: { type: Number, required: true },
          newDuration: { type: Number, required: true },
          extendedAt: { type: Date, default: Date.now },
          extendedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          notes: { type: String, default: "" },
        },
      ],
      default: [],
    },

    // --- Soft Delete ---
    isArchived: {
      type: Boolean,
      default: false,
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
// PRE-SAVE HOOKS
// ============================================================================

/**
 * Generate reservation code before saving only when status is confirmed.
 * Uses retry loop to prevent collision on unique constraint.
 */
reservationSchema.pre("save", async function (next) {
  if (this.status === "reserved" && !this.reservationCode) {
    const Reservation = mongoose.model("Reservation");
    this.reservationCode = await Reservation.generateUniqueReservationCode();
  }

  // Generate visitCode when visitDate is first set (visit scheduling stage)
  if (this.visitDate && !this.visitCode) {
    const Reservation = mongoose.model("Reservation");

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateRandomCode(VISIT_CODE_PREFIX);
      const exists = await Reservation.findOne({ visitCode: code }).lean();
      if (!exists) {
        this.visitCode = code;
        break;
      }
    }

    if (!this.visitCode) {
      // Non-fatal: fall back to a timestamp-derived code
      this.visitCode = "VIS-" + Date.now().toString(36).toUpperCase().slice(-6);
    }
  }

  next();
});

reservationSchema.pre("validate", function (next) {
  if (!this.moveInDate && this.checkInDate) {
    this.moveInDate = this.checkInDate;
  }
  if (!this.moveOutDate && this.checkOutDate) {
    this.moveOutDate = this.checkOutDate;
  }
  if (this.status) {
    this.status = normalizeReservationStatus(this.status);
  }

  next();
});

// NOTE: post('save') hook removed — it queried Room.findById() but never acted
// on the result. Occupancy is managed atomically in controllers via occupancyManager.js.

// ============================================================================
// INDEXES — consolidated, no duplicates
// ============================================================================

// Lookup: user's reservations filtered by status (most common query pattern)
reservationSchema.index({ userId: 1, status: 1 });
// Lookup: room availability — which reservations are on a given room+date
reservationSchema.index({ roomId: 1, moveInDate: 1 });
// Admin listing: filter by status + archive flag together (avoids COLLSCAN)
reservationSchema.index({ status: 1, isArchived: 1 });
// Room-level status queries (e.g. find all moved-in reservations for a room)
reservationSchema.index({ roomId: 1, status: 1 });
// Overdue move-in cron: finds reserved + non-archived by move-in date
reservationSchema.index({ status: 1, targetMoveInDate: 1 });
reservationSchema.index(
  { paymongoSessionId: 1 },
  { sparse: true, partialFilterExpression: { paymongoSessionId: { $type: "string" } } },
);
reservationSchema.index(
  { paymongoPaymentId: 1 },
  { sparse: true, partialFilterExpression: { paymongoPaymentId: { $type: "string" } } },
);
// REMOVED: { branch: 1, status: 1, isArchived: 1 } — phantom index.
// Reservation has no 'branch' field; branch lives on the Room document.
// Use roomId → Room.branch for any branch-level billing queries.

// ============================================================================
// METHODS
// ============================================================================

/**
 * Soft delete this reservation
 */
reservationSchema.methods.archive = async function (archivedById = null) {
  this.isArchived = true;
  this.archivedAt = new Date();
  this.archivedBy = archivedById;
  return this.save();
};

/**
 * Restore an archived reservation
 */
reservationSchema.methods.restore = async function () {
  this.isArchived = false;
  this.archivedAt = null;
  this.archivedBy = null;
  return this.save();
};

/**
 * Cancel this reservation and handle occupancy
 */
reservationSchema.methods.cancel = async function () {
  this.status = "cancelled";
  return this.save();
};

/**
 * Check if this reservation counts toward room occupancy
 * (reserved or moveIn reservations count as occupied)
 */
reservationSchema.methods.countsTowardOccupancy = function () {
  return (
    !this.isArchived &&
    (this.status === "reserved" || this.status === "moveIn")
  );
};

/**
 * Get reservation status for occupancy tracking
 */
reservationSchema.methods.getOccupancyStatus = function () {
  return {
    occupies: this.countsTowardOccupancy(),
    status: this.status,
    bedId: this.selectedBed?.id,
    userId: this.userId,
    reservationId: this._id,
  };
};

// ============================================================================
// STATICS
// ============================================================================

/**
 * Find all active (non-archived) reservations
 */
reservationSchema.statics.findActive = function (filter = {}) {
  return this.find({ ...filter, isArchived: false });
};

/**
 * Find all archived reservations
 */
reservationSchema.statics.findArchived = function (filter = {}) {
  return this.find({ ...filter, isArchived: true });
};

/**
 * Find pending reservations
 */
reservationSchema.statics.findPending = function (filter = {}) {
  return this.find({ ...filter, isArchived: false, status: "pending" });
};

/**
 * Find reserved reservations that are overdue for move-in
 */
reservationSchema.statics.findOverdueMoveIns = function () {
  const now = new Date();
  return this.find({
    status: "reserved",
    isArchived: false,
    $or: [
      // No extension: targetMoveInDate has passed
      { moveInExtendedTo: null, targetMoveInDate: { $lt: now } },
      // Has extension: extension deadline has also passed
      { moveInExtendedTo: { $ne: null, $lt: now } },
    ],
  });
};

reservationSchema.statics.generateUniqueReservationCode = async function () {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRandomCode(RESERVATION_CODE_PREFIX);
    const exists = await this.findOne({ reservationCode: code })
      .select("_id")
      .lean();
    if (!exists) {
      return code;
    }
  }

  throw new Error("Failed to generate unique reservation code after 5 attempts");
};


// ============================================================================
// EXPORT
// ============================================================================

const Reservation = mongoose.model("Reservation", reservationSchema);

export default Reservation;
