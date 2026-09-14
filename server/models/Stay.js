import mongoose from "mongoose";
import { ROOM_BRANCHES } from "../config/branches.js";

const STAY_STATUSES = [
  "active",
  "ending_soon",
  // Spec §24.5: Lease term has lapsed but tenant is still occupying.
  // Admin must intervene. Billing may continue ONLY with explicit approval.
  // Never auto-transitions back to "active" — requires a recorded decision.
  "expired_occupancy_continuing",
  "completed",
  "terminated",
  "renewed",
];

const staySchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reservation",
      required: true,
      index: true,
    },
    branch: {
      type: String,
      enum: ROOM_BRANCHES,
      required: true,
      index: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },
    bedId: {
      type: String,
      required: true,
      index: true,
    },
    bunkBlock: {
      type: String,
      default: "A",
    },
    bedCode: {
      type: String,
      default: null,
    },
    leaseStartDate: {
      type: Date,
      required: true,
    },
    leaseEndDate: {
      type: Date,
      required: true,
    },
    monthlyRent: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: STAY_STATUSES,
      default: "active",
      index: true,
    },
    previousStayId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stay",
      default: null,
      index: true,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    endReason: {
      type: String,
      default: "",
    },
    renewalNotes: {
      type: String,
      default: "",
    },
    // Links this Stay back to the accepted Reservation.renewalOffers[]
    // entry (offerId) it originated from, so the renewal successor Contract
    // can consume the tenant's ACCEPTED (frozen) canonical pricing instead
    // of re-resolving live pricing that could drift if BusinessSettings/Room
    // pricing changes between acceptance and Contract generation. Null for
    // renewals created outside the offer flow (legacy/manual).
    renewalOfferId: {
      type: String,
      default: null,
    },
    transferNotes: {
      type: String,
      default: "",
    },
    moveOutNotes: {
      type: String,
      default: "",
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

    // -------------------------------------------------------------------------
    // MONTH-TO-MONTH APPROVAL (Spec §24.5)
    // -------------------------------------------------------------------------
    // Required before any bill can be generated under "expired_occupancy_continuing".
    // Admin must explicitly approve temporary continuation with a reason and rate source.
    // Approval has an expiry date — after which admin must re-approve.
    monthToMonthApproved: {
      type: Boolean,
      default: false,
    },
    monthToMonthApprovedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    monthToMonthApprovedAt: {
      type: Date,
      default: null,
    },
    monthToMonthApprovalReason: {
      type: String,
      default: null,
      trim: true,
      // Required (non-blank) when monthToMonthApproved is set to true
    },
    monthToMonthRateSource: {
      type: String,
      enum: [
        "previous_rate",          // Continue at the same rate as the expired lease
        "current_published_rate", // Apply the current room published rate
        "custom_rate",            // Admin sets a specific rate (requires monthToMonthCustomRate)
        null,
      ],
      default: null,
    },
    monthToMonthCustomRate: {
      type: Number,
      default: null,
      min: 0,
      // Required when monthToMonthRateSource = "custom_rate"
    },
    monthToMonthApprovalExpiry: {
      type: Date,
      default: null,
      // After this date, the approval lapses and admin must re-approve.
      // Default: 30 days from approval date (set by BusinessSettings if configured).
    },
  },
  {
    timestamps: true,
  },
);

staySchema.index(
  { tenantId: 1, reservationId: 1, status: 1 },
  {
    partialFilterExpression: { status: "active" },
  },
);
staySchema.index({ reservationId: 1, leaseStartDate: -1 });

// ============================================================================
// PRE-SAVE GUARD — Month-to-Month Approval Completeness (Spec §24.5)
// ============================================================================
// When admin sets monthToMonthApproved = true, they must also supply:
//   monthToMonthApprovalReason (non-blank)
//   monthToMonthRateSource (non-null)
//   monthToMonthCustomRate (if rateSource = "custom_rate")

staySchema.pre("save", function guardMonthToMonthApproval(next) {
  if (!this.monthToMonthApproved) return next();

  const hasReason =
    typeof this.monthToMonthApprovalReason === "string" &&
    this.monthToMonthApprovalReason.trim().length > 0;
  if (!hasReason) {
    return next(
      new Error(
        `[Stay pre-save] monthToMonthApproved=true requires a non-empty ` +
          `monthToMonthApprovalReason. Record why temporary continuation was approved.`,
      ),
    );
  }

  if (!this.monthToMonthRateSource) {
    return next(
      new Error(
        `[Stay pre-save] monthToMonthApproved=true requires monthToMonthRateSource ` +
          `to be set. Choose "previous_rate", "current_published_rate", or "custom_rate".`,
      ),
    );
  }

  if (this.monthToMonthRateSource === "custom_rate") {
    const hasRate =
      this.monthToMonthCustomRate !== null &&
      this.monthToMonthCustomRate !== undefined &&
      this.monthToMonthCustomRate >= 0;
    if (!hasRate) {
      return next(
        new Error(
          `[Stay pre-save] monthToMonthRateSource="custom_rate" requires ` +
            `a non-null monthToMonthCustomRate value.`,
        ),
      );
    }
  }

  next();
});

const Stay = mongoose.model("Stay", staySchema);

export { STAY_STATUSES };
export default Stay;
