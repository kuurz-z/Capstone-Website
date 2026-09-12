/**
 * ============================================================================
 * RESERVATION MODEL
 * ============================================================================
 *
 * Stores room reservation/booking information.
 *
 * WORKFLOW:
 * 1. User creates reservation (status: pending)
 * 2. User selects a viewing preference and submits application documents
 * 3. Admin reviews the application and approves it for payment
 * 4. User completes deposit payment (status: reserved)
 * 5. Admin verifies move-in (status: moveIn)
 * 6. Tenant moves out (status: moveOut)
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
  canTransitionReservationStatus,
} from "../utils/lifecycleNaming.js";
import { PAYMENT_METHODS } from "../config/paymentMethods.js";

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

const documentPrecheckSchema = new mongoose.Schema(
  {
    precheckProvider: {
      type: String,
      default: "ocr",
      trim: true,
      maxlength: 40,
    },
    precheckStatus: {
      type: String,
      enum: [
        "not_checked",
        "checking",
        "ready_for_submission",
        "needs_reupload",
        "manual_review_fallback",
      ],
      default: "not_checked",
    },
    readabilityStatus: {
      type: String,
      enum: [
        "unknown",
        "readable",
        "low_readability",
        "unreadable",
        "ocr_unavailable",
      ],
      default: "unknown",
    },
    documentTypeStatus: {
      type: String,
      enum: ["possible_match", "possible_mismatch", "unknown"],
      default: "unknown",
    },
    canSubmit: {
      type: Boolean,
      default: true,
    },
    requiresManualReview: {
      type: Boolean,
      default: true,
    },
    applicantMessage: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    adminNote: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    confidence: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    flags: {
      type: [String],
      default: [],
    },
    aiCheckStatus: {
      type: String,
      enum: [
        "not_checked",
        "checking",
        "passed",
        "warning",
        "failed",
        "error",
      ],
      default: "not_checked",
    },
    aiCheckWarnings: {
      type: [String],
      default: [],
    },
    aiCheckedAt: {
      type: Date,
      default: null,
    },
    requiresAdminAttention: {
      type: Boolean,
      default: false,
    },
    summaryMessage: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    provider: {
      type: String,
      default: "system",
      trim: true,
      maxlength: 80,
    },
  },
  { _id: false },
);

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
    pendingExtensionRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'StayExtensionRequest', default: null },
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

    // --- Inquiry Pipeline Back-Link (Spec §4.4) ---
    // Populated when this reservation was created by converting an Inquiry record.
    // Bidirectional: Inquiry.reservationId ↔ Reservation.inquiryId
    inquiryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inquiry",
      default: null,
      index: true,
    },
    // Denormalized source for fast marketing reporting without joining Inquiry.
    inquirySource: {
      type: String,
      default: null,
      // e.g. "facebook", "walk_in", "referral" — copied from Inquiry.source on conversion
    },

    // Bed Assignment
    selectedBed: {
      id: String,
      position: String, // "upper", "lower", "single"
      bunkBlock: String, // "A", "B", etc.
      code: String, // "101-A-U", etc.
    },

    // =========================================================================
    // STAGE 1: SUMMARY
    // =========================================================================
    // Tenant's desired move-in date — captured at Step 1 (room summary).
    // Replaces targetMoveInDate as the canonical "intended" date field.
    intendedMoveInDate: {
      type: Date,
      default: null,
    },
    // @deprecated — kept for backward compatibility with older records.
    // Write intendedMoveInDate instead. Read via readMoveInDate().
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
    viewingPreference: {
      type: String,
      enum: ["physical_visit", "remote_2d_viewing", "urgent_move_in_review", null],
      default: null,
    },
    viewingType: {
      type: String,
      default: "inperson",
    },
    visitDate: Date,
    visitTime: String,
    remoteViewingAcknowledged: {
      type: Boolean,
      default: false,
    },
    remoteViewingQuestions: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1500,
    },
    isUrgentMoveIn: {
      type: Boolean,
      default: false,
    },
    // When the tenant submitted the visit schedule request (≠ the visit appointment date)
    visitScheduledAt: {
      type: Date,
      default: null,
    },
    isOutOfTown: Boolean,
    // Admin must approve the out-of-town claim before it waives the visit requirement
    isOutOfTownApproved: {
      type: Boolean,
      default: false,
    },

    // -------------------------------------------------------------------------
    // VIEWING WAIVER AUDIT (Spec §4.3)
    // -------------------------------------------------------------------------
    // Populated when viewingPreference is "urgent_move_in_review" or
    // isOutOfTown is true and the visit requirement is formally waived.
    //
    // CHAIN: waiverReason → admin approval → tenant acknowledgment
    // All three must be present before the reservation pipeline continues.
    //
    // The existing flat booleans (isOutOfTown, isOutOfTownApproved,
    // remoteViewingAcknowledged) are retained for backward compatibility.
    // viewingWaiver is the auditable source of truth going forward.
    viewingWaiver: {
      type: new mongoose.Schema(
        {
          // --- Reason (step 1) ---
          waiverReason: {
            type: String,
            enum: [
              "out_of_province",        // Applicant is from another province
              "urgent_accommodation",   // Needs immediate move-in within days
              "tenant_choice",          // Applicant personally chose not to view
              "management_exception",   // Admin-approved special case
            ],
            default: null,
          },
          evidenceNote: {
            type: String,
            default: "",
            trim: true,
            maxlength: 1000,
            // Admin's note describing supporting evidence for the waiver reason
          },

          // --- Admin Approval (step 2) ---
          approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            // Required — cannot be null when isOutOfTownApproved transitions to true
          },
          approvedAt: {
            type: Date,
            default: null,
          },

          // --- Tenant Acknowledgment (step 3) ---
          // Must match the required text (or a configurable version of it):
          // "I understand that I am continuing with the reservation without viewing the actual room."
          acknowledgmentText: {
            type: String,
            default: null,
            trim: true,
            // The verbatim text the tenant confirmed; stored for evidence
          },
          acknowledgedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            // The applicant's own account ID — confirms they personally clicked
          },
          acknowledgedAt: {
            type: Date,
            default: null,
          },
        },
        { _id: false },
      ),
      default: null,
    },

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
    visitStatus: {
      type: String,
      enum: [
        "pending",
        "physical_visit_scheduled",
        "schedule_approved",
        "approved",
        "rejected",
        "completed",
        "visit_completed",
        "no_show",
        "rescheduled",
        "cancelled",
        "visit_cancelled",
        "allowed_without_visit",
        null,
      ],
      default: null,
    },
    visitOutcomeNotes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1500,
    },
    visitOutcomeUpdatedAt: {
      type: Date,
      default: null,
    },
    visitOutcomeUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    visitOutcomeUpdatedByName: {
      type: String,
      default: "",
      trim: true,
      maxlength: 160,
    },

    // Visit History — each schedule/rejection attempt is logged here
    visitHistory: {
      type: [
        {
          visitDate: Date,
          visitTime: String,
          viewingType: { type: String, default: "inperson" },
          status: {
            type: String,
            enum: [
              "pending",
              "schedule_approved",
              "rejected",
              "approved",
              "cancelled",
              "rescheduled",
              "completed",
              "no_show",
              "visit_cancelled",
              "allowed_without_visit",
            ],
            default: "pending",
          },
          rejectionReason: String,
          notes: {
            type: String,
            default: "",
            trim: true,
            maxlength: 1500,
          },
          scheduledAt: { type: Date, default: Date.now },
          rejectedAt: Date,
          rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          approvedAt: Date,
          updatedAt: Date,
          updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          updatedByName: {
            type: String,
            default: "",
            trim: true,
            maxlength: 160,
          },
          rescheduledToDate: Date,
          rescheduledToTime: String,
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
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer-not-to-say", "", null],  // UI only offers male/female; legacy values preserved for existing records
      default: null,
    },
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
    idType: {
      type: String,
      enum: [
        "national_id",
        "drivers_license",
        "passport",
        "sss_id",
        "umid",
        "school_id",
        "other",
        null,
      ],
      default: null,
    },
    nbiClearanceUrl: String,
    nbiReason: String,
    companyIDUrl: String,
    companyIDReason: String,
    personalNotes: String,
    documentPrechecks: {
      selfiePhoto: {
        type: documentPrecheckSchema,
        default: () => ({}),
      },
      validIDFront: {
        type: documentPrecheckSchema,
        default: () => ({}),
      },
      validIDBack: {
        type: documentPrecheckSchema,
        default: () => ({}),
      },
      nbiClearance: {
        type: documentPrecheckSchema,
        default: () => ({}),
      },
      companyID: {
        type: documentPrecheckSchema,
        default: () => ({}),
      },
    },

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
    // Set on every resubmission after a needs_revision cycle; null on first submission
    applicationResubmittedAt: {
      type: Date,
      default: null,
    },
    applicationReviewReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1500,
    },
    applicationReviewedAt: {
      type: Date,
      default: null,
    },
    applicationReviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isViewedByAdmin: {
      type: Boolean,
      default: false,
    },
    lastAdminViewedAt: {
      type: Date,
      default: null,
    },

    // -------------------------------------------------------------------------
    // CONDITIONAL DOCUMENT REQUIREMENTS (Spec §7.4)
    // -------------------------------------------------------------------------
    // When an admin approves an application but one required document is
    // missing, they may conditionally accept the application with a deadline.
    //
    // Each entry in this array represents one such conditional document.
    // The pre-save guard on "moveIn" status checks this array:
    //   - If any entry has status "pending" AND submissionDeadline < now,
    //     the move-in is BLOCKED until an admin extends the deadline or
    //     marks the document received/waived.
    //
    // Status flow per document:
    //   pending → submitted (tenant uploads) → verified (admin confirms)
    //                      → expired (deadline passed, no submission)
    //                      → waived  (admin explicitly waives the requirement)
    conditionalDocuments: {
      type: [
        new mongoose.Schema(
          {
            documentName: {
              type: String,
              required: true,
              trim: true,
              // e.g. "NBI Clearance", "Company ID", "School Enrollment Certificate"
            },
            reason: {
              type: String,
              default: "",
              trim: true,
              maxlength: 500,
              // Why the document could not be submitted at application time
            },

            // --- Deadline ---
            submissionDeadline: {
              type: Date,
              required: true,
              // Admin sets this. Must be a future date when created.
            },

            // --- Status ---
            status: {
              type: String,
              enum: ["pending", "submitted", "verified", "expired", "waived"],
              default: "pending",
            },

            // --- Admin Approval (who granted the condition) ---
            approvedBy: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
              required: true,
            },
            approvedAt: {
              type: Date,
              default: Date.now,
            },

            // --- Submission (when tenant uploads the document) ---
            submittedAt: {
              type: Date,
              default: null,
            },
            submissionUrl: {
              type: String,
              default: null,
            },

            // --- Verification (admin confirms the document is acceptable) ---
            verifiedBy: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
              default: null,
            },
            verifiedAt: {
              type: Date,
              default: null,
            },

            // --- Waiver (admin cancels the requirement entirely) ---
            waivedBy: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
              default: null,
            },
            waivedAt: {
              type: Date,
              default: null,
            },
            waiverReason: {
              type: String,
              default: null,
              trim: true,
            },

            // --- Expiry flag (set by cron when deadline passes with no submission) ---
            expiredAt: {
              type: Date,
              default: null,
            },
          },
          { _id: true },
        ),
      ],
      default: [],
    },

    adminViewedAt: {
      type: Date,
      default: null,
    },
    approvedForPaymentAt: {
      type: Date,
      default: null,
    },
    approvedDate: {
      type: Date,
      default: null,
    },
    legacyContractApprovalConfirmedAt: { type: Date, default: null },
    legacyContractApprovalConfirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    legacyContractApprovalReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1500,
    },
    reservedAt: {
      type: Date,
      default: null,
    },

    // =========================================================================
    // STAGE 4: PAYMENT
    // =========================================================================
    finalMoveInDate: Date,
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
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
    paymentStatus: {
      type: String,
      enum: ["pending", "partial", "paid", "paid_in_full", "cancelled", "refunded"],
      default: "pending",
      index: true,
    },
    initialPaymentStatus: {
      type: String,
      enum: ["not_created", "unpaid", "pending", "partial", "paid", "reconciliation_required"],
      default: "not_created",
      index: true,
    },
    initialPaymentBillId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bill",
      default: null,
    },
    initialPaymentSessionId: {
      type: String,
      default: null,
    },

    // --- Security deposit — ACTUAL cash held (authoritative) ---
    // The amount of security-deposit money currently held for this tenancy.
    // Distinct from Contract.securityDepositAmount (the REQUIRED deposit for
    // the current room/contract): the two can differ temporarily when a
    // room transfer raised the requirement and the additional deposit
    // component of the transfer settlement Bill has not been paid yet.
    //
    //   - Set at move-in to the deposit actually collected.
    //   - A room transfer to a LOWER-deposit room does NOT reduce this
    //     (excess held deposit stays refundable via move-out clearance).
    //   - A room transfer to a HIGHER-deposit room increases this ONLY when
    //     the deposit component of the transfer Bill is confirmed paid
    //     (never on Bill creation / checkout creation).
    //   - null = not yet populated (legacy record). Room Transfer must verify
    //     cash evidence and must never treat a required deposit as cash held.
    //     Move-out's separate legacy behavior remains in moveOutClearanceService.
    securityDepositHeld: {
      type: Number,
      default: null,
      min: 0,
    },
    // Append-only audit log of every change to securityDepositHeld.
    securityDepositLedger: {
      type: [
        new mongoose.Schema(
          {
            kind: {
              type: String,
              enum: ["move_in", "transfer_adjustment_due", "transfer_deposit_settlement", "backfill", "manual_correction"],
              required: true,
            },
            previousHeld: { type: Number, default: null },
            adjustmentAmount: { type: Number, default: 0 }, // signed; + funds held, - releases (rare)
            resultingHeld: { type: Number, required: true, min: 0 },
            // Where this change came from.
            sourceRef: {
              kind: { type: String, default: "" }, // "bill" | "payment" | "contract" | "reservation"
              id: { type: mongoose.Schema.Types.ObjectId, default: null },
            },
            transferReference: { type: mongoose.Schema.Types.ObjectId, ref: "Contract", default: null },
            scheduledRoomTransferId: { type: mongoose.Schema.Types.ObjectId, ref: "ScheduledRoomTransfer", default: null },
            billId: { type: mongoose.Schema.Types.ObjectId, ref: "Bill", default: null },
            paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", default: null },
            // Unique per logical event so a duplicate webhook / retry does
            // not append twice or double-fund the held balance.
            idempotencyKey: { type: String, default: null },
            reason: { type: String, default: "", trim: true },
            createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
            createdAt: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
    },

    // Timestamp of when the internal receipt email was successfully sent.
    // Prevents duplicate receipt emails on repeated webhook deliveries.
    receiptSentAt: {
      type: Date,
      default: null,
    },

    // --- Reservation Dates & Pricing ---
    moveInDate: {
      type: Date,
      default: null,
    },
    // Admin-confirmed actual move-in date — set when admin executes the moveIn action.
    // Takes precedence over moveInDate for lease calculations once populated.
    confirmedMoveInDate: {
      type: Date,
      default: null,
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
    financialWorkflowVersion: {
      type: String,
      enum: ["structured-initial-payment-v1", null],
      default: null,
      index: true,
    },
    pricingSnapshot: {
      regularMonthlyRate: { type: Number, default: null, min: 0 },
      discountPercentage: { type: Number, default: null, min: 0, max: 100 },
      discountAmount: { type: Number, default: null, min: 0 },
      finalMonthlyRate: { type: Number, default: null, min: 0 },
      reservationFeeAmount: { type: Number, default: null, min: 0 },
      advanceRentAmount: { type: Number, default: null, min: 0 },
      securityDepositAmount: { type: Number, default: null, min: 0 },
      approvedInitialCharges: { type: Number, default: 0, min: 0 },
      roomType: { type: String, default: "" },
      leaseType: { type: String, enum: ["short", "long", ""], default: "" },
      leaseDurationMonths: { type: Number, default: null, min: 1, max: 12 },
      branchId: { type: String, default: "" },
      roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", default: null },
      selectedBed: {
        id: { type: String, default: "" },
        position: { type: String, default: "" },
        bunkBlock: { type: String, default: "" },
        code: { type: String, default: "" },
      },
      rateEffectiveDate: { type: Date, default: null },
      promotionName: { type: String, default: null },
      customRateReason: { type: String, default: null },
      approvedAt: { type: Date, default: null },
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      snapshotVersion: { type: Number, default: null },
    },
    reservationFeePaymentStatus: {
      type: String,
      enum: ["pending", "verified", "failed", "reconciliation_required"],
      default: "pending",
    },
    reservationFeePaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },
    advanceCoverageStart: { type: Date, default: null },
    advanceCoverageEnd: { type: Date, default: null },
    advanceCoverageEndExclusive: { type: Date, default: null },
    nextRegularBillingDate: { type: Date, default: null },
    pricingApprovedAt: { type: Date, default: null },
    pricingApprovedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    pricingSnapshotVersion: { type: Number, default: null },
    houseRulesPreparedAt: { type: Date, default: null },
    houseRulesPreparedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    moveInException: {
      active: { type: Boolean, default: false },
      reason: { type: String, default: "", maxlength: 1000 },
      expiresAt: { type: Date, default: null },
      approvedAt: { type: Date, default: null },
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
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
    // Authoritative recurring rent rate AFTER a room transfer changed the
    // room/room-type. resolveReservationRentAmount (rentGenerator.js) prefers
    // this over the immutable structured pricingSnapshot.finalMonthlyRate so
    // the next monthly Bill uses the destination room's approved rate.
    // null = no transfer has overridden the rate; use the normal resolution.
    recurringRentRate: {
      type: Number,
      default: null,
      min: 0,
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
    selectedAppliances: {
      type: [
        new mongoose.Schema(
          {
            id: { type: String, required: true },
            name: { type: String, required: true },
            quantity: { type: Number, required: true, min: 0 },
            price: { type: Number, default: 200 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    applianceFees: {
      type: Number,
      default: 0,
    },
    queuedAppliances: {
      type: new mongoose.Schema(
        {
          appliances: [
            {
              id: { type: String },
              name: { type: String, required: true },
              quantity: { type: Number, required: true, min: 0 },
              price: { type: Number, default: 200 },
            },
          ],
          applianceFees: { type: Number, default: 0 },
          effectiveDate: { type: Date, default: null },
          requestedAt: { type: Date, default: Date.now },
          requestedBy: { type: String, default: null },
        },
        { _id: false },
      ),
      default: null,
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
    renewalOffers: {
      type: [
        {
          offerId: { type: String, required: true },
          months: { type: Number, required: true },
          // The final approved monthly rent offered to the tenant — i.e. the
          // SAME room-type + duration canonical finalMonthlyRate that will be
          // snapshotted onto the renewal successor Contract
          // (resolveAuthoritativeLeasePricing, see contractService.js
          // createSuccessorContractForRenewal). Never a room list price, the
          // tenant's current/old rent, or an arbitrary unvalidated amount.
          proposedRent: { type: Number, default: null },
          // Audit/traceability fields populated when proposedRent was
          // resolved canonically (pricingSource: "canonical_resolver").
          // Absent/null on legacy offers created before this existed.
          regularMonthlyRate: { type: Number, default: null },
          discountPercentage: { type: Number, default: null },
          pricingTier: { type: String, enum: ["long_term", "short_term", null], default: null },
          pricingSource: {
            type: String,
            enum: ["canonical_resolver", "legacy_manual", null],
            default: null,
          },
          notes: { type: String, default: "" },
          status: {
            type: String,
            enum: ["pending", "accepted", "declined", "cancelled", "expired"],
            default: "pending",
          },
          expiresAt: { type: Date, default: null },
          createdAt: { type: Date, default: Date.now },
          createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          respondedAt: { type: Date, default: null },
          tenantResponseReason: { type: String, default: "" },
        },
      ],
      default: [],
    },

    // --- Applicant Cancellation ---
    // Set when a tenant cancels their own reservation pre-move-in.
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // 'applicant' | 'admin' | 'system'
    cancellationSource: {
      type: String,
      enum: ["applicant", "admin", "system"],
      default: null,
    },
    cancellationReason: {
      type: String,
      default: null,
    },
    // Fee policy: once an applicant cancels, the reservation fee is forfeited.
    reservationFeeRefundable: {
      type: Boolean,
      default: true,
    },
    reservationFeeForfeited: {
      type: Boolean,
      default: false,
    },

    // --- Security Deposit Settlement (Lease Contract Rules) ---
    // Populated at move-out time. depositForfeited is auto-set by the system
    // when actualMoveOutDate < leaseEndDate (early vacancy). keyReturned is
    // admin-assessed only — never auto-set.
    depositForfeited: {
      type: Boolean,
      default: false,
    },
    // 'early_vacancy' | 'admin_decision' | null
    depositForfeitureReason: {
      type: String,
      enum: ["early_vacancy", "admin_decision", null],
      default: null,
    },
    depositForfeitedAt: {
      type: Date,
      default: null,
    },
    // null = not yet assessed by admin; true/false = assessed
    keyReturned: {
      type: Boolean,
      default: null,
    },
    keyReturnAssessedAt: {
      type: Date,
      default: null,
    },
    // Auto-set to moveOutDate + 30 days when deposit is NOT forfeited
    depositRefundDeadline: {
      type: Date,
      default: null,
    },
    // Computed at move-out: 0 if forfeited, else securityDeposit - keyDeduction - unpaidBills
    depositRefundAmount: {
      type: Number,
      default: null,
    },
    depositRefundStatus: {
      type: String,
      enum: ["pending", "approved", "processed", "forfeited"],
      default: "pending",
    },
    depositRefundReference: {
      type: String,
      default: "",
    },
    depositRefundProcessedAt: {
      type: Date,
      default: null,
    },
    paymentExpiresAt: {
      type: Date,
      default: null,
    },
    depositRefundProcessedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    refundDisbursementMethod: {
      type: String,
      enum: ["gcash", "bank_transfer", "other", null],
      default: null,
    },
    refundAccountName: {
      type: String,
      default: "",
    },
    refundAccountNumber: {
      type: String,
      default: "",
    },
    refundBankName: {
      type: String,
      default: "",
    },
    finalSettlementSummary: {
      securityDeposit: { type: Number, default: 0 },
      outstandingBalance: { type: Number, default: 0 },
      finalUtilityCharge: { type: Number, default: 0 },
      finalElectricityReading: {type:Number, default:null},
      finalWaterReading: {type:Number, default:null},
      waterLiabilityStatus: {type:String, enum:["pending-period-close","included-in-rent"], default:undefined},
      damageDeductions: { type: Number, default: 0 },
      keyDeduction: { type: Number, default: 0 },
      netAmount: { type: Number, default: 0 },
      settlementType: {
        type: String,
        enum: ["refund", "payment_due", "zero_balance", "forfeited", null],
        default: null,
      },
      settledAt: { type: Date, default: null },
    },

    // --- Contract Termination Eligibility (Lease Contract — Section 10) ---
    // Tracked by scheduler job to alert branch admin when tenant has 3+ consecutive
    // months of overdue bills. Advisory flag only — never auto-terminates.
    consecutiveOverdueMonths: {
      type: Number,
      default: 0,
    },
    eligibleForTermination: {
      type: Boolean,
      default: false,
    },
    terminationEligibilityDetectedAt: {
      type: Date,
      default: null,
    },
    terminationEligibilityAlertSentAt: {
      type: Date,
      default: null,
    },

    // --- Post-Payment Cancellation Request ---
    // Tenant submits a request; admin confirms before bed is released.
    // Fee is strictly non-refundable regardless of outcome.
    cancellationRequested: {
      type: Boolean,
      default: false,
    },
    cancellationRequestedAt: {
      type: Date,
      default: null,
    },
    cancellationRequestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // "pending" | "approved" | "rejected" | "dismissed_on_movein"
    cancellationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "dismissed_on_movein"],
      default: null,
    },
    cancellationReviewedAt: {
      type: Date,
      default: null,
    },
    cancellationReviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    cancellationAdminNote: {
      type: String,
      default: null,
    },

    // --- Pre-Move-In Modification Requests ---
    modificationRequested: {
      type: Boolean,
      default: false,
    },
    modificationRequestedAt: {
      type: Date,
      default: null,
    },
    modificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", null],
      default: null,
    },
    modificationDetails: {
      requestedMoveInDate: Date,
      reason: String,
      adminNote: String,
      reviewedAt: Date,
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },

    // --- Room Transfer Tracking ---
    pendingTransferRoomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      default: null,
    },
    pendingTransferBedId: {
      type: String,
      default: null,
    },
    transferStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "completed", "cancelled", null],
      default: null,
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
    archivedPreviousStatus: {
      type: String,
      enum: CANONICAL_RESERVATION_STATUSES,
      default: null,
    },
    archiveReason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  },
);

// ============================================================================
// INDEXES
// ============================================================================

reservationSchema.index({ tenant: 1, status: 1 });
reservationSchema.index({ branch: 1, status: 1, isArchived: 1 });
reservationSchema.index({ room: 1, bedId: 1, status: 1 });

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

// Capture the status as it exists in the DB so the pre-save hook can
// compare "from → to" transitions.
reservationSchema.post("init", function () {
  this._original_status = this.status;
  this._original_pricing_snapshot = this.pricingSnapshot?.toObject
    ? this.pricingSnapshot.toObject()
    : this.pricingSnapshot;
});

// Prevent unbounded array growth that would bloat documents and slow reads.
const ARRAY_CAPS = {
  visitHistory: 30,
  leaseExtensions: 50,
  customCharges: 100,
};

reservationSchema.pre("save", function (next) {
  if (
    !this.isNew &&
    this.isModified("pricingSnapshot") &&
    this._original_pricing_snapshot?.approvedAt
  ) {
    return next(new Error("Approved Reservation pricing snapshots are immutable."));
  }
  for (const [field, cap] of Object.entries(ARRAY_CAPS)) {
    if (Array.isArray(this[field]) && this[field].length > cap) {
      // Keep the most recent entries
      this[field] = this[field].slice(-cap);
    }
  }
  next();
});

// Enforce valid status transitions at the schema level so no code path —
// direct saves, migrations, or admin tools — can produce impossible states.
// new documents (isNew) and same-status saves are always allowed.
reservationSchema.pre("save", function (next) {
  if (!this.isNew && this.isModified("status")) {
    const from = this._original_status;
    const to = this.status;
    if (from && from !== to && !canTransitionReservationStatus(from, to)) {
      return next(
        new Error(`Invalid reservation status transition: "${from}" → "${to}"`),
      );
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
// Enforce single active reservation per user atomically at the database level
reservationSchema.index(
  { userId: 1 },
  {
    name: "unique_active_user_reservation",
    unique: true,
    partialFilterExpression: {
      isArchived: false,
      status: {
        $nin: ["cancelled", "archived", "moveOut", "rejected"],
      },
    },
  },
);
// Room-level status queries (e.g. find all moved-in reservations for a room)
reservationSchema.index({ roomId: 1, status: 1 });
reservationSchema.index(
  { roomId: 1, "selectedBed.id": 1 },
  {
    name: "unique_active_room_bed_assignment",
    unique: true,
    partialFilterExpression: {
      isArchived: false,
      "selectedBed.id": { $type: "string" },
      status: {
        $in: [
          "pending",
          "viewing_preference_selected",
          "visit_pending",
          "visit_approved",
          "pending_application_review",
          "needs_revision",
          "approved_for_payment",
          "payment_pending",
          "reserved",
          "moveIn",
        ],
      },
    },
  },
);
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
reservationSchema.methods.archive = async function (
  archivedById = null,
  { previousStatus = null, reason = "" } = {},
) {
  this.isArchived = true;
  this.archivedAt = new Date();
  this.archivedBy = archivedById;
  this.archivedPreviousStatus =
    normalizeReservationStatus(previousStatus || this.archivedPreviousStatus || this.status) ||
    this.status;
  this.archiveReason = reason || this.archiveReason || "";
  return this.save();
};

/**
 * Restore an archived reservation
 */
reservationSchema.methods.restore = async function () {
  this.isArchived = false;
  this.archivedAt = null;
  this.archivedBy = null;
  this.archiveReason = "";
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
// PRE-SAVE GUARD — Pricing Snapshot Immutability (Spec §6.3)
// ============================================================================
//
// Once pricingApprovedAt is recorded, the core pricing fields are frozen.
// Any attempt to mutate them after approval is rejected with a clear error.
//
// IMMUTABLE AFTER APPROVAL: regularMonthlyRate, discountPercentage,
// discountAmount, finalMonthlyRate, roomType, leaseType, leaseDurationMonths
//
// STILL MUTABLE: customRateReason, snapshotVersion, selectedBed, branchId,
// roomId (these can legitimately change before move-in or for corrections
// that require creating a new snapshot version via admin override).
//
// Rule: "Existing snapshots are immutable. Editing the master rate table must
// affect only new or not-yet-approved applications." — Spec §6.3

const IMMUTABLE_PRICING_FIELDS = Object.freeze([
  "pricingSnapshot.regularMonthlyRate",
  "pricingSnapshot.discountPercentage",
  "pricingSnapshot.discountAmount",
  "pricingSnapshot.finalMonthlyRate",
  "pricingSnapshot.roomType",
  "pricingSnapshot.leaseType",
  "pricingSnapshot.leaseDurationMonths",
]);

reservationSchema.pre("save", function guardPricingSnapshotImmutability(next) {
  // Only applies to updates (not new documents) and only when pricing is approved
  if (this.isNew) return next();
  if (!this.pricingApprovedAt) return next();
  // pricingApprovedAt being modified on this very save means this is the
  // initial approval (or a deliberate re-approval via the admin override
  // workflow) establishing the snapshot — not a mutation of an
  // already-approved one. Only guard saves where pricing was already
  // approved before this save began and the caller is trying to slip a
  // change past that without going through re-approval.
  if (this.isModified("pricingApprovedAt")) return next();

  const violations = IMMUTABLE_PRICING_FIELDS.filter((path) =>
    this.isModified(path),
  );

  if (violations.length > 0) {
    return next(
      new Error(
        `[Reservation pre-save] Cannot mutate approved pricing snapshot fields: ` +
          `${violations.join(", ")}. ` +
          `Pricing was approved at ${this.pricingApprovedAt.toISOString()}. ` +
          `To change the rate, an admin must create a new snapshot version (pricingSnapshotVersion++) ` +
          `and re-approve via the pricing override workflow.`,
      ),
    );
  }

  next();
});

// ============================================================================
// PRE-SAVE GUARD — Conditional Document Expiry Gate (Spec §7.4)
// ============================================================================
//
// Blocks transitioning to "moveIn" when any conditionalDocuments entry
// has status "pending" AND its submissionDeadline has already passed.
//
// The admin must take one of the following actions to clear the block:
//   a) Extend the submissionDeadline on the entry
//   b) Mark the entry status as "verified" after receiving the document
//   c) Mark the entry status as "waived" (with waivedBy + waiverReason)
//
// IMPORTANT: An entry with status "submitted" is NOT blocked — the tenant
// has uploaded something and the admin is reviewing it. Only "pending" +
// past deadline is a hard block.

reservationSchema.pre("save", function guardConditionalDocumentExpiry(next) {
  if (this.isNew) return next();

  // Only relevant when transitioning to "moveIn"
  const isGoingMoveIn =
    this.isModified("status") && this.status === "moveIn";
  if (!isGoingMoveIn) return next();

  const now = new Date();
  const blockers = (this.conditionalDocuments || []).filter(
    (doc) =>
      doc.status === "pending" &&
      doc.submissionDeadline &&
      doc.submissionDeadline < now,
  );

  if (blockers.length > 0) {
    const names = blockers.map((d) => `"${d.documentName}"`).join(", ");
    return next(
      new Error(
        `[Reservation pre-save] Cannot set status to "moveIn" — ` +
          `${blockers.length} conditional document(s) have passed their deadline ` +
          `without being submitted: ${names}. ` +
          `An admin must extend the deadline, mark the document verified, ` +
          `or explicitly waive the requirement before move-in can proceed.`,
      ),
    );
  }

  next();
});

// ============================================================================
// PRE-SAVE GUARD — System Cancellation Block on Paid Reservations (Spec §9.3)
// ============================================================================
//
// Spec §9.3: "Never automate this: Releasing a paid reservation must be an
// explicit admin decision with a recorded reason. The system may flag and
// recommend, but must not cancel by itself."
//
// ALLOWED for system source:
//   - Setting status to "move_in_overdue" (flag only, does NOT release the bed)
//   - Cancelling reservations where the fee has NOT been verified
//
// BLOCKED for system source:
//   - Cancelling (or archiving with cancellationSource="system") when
//     reservationFeePaymentStatus is "verified" — i.e. the tenant has paid.
//
// If you are a background job flagging a no-show, set:
//   status = "move_in_overdue" — that is the correct action.

const SYSTEM_CANCEL_TERMINAL_STATUSES = Object.freeze(["cancelled", "archived"]);
const PAID_FEE_STATUSES = Object.freeze(["verified"]);

reservationSchema.pre("save", function guardSystemCancellationOfPaidSlots(next) {
  if (this.isNew) return next();

  const isSettingSystemSource =
    this.isModified("cancellationSource") && this.cancellationSource === "system";
  const isAlreadySystemSource =
    !this.isModified("cancellationSource") && this.cancellationSource === "system";

  if (!isSettingSystemSource && !isAlreadySystemSource) return next();

  const isGoingTerminal =
    this.isModified("status") &&
    SYSTEM_CANCEL_TERMINAL_STATUSES.includes(this.status);
  if (!isGoingTerminal) return next();

  const feeWasPaid = PAID_FEE_STATUSES.includes(this.reservationFeePaymentStatus);
  if (!feeWasPaid) return next();

  return next(
    new Error(
      `[Reservation pre-save] Cannot set cancellationSource="system" on a paid reservation ` +
        `(${this.reservationCode || this._id}) — reservationFeePaymentStatus is ` +
        `"${this.reservationFeePaymentStatus}". ` +
        `Use status="move_in_overdue" to flag a no-show. ` +
        `Only a named admin can cancel a paid slot, with a cancellationReason recorded.`,
    ),
  );
});

// ============================================================================
// PRE-SAVE GUARD — Admin Cancellation Must Have a Reason (Spec §9.3)
// ============================================================================
//
// When an admin cancels a paid reservation, they must supply a written reason.
// This guard blocks saving "cancelled" status without a non-empty reason.

reservationSchema.pre("save", function guardAdminCancellationReason(next) {
  if (this.isNew) return next();

  const isGoingCancelled =
    this.isModified("status") && this.status === "cancelled";
  if (!isGoingCancelled) return next();

  const feeWasPaid = PAID_FEE_STATUSES.includes(this.reservationFeePaymentStatus);
  if (!feeWasPaid) return next();

  const hasReason =
    typeof this.cancellationReason === "string" &&
    this.cancellationReason.trim().length > 0;

  if (!hasReason) {
    return next(
      new Error(
        `[Reservation pre-save] Cancelling a paid reservation ` +
          `(${this.reservationCode || this._id}) requires a non-empty cancellationReason. ` +
          `Record why the paid slot is being released before saving.`,
      ),
    );
  }

  next();
});

// ============================================================================
// PRE-SAVE GUARD — Active Occupancy / Deleted User Integrity (Layer 4)
// ============================================================================
//
// Blocks any attempt to save a reservation into an active occupancy status
// (reserved / moveIn) when the linked userId no longer exists in the database.
//
// This is a last-resort data-integrity fence. The primary prevention is in
// the user deletion controller (atomic transaction) and the nightly
// reconciliation job. This hook catches any edge-case writes that slip through.
//
// Applies only when status is being set for the first time or changed.
// Skipped entirely for non-occupancy statuses and for isArchived=true saves
// (archiving a reservation that already has a deleted user is fine).

const ACTIVE_OCCUPANCY_STATUSES = Object.freeze(["reserved", "moveIn"]);

reservationSchema.pre("save", async function (next) {
  try {
    // Skip if not modifying status, or if the reservation is being archived
    const isStatusChange = this.isNew || this.isModified("status");
    if (!isStatusChange) return next();
    if (this.isArchived) return next();
    if (!ACTIVE_OCCUPANCY_STATUSES.includes(this.status)) return next();
    if (!this.userId) return next();

    // Check whether the referenced user still exists
    const User = mongoose.model("User");
    const userExists = await User.exists({ _id: this.userId });

    if (!userExists) {
      return next(
        new Error(
          `[Reservation pre-save] Cannot set reservation ${this.reservationCode || this._id} ` +
          `to status "${this.status}" — userId ${this.userId} does not exist in the User collection. ` +
          `Archive this reservation instead.`,
        ),
      );
    }

    next();
  } catch (err) {
    // Log but don't crash — a guard failure should surface as an error, not
    // silently allow a corrupted write. We pass the error to abort the save.
    next(err);
  }
});

// ============================================================================
// EXPORT
// ============================================================================

const Reservation = mongoose.model("Reservation", reservationSchema);

export default Reservation;
