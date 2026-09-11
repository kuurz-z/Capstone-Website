/**
 * ============================================================================
 * BILL MODEL
 * ============================================================================
 *
 * Stores billing/invoice records for tenant stays.
 * Supports multi-branch environments and scalable queries for forecasting.
 *
 * BRANCH ISOLATION:
 * - Each bill is tied to a specific branch via reservation.branch
 * - Bills are automatically associated with the tenant's branch
 * - Forecasting queries can aggregate by branch
 *
 * FOR AI FEATURES:
 * - Timestamps for time-series analysis
 * - Status tracking for payment prediction
 * - Historical data for trend forecasting
 *
 * ============================================================================
 */

import mongoose from "mongoose";
import { ROOM_BRANCHES } from "../config/branches.js";
import { PAYMENT_METHODS } from "../config/paymentMethods.js";

// ============================================================================
// SCHEMA DEFINITION
// ============================================================================

const utilityDispatchEntrySchema = new mongoose.Schema(
  {
    state: {
      type: String,
      enum: ["draft", "sent"],
      default: "draft",
    },
    periodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UtilityPeriod",
      default: null,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    issuedAt: {
      type: Date,
      default: null,
    },
    dueDate: {
      type: Date,
      default: null,
    },
    amount: {
      type: Number,
      default: 0,
    },
  },
  { _id: false },
);

const billSchema = new mongoose.Schema(
  {
    waterAllocations: { type: [new mongoose.Schema({
      allocationId: { type: String, required: true },
      utilityPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'UtilityPeriod' },
      roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
      reservationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation' },
      tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      cycleStart: Date, cycleEnd: Date, amount: {type:Number, min:0, required:true},
      usage: {type:Number, default:null}, calculationVersion: {type:String, required:true},
      pricingSnapshot: mongoose.Schema.Types.Mixed,
      state: {type:String, enum:['draft','sent'], default:'draft'},
      publishedAt: Date, issuedAt: Date, dueDate: Date,
    }, {_id:false})], default: undefined },
    // --- Bill Identity ---
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reservation",
      default: null,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    branch: {
      type: String,
      enum: ROOM_BRANCHES,
      required: true,
      index: true,
    },

    // --- Room Bill Link (for room-based billing) ---
    roomBillId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RoomBill",
      default: null,
      index: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      default: null,
    },
    proRataDays: {
      type: Number,
      default: null,
    },
    // Dynamic custom charges (appliance fees, etc.)
    additionalCharges: {
      type: [
        {
          name: { type: String, required: true },
          amount: { type: Number, required: true },
        },
      ],
      default: [],
    },

    // --- Bill Period ---
    billingMonth: {
      type: Date,
      required: true,
      index: true,
    },
    dueDate: {
      type: Date,
      required: false,
      default: null,
    },
    billingCycleStart: {
      type: Date,
      default: null,
    },
    billingCycleEnd: {
      type: Date,
      default: null,
    },
    utilityCycleStart: {
      type: Date,
      default: null,
    },
    utilityCycleEnd: {
      type: Date,
      default: null,
    },
    utilityReadingDate: {
      type: Date,
      default: null,
    },
    isFirstCycleBill: {
      type: Boolean,
      default: false,
    },

    // --- Charges ---
    charges: {
      rent: {
        type: Number,
        default: 0,
      },
      electricity: {
        type: Number,
        default: 0,
      },
      water: {
        type: Number,
        default: 0,
      },
      applianceFees: {
        type: Number,
        default: 0,
      },
      corkageFees: {
        type: Number,
        default: 0,
      },
      penalty: {
        type: Number,
        default: 0,
      },
      // Security-deposit component of a Bill. Non-zero today only on a
      // billType:"transfer_settlement" Bill, where it carries the ADDITIONAL
      // security deposit due because a room transfer raised the required
      // deposit (never the full deposit — only the difference vs. what is
      // already held; see reservation.securityDepositHeld). Kept as its own
      // categorized line so rent and deposit are never flattened together.
      // Old Bills without the field read as 0 (schema default) — safe.
      securityDeposit: {
        type: Number,
        default: 0,
      },
      discount: {
        type: Number,
        default: 0,
      },
    },

    // --- Total ---
    totalAmount: {
      type: Number,
      required: true,
      index: true,
    },
    grossAmount: {
      type: Number,
      default: 0,
    },
    reservationCreditApplied: {
      type: Number,
      default: 0,
    },
    // Portion of this Bill's RENT covered by a consumed TenantCredit (e.g.
    // excess prepaid rent from a cheaper-room transfer). Mirrored into
    // charges.discount so the canonical total already nets it out; this
    // field is the audit pointer. 0 on all legacy Bills (schema default).
    tenantCreditApplied: {
      type: Number,
      default: 0,
    },
    structuredWorkflowVersion: {
      type: String,
      default: null,
      index: true,
    },
    pricingSnapshotVersion: {
      type: Number,
      default: null,
    },
    reservationFeePaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },
    paymongoCheckoutIdempotencyKey: {
      type: String,
      default: null,
    },
    initialPaymentBreakdown: {
      advanceRent: { type: Number, default: 0, min: 0 },
      securityDeposit: { type: Number, default: 0, min: 0 },
      approvedInitialCharges: { type: Number, default: 0, min: 0 },
      reservationFeeCredit: { type: Number, default: 0, min: 0 },
      grossInitialAmount: { type: Number, default: 0, min: 0 },
      initialPaymentTotal: { type: Number, default: 0, min: 0 },
    },
    remainingAmount: {
      type: Number,
      default: 0,
    },

    // --- Payment Status (Legacy combined field — kept for query indexes and backward compat) ---
    // Derived from the 4 independent dimensions below; do NOT write to this directly.
    // Use syncBillAmounts() which reconciles all dimensions and updates this cache.
    status: {
      type: String,
      // "waived"   — bill amount or penalty was cancelled by admin approval (Spec §15)
      // "adjusted" — bill amount was changed by admin with a recorded reason (Spec §15)
      enum: ["draft", "pending", "paid", "overdue", "partially-paid", "voided", "waived", "adjusted"],
      default: "pending",
      index: true,
    },

    // -------------------------------------------------------------------------
    // INDEPENDENT LIFECYCLE STATE DIMENSIONS (Phase 3 — spec docs 01, 02)
    // These are the authoritative source of truth. `status` above is a derived cache.
    // -------------------------------------------------------------------------

    /** Whether the bill has been published and made tenant-visible. */
    publicationState: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
      index: true,
    },

    /**
     * releasedAt — the immutable timestamp of this bill's first-ever
     * transition out of "draft" (the moment it first became tenant-
     * visible). Set exactly once, by syncBillAmounts(), and never
     * overwritten afterward regardless of how many times syncBillAmounts
     * subsequently runs (payment updates, resends, additional utility
     * publishes, overdue processing all call the same function). Distinct
     * from:
     *   - issuedAt/sentAt: the "current" issue date, which can legitimately
     *     move forward as new utility charges are published on top of an
     *     already-released bill — see getVisibleBillIssuedAt().
     *   - publicationState above: a draft/published flag that is not
     *     actually enforced as a tenant-visibility gate anywhere (`status`
     *     is); kept for backward compatibility, not authoritative here.
     *   - createdAt/billingCycleStart/dueDate/meter-reading dates: separate
     *     lifecycle events — never used as a fallback for this field.
     */
    releasedAt: {
      type: Date,
      default: null,
      index: true,
    },

    /** Payment progress state — independent of whether the bill is overdue. */
    paymentState: {
      type: String,
      enum: ["unpaid", "partially-paid", "paid"],
      default: "unpaid",
    },

    /**
     * Due state — tracks whether the bill is past its due date.
     * Independent of paymentState; a bill can be overdue + partially-paid simultaneously.
     */
    dueState: {
      type: String,
      enum: ["current", "overdue"],
      default: "current",
    },

    /**
     * Dispute state (Spec §20 — Billing Dispute Engine)
     * Updated by the BillingDispute controller when a dispute is opened/resolved.
     * When "disputed": late fee accumulation is FROZEN and overdue notices are PAUSED.
     */
    disputeState: {
      type: String,
      enum: [
        "none",       // No active dispute
        "disputed",   // Active dispute open — fees frozen, notices paused
        "upheld",     // Dispute resolved in tenant's favour — bill was adjusted
        "rejected",   // Dispute rejected — original bill stands, fees resume
      ],
      default: "none",
      index: true,
    },
    // Reference to the active BillingDispute document (null when disputeState = "none").
    activeDisputeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillingDispute",
      default: null,
    },

    // --- Overdue Notice Tracking (Spec §21 — 3-Notice State Machine) ---
    // Denormalized counter: updated by the notice controller after each issuance.
    // Range: 0 (no notices sent) to 3 (all three notices sent).
    // When overdueNoticeCount reaches 3, the next admin action must be a
    // TerminationReview — no further notices can be issued.
    overdueNoticeCount: {
      type: Number,
      default: 0,
      min: 0,
      max: 3,
    },
    // Set when the bill's 3-notice process has been referred to a TerminationReview.
    // After this is set, no further notices can be issued on this bill.
    overdueEscalatedAt: {
      type: Date,
      default: null,
    },
    overdueEscalatedToReviewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TerminationReview",
      default: null,
    },

    // --- Milestone & Sub-Invoice Extensions ---
    invoiceVersion: {
      type: Number,
      default: 1,
    },
    isMilestoneSubInvoice: {
      type: Boolean,
      default: false,
    },
    parentInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bill",
      default: null,
      index: true,
    },
    milestoneIndex: {
      type: Number,
      default: null,
    },
    milestoneDueDate: {
      type: Date,
      default: null,
    },
    paidAmount: {
      type: Number,
      default: 0,
    },
    paymentDate: {
      type: Date,
      default: null,
    },
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
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

    // --- Metadata ---
    notes: {
      type: String,
      default: "",
    },
    violationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TenantViolation",
      default: null,
      index: true,
    },
    isManuallyAdjusted: {
      type: Boolean,
      default: false,
      // When true, at least one entry must exist in adjustmentHistory[].
      // Never write to this field alone — always append to adjustmentHistory first.
    },

    // --- Adjustment Audit Log (Spec §15) ---
    // Append-only. Every manual change to this bill's amount, status, or charges
    // must add an entry here. Never overwrite or delete entries.
    adjustmentHistory: {
      type: [
        new mongoose.Schema(
          {
            originalAmount:   { type: Number, required: true },
            adjustedAmount:   { type: Number, required: true },
            adjustedBy:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
            adjustedAt:       { type: Date, default: Date.now, required: true },
            adjustmentReason: { type: String, required: true, trim: true, minlength: 1 },
            changeType: {
              type: String,
              enum: ["manual_adjustment", "waiver", "correction", "admin_override"],
              required: true,
            },
          },
          { _id: false },
        ),
      ],
      default: [],
    },

    // --- Month-to-Month Flag (Spec §24.5, P4-04) ---
    // True when this bill is generated after the lease has expired and the
    // tenant is continuing month-to-month under explicit admin approval.
    isMonthToMonth: {
      type: Boolean,
      default: false,
    },
    monthToMonthApprovalRef: {
      // ObjectId of the Stay document whose monthToMonthApprovedAt confirms
      // this bill's legal basis. Populated when isMonthToMonth is true.
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stay",
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    issuedAt: {
      type: Date,
      default: null,
    },
    utilityDispatch: {
      type: new mongoose.Schema(
        {
          electricity: {
            type: utilityDispatchEntrySchema,
            default: () => ({}),
          },
          water: {
            type: utilityDispatchEntrySchema,
            default: () => ({}),
          },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    delivery: {
      type: new mongoose.Schema(
        {
          email: {
            status: {
              type: String,
              enum: ["not_attempted", "sent", "failed"],
              default: "not_attempted",
            },
            sentAt: { type: Date, default: null },
            error: { type: String, default: "" },
          },
          notification: {
            status: {
              type: String,
              enum: ["not_attempted", "sent", "failed"],
              default: "not_attempted",
            },
            sentAt: { type: Date, default: null },
            error: { type: String, default: "" },
          },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },

    // --- PDF Bill ---
    // Populated automatically when sendBills is triggered.
    // Relative path from server root: "uploads/bills/BILLID.pdf"
    pdfPath: {
      type: String,
      default: null,
    },
    pdfGeneratedAt: {
      type: Date,
      default: null,
    },
    // Cache provenance for the canonical statement renderer. A template
    // deployment can invalidate old files without mutating business data.
    pdfTemplateVersion: {
      type: Number,
      default: null,
    },
    // Payment-receipt cache provenance is independent from the Statement.
    receiptPath: { type: String, default: null },
    receiptGeneratedAt: { type: Date, default: null },
    receiptTemplateVersion: { type: Number, default: null },
    receiptSourceVersion: { type: String, default: null },

    // --- Payment Proof (tenant submission) ---
    paymentProof: {
      imageUrl: { type: String, default: null },
      submittedAmount: { type: Number, default: null },
      submittedAt: { type: Date, default: null },
      verificationStatus: {
        type: String,
        enum: ["none", "pending-verification", "approved", "rejected"],
        default: "none",
        index: true,
      },
      rejectionReason: { type: String, default: null },
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      verifiedAt: { type: Date, default: null },
    },

    // --- Penalty Details ---
    penaltyDetails: {
      daysLate:  { type: Number, default: 0 },
      ratePerDay: { type: Number, default: null },
      appliedAt:  { type: Date, default: null },

      // Waiver audit fields (Spec §15) — populated only when a penalty is waived.
      // waivedBy and waiverReason are required whenever waivedAt is set.
      originalPenaltyAmount: { type: Number, default: null }, // penalty total before waiver
      waivedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      waivedAt:     { type: Date, default: null },
      waiverReason: { type: String, default: null, trim: true },
    },

    // --- Bill Type ---
    // Distinguishes regular monthly rent bills from special lifecycle event bills.
    billType: {
      type: String,
      enum: ["monthly", "initial_payment", "transfer_settlement", "penalty"],
      default: "monthly",
    },

    // --- Transfer Snapshot (populated only for billType: "transfer_settlement") ---
    // Permanently records the from/to room context and billing state at the
    // moment of the room transfer. Used in billing history display.
    transferSnapshot: {
      type: new mongoose.Schema(
        {
          fromRoomId:   { type: mongoose.Schema.Types.ObjectId, ref: "Room", default: null },
          fromRoomName: { type: String, default: "" },
          fromRoomType: { type: String, default: "" },
          fromRoomPrice: { type: Number, default: 0 },
          toRoomId:   { type: mongoose.Schema.Types.ObjectId, ref: "Room", default: null },
          toRoomName: { type: String, default: "" },
          toRoomType: { type: String, default: "" },
          toRoomPrice: { type: Number, default: 0 },
          effectiveTransferDate: { type: Date, default: null },
          outstandingBalanceAtTransfer: { type: Number, default: 0 },
          // proRataDays/proRataRent = source-room days used / source-room
          // consumed rent value for this period (kept as-is for backward
          // compatibility with existing admin UI reads of bill.proRataDays).
          proRataDays: { type: Number, default: 0 },
          proRataRent: { type: Number, default: 0 },
          // Full actual-days + unused-credit settlement breakdown (see
          // server/services/billing/roomTransferSettlement.js) — additive,
          // for audit/explainability. sourceApprovedRate/destinationApprovedRate
          // are the Contract-approved rates used (never a mutable Room price).
          sourceApprovedRate: { type: Number, default: null },
          destinationApprovedRate: { type: Number, default: null },
          // Where sourceApprovedRate came from — "structured_final_monthly_rate"
          // (the tenant's approved, possibly-discounted pricingSnapshot rate) or
          // "contract_approved_monthly_rate" (the predecessor Contract's rate,
          // used for flat-rate/unapproved-snapshot reservations). See
          // server/services/billing/prepaidRentResolver.js.
          sourceRateSource: { type: String, default: null },
          totalCoverageDays: { type: Number, default: null },
          destinationDays: { type: Number, default: null },
          destinationProratedValue: { type: Number, default: null },
          unusedPrepaidCredit: { type: Number, default: null },
          additionalAmountDue: { type: Number, default: null },
          excessCredit: { type: Number, default: null },
          // Audit trail for Phase 4B's applicable-prepaid-rent resolution
          // (server/services/billing/prepaidRentResolver.js) — records the
          // actual funded amount used for unusedPrepaidCredit (which may
          // differ from sourceApprovedRate for structured/pricingSnapshot
          // reservations) and where it came from, for explainability only.
          applicablePrepaidRent: { type: Number, default: null },
          prepaidRentSource: { type: String, default: null },
          // Existing same-cycle rent liability reconciled by this transfer.
          // A monthly source Bill is linked here while this transfer Bill
          // deliberately leaves billingCycleStart null to avoid claiming the
          // regular Bill's unique cycle key.
          rentCoverageBillId: { type: mongoose.Schema.Types.ObjectId, ref: "Bill", default: null },
          rentCoverageBillType: { type: String, default: null },
          rentLiabilityForPeriod: { type: Number, default: null },
          // Rent-cycle boundaries used for the proration (audit).
          cycleStart: { type: Date, default: null },
          cycleEnd: { type: Date, default: null },
          // Utility proration fields — INFORMATIONAL ADMIN-PREVIEW ONLY.
          // Populated when a source meter reading is supplied at transfer time.
          // These are NOT a charge on the transfer_settlement Bill: the
          // departed tenant's source-room electricity is billed exactly once,
          // at the source room's UtilityPeriod close, for their pre-transfer
          // segment (room-scoped occupancy — see Phase 4).
          estimatedElectricityKwh: { type: Number, default: null },
          estimatedElectricityCharge: { type: Number, default: null },
          // Round-3: on a sub-metered branch the transferring tenant's
          // source-room electricity is FINALIZED on this Bill (charges.electricity)
          // BEFORE the physical cutover — a UtilityFinalization row then stops
          // the normal period close from re-billing it. This holds the
          // finalized figures for audit. Null on a fixed-rate branch, where
          // sourceElectricitySettledAtPeriodClose stays true.
          finalizedSourceElectricity: {
            type: new mongoose.Schema(
              {
                utilityPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: "UtilityPeriod", default: null },
                kwh: { type: Number, default: null },
                amount: { type: Number, default: null },
                ratePerUnit: { type: Number, default: null },
                baselineReading: { type: Number, default: null },
                closingReading: { type: Number, default: null },
              },
              { _id: false },
            ),
            default: null,
          },
          sourceElectricitySettledAtPeriodClose: { type: Boolean, default: true },
          // Water is ALWAYS settled at its normal period close — it cannot be
          // finalized on transfer day (its period total + covered-day
          // denominator are unknowable until close).
          sourceWaterSettledAtPeriodClose: { type: Boolean, default: true },
          // Scheduling-time / execution-time pre-transfer payable snapshots
          // (Scheduled Room Transfer Balance Bill).
          scheduledRentAdjustment: { type: Number, default: null },
          scheduledAdditionalDeposit: { type: Number, default: null },
          scheduledFinalElectricity: { type: Number, default: null },
          isScheduledTransferBalance: { type: Boolean, default: false },
          createdAtCompletion: { type: Boolean, default: false },
          recomputedAtCompletion: { type: Boolean, default: false },
          reconciledAtExecution: { type: Boolean, default: false },
          // A paid transfer Bill may only be adjusted upward automatically.
          // These fields preserve the pre-adjustment amount for audit; paid
          // downward adjustments remain manual and leave the Bill unchanged.
          upwardAdjustmentFrom: { type: Number, default: null },
          upwardAdjustmentTo: { type: Number, default: null },
          upwardAdjustmentAt: { type: Date, default: null },
          // ── Security-deposit settlement (independent of the rent numbers
          //    above; see roomTransferDepositSettlement.js). All in PHP. ──
          depositPreviouslyHeld: { type: Number, default: null }, // reservation.securityDepositHeld at transfer time
          destinationRequiredDeposit: { type: Number, default: null }, // 1x successor Contract approved monthly rate
          additionalDepositDue: { type: Number, default: null }, // billed as charges.securityDeposit
          excessDepositHeld: { type: Number, default: null }, // remains held; manual office review, never a rent credit
          depositHeldAfterTransferBeforePayment: { type: Number, default: null },
          depositHeldWasBackfilled: { type: Boolean, default: false }, // true when securityDepositHeld was derived from move-in financials
          // ── Final settlement components (rent and deposit kept separate) ─
          rentComponentDue: { type: Number, default: null },
          depositComponentDue: { type: Number, default: null },
          totalImmediateDue: { type: Number, default: null },
          // The transfer event this settlement belongs to — the predecessor
          // Contract id (the canonical transfer identifier in this codebase).
          transferReference: { type: mongoose.Schema.Types.ObjectId, ref: "Contract", default: null },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
);

// ============================================================================
// INDEXES FOR PERFORMANCE
// ============================================================================

// For branch-specific queries
billSchema.index({ branch: 1, billingMonth: -1 });
billSchema.index({ branch: 1, status: 1 });
billSchema.index({ branch: 1, userId: 1, billingMonth: -1 });
billSchema.index({ violationId: 1, isArchived: 1, status: 1 });
billSchema.index({
  userId: 1,
  reservationId: 1,
  billingMonth: 1,
  isArchived: 1,
});
billSchema.index({ userId: 1, status: 1, dueDate: 1 });
billSchema.index({ roomId: 1, utilityPeriod: 1 });

// Prevent duplicate rent bills for the same reservation + billing cycle.
// The partial filter excludes bills without a reservationId (utility-only bills).
billSchema.index(
  { reservationId: 1, billingCycleStart: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: {
      reservationId: { $type: "objectId" },
      billingCycleStart: { $type: "date" },
    },
    name: "unique_reservation_billing_cycle",
  },
);

// For forecasting and trend analysis
billSchema.index({ billingMonth: -1, totalAmount: 1 });
billSchema.index({ branch: 1, billingMonth: -1, status: 1 });
billSchema.index(
  { paymongoSessionId: 1 },
  { sparse: true, partialFilterExpression: { paymongoSessionId: { $type: "string" } } },
);
billSchema.index(
  { paymongoPaymentId: 1 },
  { sparse: true, partialFilterExpression: { paymongoPaymentId: { $type: "string" } } },
);
billSchema.index(
  { billType: 1 },
  { sparse: true, partialFilterExpression: { billType: { $type: "string" } } },
);
// Compound index for transfer settlement lookups and the outstanding-balance pre-check
// that runs before every transfer: Bill.find({ reservationId, isArchived: { $ne: true } })
billSchema.index(
  { reservationId: 1, billType: 1, status: 1 },
  { name: "transfer_settlement_lookup" },
);
billSchema.index(
  { reservationId: 1, billType: 1, structuredWorkflowVersion: 1 },
  {
    unique: true,
    partialFilterExpression: {
      reservationId: { $type: "objectId" },
      billType: "initial_payment",
      structuredWorkflowVersion: "structured-initial-payment-v1",
      isArchived: false,
    },
    name: "unique_structured_initial_payment_bill",
  },
);

// ============================================================================
// INSTANCE METHODS
// ============================================================================

billSchema.methods.markAsPaid = function (amount = this.totalAmount) {
  this.paidAmount = amount;
  this.remainingAmount = Math.max(this.totalAmount - amount, 0);
  this.status = this.remainingAmount <= 0 ? "paid" : "partially-paid";
  this.paymentDate = new Date();
  return this.save();
};

billSchema.methods.markAsOverdue = function () {
  if (
    this.status !== "draft" &&
    (this.remainingAmount ?? this.totalAmount - this.paidAmount) > 0
  ) {
    this.status = "overdue";
    return this.save();
  }
  return this;
};

// ============================================================================
// STATIC METHODS
// ============================================================================

// Find active (non-archived) bills
billSchema.statics.findActive = function () {
  return this.find({ isArchived: false });
};

// Find bills by branch for forecasting
billSchema.statics.findByBranch = function (branch, options = {}) {
  const query = { branch, isArchived: false };
  return this.find(query)
    .sort({ billingMonth: -1 })
    .limit(options.limit || 100);
};

// Get monthly revenue by branch (for forecasting)
billSchema.statics.getMonthlyRevenueByBranch = async function (
  branch,
  months = 12,
) {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  return this.aggregate([
    {
      $match: {
        branch,
        billingMonth: { $gte: startDate },
        status: { $in: ["paid", "partially-paid"] },
        isArchived: false,
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m", date: "$billingMonth" },
        },
        totalRevenue: { $sum: "$paidAmount" },
        billCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
};

// Get payment statistics by branch
billSchema.statics.getPaymentStats = async function (branch) {
  return this.aggregate([
    {
      $match: {
        branch,
        isArchived: false,
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmount: { $sum: "$totalAmount" },
      },
    },
  ]);
};

// ============================================================================
// MODEL EXPORT
// ============================================================================

export default mongoose.model("Bill", billSchema);
