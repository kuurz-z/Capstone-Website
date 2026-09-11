import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const reservationFindById = jest.fn();
const reservationFindByIdAndUpdate = jest.fn();
const reservationFindOneAndUpdate = jest.fn((filter, update, options) => {
  const id = typeof filter === "object" && filter?._id ? filter._id : filter;
  return reservationFindByIdAndUpdate(id, update, options);
});
const reservationFind = jest.fn();
const reservationFindOne = jest.fn();
const reservationCountDocuments = jest.fn();
const userFind = jest.fn();
const userFindOne = jest.fn();
const roomFind = jest.fn();
const roomFindById = jest.fn();
const visitAvailabilityFindOne = jest.fn();
const visitAvailabilityCreate = jest.fn();
const utilityReadingFindOne = jest.fn();
const ensureCurrentCycleRentBill = jest.fn();
const moveOutStayWorkflow = jest.fn();
const notifyGeneral = jest.fn();
const notifyCancellationRequested = jest.fn();
const notifyCancellationRequestAlert = jest.fn();
const buildUserUpdatePayload = jest.fn(() => ({}));
const getForbiddenTenantUpdateFields = jest.fn(() => []);
const sendPhysicalVisitStatusEmail = jest.fn();

await jest.unstable_mockModule("../models/index.js", () => ({
  Reservation: {
    find: reservationFind,
    findById: reservationFindById,
    findByIdAndUpdate: reservationFindByIdAndUpdate,
    findOneAndUpdate: reservationFindOneAndUpdate,
    findOne: reservationFindOne,
    countDocuments: reservationCountDocuments,
  },
  User: { find: userFind, findOne: userFindOne },
  Room: { find: roomFind, findById: roomFindById },
  VisitAvailability: { findOne: visitAvailabilityFindOne, create: visitAvailabilityCreate },
  VisitAvailabilityHistory: { create: jest.fn().mockResolvedValue({}) },
  VisitConflictLog: { create: jest.fn().mockResolvedValue({}) },
  Bill: { countDocuments: jest.fn(), deleteMany: jest.fn() },
  Payment: {},
  AuditLog: { create: jest.fn() },
  UtilityReading: { findOne: utilityReadingFindOne },
  UtilityPeriod: {},
  BedHistory: {},
  Stay: { exists: jest.fn().mockResolvedValue(false) },
  Contract: {},
  ContractAcknowledgement: {
    countDocuments: jest.fn(() => ({ session: jest.fn().mockResolvedValue(0) })),
    find: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })),
    deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    create: jest.fn(),
  },
  TenantViolation: { find: jest.fn(), findOne: jest.fn(), countDocuments: jest.fn() },
  BusinessSettings: { findOne: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
  Appliance: { find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) },
  ScheduledRoomTransfer: { find: jest.fn(), findOne: jest.fn(), findById: jest.fn(), countDocuments: jest.fn() },
  ROOM_BRANCHES: ["gil-puyat", "guadalupe"],
}));

// Scheduled-room-transfer surface pulled in transitively by
// tenancyActionsController. This authz suite does not exercise transfer
// scheduling, so the whole subsystem is stubbed.
await jest.unstable_mockModule("../services/scheduledRoomTransferService.js", () => ({
  scheduleRoomTransfer: jest.fn(),
  rescheduleRoomTransfer: jest.fn(),
  completeRoomTransfer: jest.fn(),
  isFutureManilaDate: jest.fn(() => false),
  isPastManilaDate: jest.fn(() => false),
  computeRoomTransferPreview: jest.fn(),
}));
await jest.unstable_mockModule("../services/scheduledRoomTransferView.js", () => ({
  serializeScheduledRoomTransfer: jest.fn(),
  getOpenScheduledRoomTransferForReservation: jest.fn().mockResolvedValue(null),
}));
await jest.unstable_mockModule("../services/scheduledRoomTransferExecutor.js", () => ({
  cancelScheduledRoomTransfer: jest.fn(),
  retryScheduledRoomTransfer: jest.fn(),
  resolveScheduledTransferBeforeTenantDeparture: jest.fn().mockResolvedValue({ handled: false }),
  nudgeDueScheduledRoomTransfers: jest.fn(),
  executeDueScheduledRoomTransfers: jest.fn(),
}));
await jest.unstable_mockModule("../services/tenantTransferRequestService.js", () => ({
  claimTenantTransferRequestForScheduling: jest.fn(),
  linkScheduledTransferToRequest: jest.fn(),
  refreshTenantTransferSchedulingClaim: jest.fn(),
  releaseTenantTransferSchedulingClaim: jest.fn(),
  syncRequestFromScheduledTransfer: jest.fn(),
  resolveTenantTransferLifecycleRecords: jest.fn().mockResolvedValue({
    request: null,
    scheduledTransfer: null,
  }),
  serializeTenantTransferRequest: jest.fn().mockResolvedValue(null),
  getAdminTransferLifecycleForReservation: jest.fn().mockResolvedValue({
    request: null,
    scheduledTransfer: null,
  }),
}));

await jest.unstable_mockModule("../models/BusinessSettings.js", () => ({
  default: { findOne: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
}));
await jest.unstable_mockModule("../config/constants.js", () => ({
  BUSINESS: { DEPOSIT_AMOUNT: 2000 },
}));
await jest.unstable_mockModule("../middleware/logger.js", () => ({
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
await jest.unstable_mockModule("../utils/auditLogger.js", () => ({
  default: { logError: jest.fn(), logModification: jest.fn() },
}));
await jest.unstable_mockModule("../utils/occupancyManager.js", () => ({
  updateOccupancyOnReservationChange: jest.fn(),
}));
await jest.unstable_mockModule("../services/tenantContractSelectionService.js", () => ({
  CURRENT_STAY_STATUSES: Object.freeze(["active", "ending_soon"]),
  EARLY_STAGE_STATUSES: new Set(["draft", "incomplete", "ready_for_generation"]),
  resolveTenantCanonicalContract: jest.fn().mockResolvedValue(null),
  resolveCurrentStayForReservation: jest.fn().mockResolvedValue(null),
  resolveCurrentStayForTenant: jest.fn().mockResolvedValue(null),
  resolveAuthoritativeCurrentContract: jest.fn().mockResolvedValue(null),
}));
await jest.unstable_mockModule("../utils/tenantActionService.js", () => ({
  getTenantActionContext: jest.fn(),
  moveOutStayWorkflow,
  renewStayWorkflow: jest.fn(),
  transferStayWorkflow: jest.fn(),
  prepareRoomTransferAddendum: jest.fn(),
  discardRoomTransferAddendum: jest.fn(),
  cancelMoveOutStayWorkflow: jest.fn(),
  executeEarlyTerminationWorkflow: jest.fn(),
  executeDirectRoomSwapWorkflow: jest.fn(),
  executeAbandonmentProtocolWorkflow: jest.fn(),
  validateContractExtensionWorkflow: jest.fn(),
  getMonthlyRent: jest.fn(),
}));
await jest.unstable_mockModule("../utils/rentGenerator.js", () => ({
  ensureCurrentCycleRentBill,
}));
await jest.unstable_mockModule("../utils/reservationHelpers.js", () => ({
  isValidObjectId: jest.fn(() => true),
  invalidIdResponse: jest.fn(),
  handleReservationError: jest.fn(),
  checkBranchAccess: jest.fn(() => null),
  validateMoveInDate: jest.fn(() => true),
  handleStatusTransition: jest.fn(),
  syncReservationUserLifecycle: jest.fn(),
  reconcileTenantUsersForScope: jest.fn(async () => []),
  buildUserUpdatePayload,
  getForbiddenTenantUpdateFields,
  getMoveInBlockers: jest.fn(() => []),
}));
const lifecycleNamingMock = {
  CANONICAL_RESERVATION_STATUSES: Object.freeze([
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
    "moveOut",
    "rejected",
    "cancelled",
    "archived",
  ]),
  ACTIVE_OCCUPANCY_STATUS_QUERY: ["reserved", "moveIn"],
  ACTIVE_STAY_STATUS_QUERY: ["reserved", "moveIn"],
  CURRENT_RESIDENT_STATUS_QUERY: ["moveIn"],
  canTransitionReservationStatus: jest.fn((current, next) => {
    if (current === next) return true;
    if (current === "pending") {
      return ["visit_pending", "visit_approved", "viewing_preference_selected", "pending_application_review"].includes(next);
    }
    return true;
  }),
  hasReservationStatus: jest.fn((status, ...expected) => {
    const values = expected.flat();
    return values.includes(status);
  }),
  isApplicationApprovedStatus: jest.fn((status, reservation) => {
    const approved = ["approved_for_payment", "payment_pending", "reserved", "moveIn", "moveOut"];
    return (
      approved.includes(status) ||
      Boolean(reservation?.approvedForPaymentAt) ||
      Boolean(reservation?.documentsApproved)
    );
  }),
  normalizeReservationPayload: jest.fn((payload) => payload),
  normalizeReservationStatus: jest.fn((status) => status),
  readMoveInDate: jest.fn(() => null),
  readMoveOutDate: jest.fn(() => null),
  resolveMoveInConfirmationDate: jest.fn(({ moveInDate }) => moveInDate || new Date()),
  reservationStatusesForQuery: jest.fn((...statuses) => statuses.flat()),
  serializeReservation: jest.fn((value) => value),
  serializeReservations: jest.fn((values) => values),
  utilityEventTypesForQuery: jest.fn((...types) => types.flat()),
};
await jest.unstable_mockModule("../utils/lifecycleNaming.js", () => lifecycleNamingMock);
await jest.unstable_mockModule("../config/email.js", () => ({
  sendReservationConfirmedEmail: jest.fn(),
  sendVisitApprovedEmail: jest.fn(),
  sendPhysicalVisitStatusEmail,
  sendDocumentsRejectedEmail: jest.fn(),
}));
await jest.unstable_mockModule("../services/reservationDocumentPrecheckService.js", () => ({
  isAllowedReservationDocumentUrl: jest.fn((url) => typeof url === "string" && !url.startsWith("file://") && !url.startsWith("http://localhost")),
  runReservationDocumentPrecheck: jest.fn(),
}));
await jest.unstable_mockModule("../middleware/errorHandler.js", () => ({
  sendSuccess: jest.fn(),
  sendError: jest.fn(),
  AppError: class AppError extends Error {
    constructor(message, statusCode, code) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  },
}));
await jest.unstable_mockModule("../utils/notificationService.js", () => ({
  notify: {
    general: notifyGeneral,
    cancellationRequested: notifyCancellationRequested,
    cancellationRequestAlert: notifyCancellationRequestAlert,
    moveOutComplete: jest.fn().mockResolvedValue(null),
    reservationCancelled: jest.fn().mockResolvedValue(null),
  },
}));

await jest.unstable_mockModule('../services/billing/waterObservations.js',()=>({recordWaterObservation:jest.fn(),requiresWaterObservation:jest.fn(()=>false)}));

const {
  createReservation,
  manageReservationVisit,
  moveOutReservation,
  requestCancellationByUser,
  withdrawCancellationRequestByUser,
  updateReservation,
  updateReservationByUser,
  updateVisitAvailabilityRules,
} = await import("./reservationsController.js");

const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const createCompleteApplicationReservation = (overrides = {}) => ({
  _id: "507f1f77bcf86cd799439055",
  userId: "tenant-1",
  roomId: "room-1",
  status: "viewing_preference_selected",
  viewingPreference: "remote_2d_viewing",
  remoteViewingAcknowledged: true,
  agreedToPrivacy: true,
  agreedToCertification: true,
  firstName: "Tala",
  lastName: "Applicant",
  mobileNumber: "09171234567",
  birthday: new Date("1998-01-01T00:00:00.000Z"),
  maritalStatus: "single",
  nationality: "Filipino",
  educationLevel: "college",
  address: {
    region: "NCR",
    unitHouseNo: "Unit 1",
    street: "Roxas Blvd",
    province: "Metro Manila",
    city: "Pasay",
    barangay: "Barangay 1",
  },
  selfiePhotoUrl: "https://storage.example.com/selfie.jpg",
  emergencyContact: {
    name: "Parent Contact",
    relationship: "Parent",
    contactNumber: "09181234567",
  },
  healthConcerns: "None",
  employment: {
    employerSchool: "Lilycrest Co",
    employerAddress: "Makati",
    occupation: "Analyst",
  },
  referralSource: "facebook",
  targetMoveInDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  estimatedMoveInTime: "09:00",
  leaseDuration: 12,
  workSchedule: "day",
  validIDFrontUrl: "https://storage.example.com/id-front.jpg",
  validIDBackUrl: "https://storage.example.com/id-back.jpg",
  nbiReason: "To follow",
  companyIDReason: "Student applicant",
  idType: "Passport",
  validIDType: "Passport",
  applicationSubmittedAt: null,
  documentPrechecks: {},
  ...overrides,
});

const createApplicationSubmitRequest = (overrides = {}) => ({
  params: { reservationId: "507f1f77bcf86cd799439055" },
  user: { uid: "tenant-firebase-uid" },
  body: {
    submitApplication: true,
    agreedToPrivacy: true,
    agreedToCertification: true,
  },
  branchFilter: "gil-puyat",
  ...overrides,
});

describe("reservationsController.updateReservation access hardening", () => {
  beforeEach(() => {
    reservationFindById.mockReset();
    reservationFindByIdAndUpdate.mockReset();
    reservationFind.mockReset();
    reservationFindOne.mockReset();
    reservationCountDocuments.mockReset();
    userFind.mockReset();
    userFindOne.mockReset();
    roomFind.mockReset();
    roomFind.mockImplementation(() => ({ distinct: jest.fn().mockResolvedValue([]) }));
    reservationFind.mockImplementation(() => ({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    }));
    roomFindById.mockReset();
    utilityReadingFindOne.mockReset();
    visitAvailabilityFindOne.mockReset();
    visitAvailabilityCreate.mockReset();
    ensureCurrentCycleRentBill.mockReset();
    moveOutStayWorkflow.mockReset();
    notifyGeneral.mockReset();
    notifyCancellationRequested.mockReset();
    notifyCancellationRequested.mockResolvedValue(null);
    notifyCancellationRequestAlert.mockReset();
    notifyCancellationRequestAlert.mockResolvedValue(null);
    buildUserUpdatePayload.mockReset();
    buildUserUpdatePayload.mockReturnValue({});
    reservationCountDocuments.mockResolvedValue(0);
    roomFindById.mockResolvedValue({
      _id: "room-1",
      branch: "gil-puyat",
      capacity: 4,
      beds: [],
      isArchived: false,
    });
    getForbiddenTenantUpdateFields.mockReset();
    getForbiddenTenantUpdateFields.mockReturnValue([]);
    sendPhysicalVisitStatusEmail.mockReset();
    sendPhysicalVisitStatusEmail.mockResolvedValue({ success: true });
    userFindOne.mockResolvedValue(null);
  });

  test("generic admin update cannot mark a Reservation payment as paid", async () => {
    const req = {
      params: { reservationId: "507f1f77bcf86cd799439011" },
      body: { paymentStatus: "paid" },
    };
    const res = createResponse();
    const next = jest.fn();

    await updateReservation(req, res, next);

    expect(res.statusCode).toBe(422);
    expect(res.body.code).toBe(
      "PAYMENT_SETTLEMENT_REQUIRES_DEDICATED_ENDPOINT",
    );
    expect(res.body.details.fields).toContain("paymentStatus");
    expect(reservationFindById).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("generic admin update cannot reserve occupancy or replace payment evidence", async () => {
    const req = {
      params: { reservationId: "507f1f77bcf86cd799439011" },
      body: {
        status: "reserved",
        proofOfPaymentUrl: "https://example.test/replacement.jpg",
      },
    };
    const res = createResponse();
    const next = jest.fn();

    await updateReservation(req, res, next);

    expect(res.statusCode).toBe(422);
    expect(res.body.code).toBe(
      "PAYMENT_SETTLEMENT_REQUIRES_DEDICATED_ENDPOINT",
    );
    expect(res.body.details.fields).toContain("proofOfPaymentUrl");
    expect(reservationFindById).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("allows cancellation request for paid reserved legacy records", async () => {
    const reservationDoc = {
      _id: "507f1f77bcf86cd799439011",
      userId: "user-1",
      roomId: "room-1",
      status: "reserved",
      paymentStatus: "pending",
      paymentDate: new Date("2026-05-17T00:00:00.000Z"),
      reservationCode: "RES-PAID",
      cancellationRequested: false,
      cancellationStatus: null,
      save: jest.fn().mockResolvedValue(undefined),
      toObject: jest.fn(() => ({
        status: "reserved",
        paymentStatus: "pending",
        paymentDate: new Date("2026-05-17T00:00:00.000Z"),
      })),
    };
    reservationFindById.mockResolvedValue(reservationDoc);
    userFindOne.mockResolvedValue({
      _id: "user-1",
      firstName: "Lama",
      lastName: "Tenant",
      email: "lama@example.com",
    });
    roomFindById.mockReturnValue({
      select: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue({ branch: "gil-puyat" }),
      })),
    });
    userFind.mockReturnValue({
      select: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue([]),
      })),
    });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439011" },
      user: { uid: "firebase-cancel-paid" },
      body: { reason: "Plans changed" },
    };
    const res = createResponse();
    const next = jest.fn();

    await requestCancellationByUser(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Cancellation request submitted. Pending admin review.");
    expect(reservationDoc.cancellationRequested).toBe(true);
    expect(reservationDoc.cancellationStatus).toBe("pending");
    expect(reservationDoc.cancellationReason).toBe("Plans changed");
    expect(reservationDoc.save).toHaveBeenCalledTimes(1);
    expect(notifyCancellationRequested).toHaveBeenCalledWith("user-1", "RES-PAID");
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects cancellation request for unpaid reservations", async () => {
    reservationFindById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      userId: "user-1",
      status: "payment_pending",
      paymentStatus: "pending",
      paymentDate: null,
      reservedAt: null,
    });
    userFindOne.mockResolvedValue({ _id: "user-1" });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439011" },
      user: { uid: "firebase-cancel-unpaid" },
      body: {},
    };
    const res = createResponse();
    const next = jest.fn();

    await requestCancellationByUser(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("NOT_PAID_USE_DIRECT_CANCEL");
    expect(next).not.toHaveBeenCalled();
  });

  test("allows tenant to withdraw a pending cancellation request", async () => {
    const reservationDoc = {
      _id: "507f1f77bcf86cd799439011",
      userId: "user-1",
      reservationCode: "RES-WITHDRAW",
      status: "reserved",
      paymentStatus: "paid",
      cancellationRequested: true,
      cancellationStatus: "pending",
      cancellationReason: "Change of plans",
      cancellationRequestedAt: new Date(),
      cancellationRequestedBy: "user-1",
      toObject() {
        return { ...this };
      },
      save: jest.fn().mockResolvedValue(true),
    };

    reservationFindById.mockResolvedValue(reservationDoc);
    userFindOne.mockResolvedValue({ _id: "user-1", firstName: "Juan", lastName: "Dela Cruz" });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439011" },
      user: { uid: "firebase-withdraw" },
    };
    const res = createResponse();
    const next = jest.fn();

    await withdrawCancellationRequestByUser(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Cancellation request withdrawn. Your reservation remains active.");
    expect(reservationDoc.cancellationRequested).toBe(false);
    expect(reservationDoc.cancellationStatus).toBeNull();
    expect(reservationDoc.cancellationReason).toBeNull();
    expect(reservationDoc.cancellationRequestedAt).toBeNull();
    expect(reservationDoc.cancellationRequestedBy).toBeNull();
    expect(reservationDoc.save).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects cancellation withdrawal if request is not pending", async () => {
    reservationFindById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      userId: "user-1",
      status: "reserved",
      cancellationRequested: false,
      cancellationStatus: null,
    });
    userFindOne.mockResolvedValue({ _id: "user-1" });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439011" },
      user: { uid: "firebase-withdraw" },
    };
    const res = createResponse();
    const next = jest.fn();

    await withdrawCancellationRequestByUser(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("NO_PENDING_CANCELLATION_REQUEST");
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects cancellation withdrawal by unauthorized user", async () => {
    reservationFindById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      userId: "user-1",
      status: "reserved",
      cancellationRequested: true,
      cancellationStatus: "pending",
    });
    userFindOne.mockResolvedValue({ _id: "user-2" });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439011" },
      user: { uid: "firebase-intruder" },
    };
    const res = createResponse();
    const next = jest.fn();

    await withdrawCancellationRequestByUser(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("UNAUTHORIZED");
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects protected fields from tenant self-updates", async () => {
    userFindOne.mockResolvedValue({ _id: "user-1" });
    reservationFindById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      userId: "user-1",
      status: "visit_approved",
    });
    getForbiddenTenantUpdateFields.mockReturnValue(["status", "proofOfPaymentUrl"]);

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439011" },
      user: { uid: "firebase-1" },
      body: { status: "reserved", proofOfPaymentUrl: "https://example.test/proof.jpg" },
    };
    const res = createResponse();
    const next = jest.fn();

    await updateReservationByUser(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe("TENANT_FIELD_NOT_ALLOWED");
    expect(res.body.fields).toEqual(["status", "proofOfPaymentUrl"]);
    expect(buildUserUpdatePayload).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects application submission before visit approval", async () => {
    userFindOne.mockResolvedValue({ _id: "user-1" });
    reservationFindById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      userId: "user-1",
      status: "visit_pending",
      viewingPreference: "physical_visit",
    });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439011" },
      user: { uid: "firebase-1" },
      body: { submitApplication: true },
    };
    const res = createResponse();
    const next = jest.fn();

    await updateReservationByUser(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("PHYSICAL_VISIT_APPLICATION_LOCKED");
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects incomplete final application submission", async () => {
    userFindOne.mockResolvedValue({ _id: "user-1" });
    reservationFindById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      userId: "user-1",
      status: "visit_approved",
      address: {},
      emergencyContact: {},
      employment: {},
    });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439011" },
      user: { uid: "firebase-1" },
      body: { submitApplication: true },
    };
    const res = createResponse();
    const next = jest.fn();

    await updateReservationByUser(req, res, next);

    expect(res.statusCode).toBe(422);
    expect(res.body.code).toBe("APPLICATION_INCOMPLETE");
    expect(res.body.missingFields).toContain("first name");
    expect(res.body.missingFields).toContain("valid ID (front)");
    expect(next).not.toHaveBeenCalled();
  });

  test("allows application draft autosave without submitting the application", async () => {
    userFindOne.mockResolvedValue({ _id: "tenant-1" });
    const existingReservation = {
      _id: "507f1f77bcf86cd799439101",
      userId: "tenant-1",
      roomId: "room-1",
      status: "visit_approved",
      viewingPreference: "remote_2d_viewing",
      viewingType: "remote_2d",
      remoteViewingAcknowledged: true,
      applicationSubmittedAt: null,
      emergencyContact: {},
      employment: {},
      documentPrechecks: {},
    };
    const updatedReservation = {
      ...existingReservation,
      firstName: "Ana",
      validIDFrontUrl: "https://storage.example.com/id-front.jpg",
    };
    reservationFindById.mockResolvedValue(existingReservation);
    buildUserUpdatePayload.mockReturnValue({
      firstName: "Ana",
      validIDFrontUrl: "https://storage.example.com/id-front.jpg",
      validIDType: "passport",
    });
    reservationFindByIdAndUpdate.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve(resolve(updatedReservation)),
    });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439101" },
      user: { uid: "tenant-firebase-uid" },
      body: {
        applicationDraftAutosave: true,
        firstName: "Ana",
        validIDFrontUrl: "https://storage.example.com/id-front.jpg",
        validIDType: "passport",
      },
    };
    const res = createResponse();
    const next = jest.fn();

    await updateReservationByUser(req, res, next);

    expect(res.statusCode).toBe(200);
    const updateOperation = reservationFindByIdAndUpdate.mock.calls[0][1];
    expect(updateOperation.$set).toEqual(
      expect.objectContaining({
        firstName: "Ana",
        validIDFrontUrl: "https://storage.example.com/id-front.jpg",
        validIDType: "passport",
      }),
    );
    expect(updateOperation.$set.submitApplication).toBeUndefined();
    expect(updateOperation.$set.applicationSubmittedAt).toBeUndefined();
    expect(updateOperation.$set.status).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects application draft autosave after the application is under review", async () => {
    userFindOne.mockResolvedValue({ _id: "tenant-1" });
    reservationFindById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439102",
      userId: "tenant-1",
      roomId: "room-1",
      status: "pending_application_review",
      applicationSubmittedAt: new Date("2026-05-17T08:00:00.000Z"),
      emergencyContact: {},
      employment: {},
      documentPrechecks: {},
    });
    buildUserUpdatePayload.mockReturnValue({ firstName: "Ana" });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439102" },
      user: { uid: "tenant-firebase-uid" },
      body: { applicationDraftAutosave: true, firstName: "Ana" },
    };
    const res = createResponse();
    const next = jest.fn();

    await updateReservationByUser(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBe("APPLICATION_DRAFT_LOCKED");
    expect(reservationFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects invalid lifecycle jumps before mutating reservation", async () => {
    reservationFindById.mockReturnValue({
      populate: jest.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439011",
        status: "pending",
        userId: "user-1",
        roomId: { _id: "room-1", branch: "gil-puyat" },
        toObject: () => ({
          status: "pending",
          userId: "user-1",
          roomId: { _id: "room-1", branch: "gil-puyat" },
        }),
      }),
    });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439011" },
      body: { status: "moveOut" },
      branchFilter: "gil-puyat",
    };
    const res = createResponse();
    const next = jest.fn();

    await updateReservation(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe("INVALID_RESERVATION_STATUS_TRANSITION");
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects direct admin visit updates after a visit is completed", async () => {
    reservationFindById.mockReturnValue({
      populate: jest.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439099",
        status: "visit_approved",
        visitStatus: "visit_completed",
        visitApproved: true,
        userId: "user-1",
        roomId: { _id: "room-1", branch: "gil-puyat" },
        toObject: () => ({
          status: "visit_approved",
          visitStatus: "visit_completed",
          visitApproved: true,
          userId: "user-1",
          roomId: { _id: "room-1", branch: "gil-puyat" },
        }),
      }),
    });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439099" },
      body: { visitStatus: "no_show" },
      branchFilter: "gil-puyat",
    };
    const res = createResponse();
    const next = jest.fn();

    await updateReservation(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      error: "Visit is already completed and cannot be changed.",
      code: "VISIT_ALREADY_COMPLETED",
    });
    expect(reservationFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("move-out reads meterReading from request body before running workflow", async () => {
    const reservation = {
      _id: "507f1f77bcf86cd799439011",
      status: "moveIn",
      userId: { _id: "tenant-1", firstName: "Tala", lastName: "Tenant", email: "tala@example.com" },
      roomId: { _id: "room-1", branch: "gil-puyat", name: "Room 1" },
      toObject: () => ({
        _id: "507f1f77bcf86cd799439011",
        status: "moveIn",
        userId: "tenant-1",
        roomId: { _id: "room-1", branch: "gil-puyat", name: "Room 1" },
      }),
    };
    const populatedQuery = {
      populate: jest.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve(resolve(reservation)),
    };
    reservationFindById.mockReturnValue(populatedQuery);
    moveOutStayWorkflow.mockResolvedValue({
      reservation,
      stay: { _id: "stay-1", status: "completed" },
      billingSummary: { outstandingBalance: 0 },
    });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439011" },
      body: { meterReading: 128, moveOutDate: "2026-05-02" },
      branchFilter: "gil-puyat",
      user: { uid: "admin-uid" },
    };
    const res = createResponse();
    const next = jest.fn();

    await moveOutReservation(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(moveOutStayWorkflow).toHaveBeenCalledWith({
      reservationId: "507f1f77bcf86cd799439011",
      payload: { ...req.body, finalUtilityReading: 128 },
      actorId: null,
    });
    expect(res.body.message).toBe("Tenant moved out successfully");
    expect(next).not.toHaveBeenCalled();
  });



  test("branch admins cannot update another branch visit availability", async () => {
    userFindOne.mockResolvedValue({
      _id: "admin-1",
      role: "branch_admin",
      branch: "gil-puyat",
      email: "admin@example.com",
    });

    const req = {
      query: { branch: "guadalupe" },
      body: { enabledWeekdays: [1, 2, 3, 4, 5] },
      user: { uid: "admin-uid" },
    };
    const res = createResponse();
    const next = jest.fn();

    await updateVisitAvailabilityRules(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("BRANCH_ACCESS_DENIED");
    expect(visitAvailabilityFindOne).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("owners can update any branch visit availability", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    userFindOne.mockResolvedValue({
      _id: "owner-1",
      role: "owner",
      branch: null,
      email: "owner@example.com",
    });
    visitAvailabilityFindOne.mockResolvedValue({
      branch: "guadalupe",
      enabledWeekdays: [1, 2, 3, 4, 5],
      slots: [{ label: "09:00 AM", enabled: true, capacity: 5 }],
      blackoutDates: [],
      save,
    });

    const req = {
      query: { branch: "guadalupe" },
      body: { enabledWeekdays: [1, 3, 5] },
      user: { uid: "owner-uid" },
    };
    const res = createResponse();
    const next = jest.fn();

    await updateVisitAvailabilityRules(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(save).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("visit management stays unavailable for non-physical viewing preferences", async () => {
    const reservation = {
      _id: "507f1f77bcf86cd799439011",
      status: "pending_application_review",
      viewingPreference: "remote_2d_viewing",
      visitDate: null,
      visitTime: "",
      roomId: { _id: "room-1", branch: "gil-puyat" },
      userId: { _id: "tenant-1", email: "tala@example.com" },
      toObject: () => ({
        _id: "507f1f77bcf86cd799439011",
        status: "pending_application_review",
        viewingPreference: "remote_2d_viewing",
        roomId: { _id: "room-1", branch: "gil-puyat" },
      }),
      populate: jest.fn().mockResolvedValue(undefined),
      save: jest.fn(),
    };
    reservationFindById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve(resolve(reservation)),
    });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439011" },
      body: { action: "mark_visited" },
      branchFilter: "gil-puyat",
      user: { uid: "admin-uid", email: "admin@example.com" },
    };
    const res = createResponse();
    const next = jest.fn();

    await manageReservationVisit(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("VISIT_MANAGEMENT_NOT_APPLICABLE");
    expect(reservation.save).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("active reservation blocker excludes rejected records but still blocks truly active reservations", async () => {
    userFindOne.mockResolvedValue({
      _id: "tenant-1",
      firebaseUid: "tenant-uid",
      email: "tala@example.com",
    });
    reservationFindOne.mockResolvedValue({
      _id: "507f1f77bcf86cd799439017",
      status: "pending",
    });

    const req = {
      body: {
        roomId: "507f1f77bcf86cd799439018",
        moveInDate: "2026-06-20T00:00:00.000Z",
      },
      user: { uid: "tenant-uid", email: "tala@example.com" },
    };
    const res = createResponse();
    const next = jest.fn();

    await createReservation(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body?.code).toBe("RESERVATION_ALREADY_EXISTS");
    expect(reservationFindOne).toHaveBeenCalledWith(
      expect.objectContaining({
        status: {
          $nin: expect.arrayContaining(["cancelled", "archived", "moveOut", "rejected"]),
        },
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("createReservation does not reject when intendedMoveInDate is omitted", async () => {
    userFindOne.mockResolvedValue({
      _id: "tenant-1",
      firebaseUid: "tenant-uid",
      email: "tala@example.com",
    });
    reservationFindOne.mockResolvedValue(null);

    const req = {
      body: {
        roomId: "507f1f77bcf86cd799439018",
      },
      user: { uid: "tenant-uid", email: "tala@example.com" },
    };
    const res = createResponse();
    const next = jest.fn();

    await createReservation(req, res, next);

    expect(res.body?.code).not.toBe("MOVEIN_DATE_REQUIRED");
  });

  test("createReservation rejects request when intendedMoveInDate is less than 3 days from today", async () => {
    userFindOne.mockResolvedValue({
      _id: "tenant-1",
      firebaseUid: "tenant-uid",
      email: "tala@example.com",
    });
    reservationFindOne.mockResolvedValue(null);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const req = {
      body: {
        roomId: "507f1f77bcf86cd799439018",
        intendedMoveInDate: tomorrow.toISOString().split("T")[0],
      },
      user: { uid: "tenant-uid", email: "tala@example.com" },
    };
    const res = createResponse();
    const next = jest.fn();

    await createReservation(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body?.code).toBe("MOVEIN_DATE_TOO_SOON");
    expect(res.body?.error).toBe("Move-in date must be at least 3 days from today.");
  });

  test("tenant cannot switch to remote viewing after a physical visit was already saved", async () => {
    reservationFindById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      userId: "tenant-1",
      roomId: "room-1",
      status: "pending",
      visitDate: new Date("2026-05-15T00:00:00.000Z"),
      visitTime: "09:00 AM",
      remoteViewingAcknowledged: false,
      agreedToPrivacy: false,
      scheduleRejected: false,
      validIDFrontUrl: null,
      nbiClearanceUrl: null,
      companyIDUrl: null,
      emergencyContact: {},
      employment: {},
      idType: null,
      validIDType: null,
    });
    buildUserUpdatePayload.mockReturnValue({
      agreedToPrivacy: true,
      remoteViewingAcknowledged: true,
      remoteViewingQuestions: "",
    });
    const req = {
      params: { reservationId: "507f1f77bcf86cd799439011" },
      user: { uid: "tenant-firebase-uid" },
      body: {
        agreedToPrivacy: true,
        viewingPreference: "remote_2d_viewing",
        remoteViewingAcknowledged: true,
        remoteViewingQuestions: "",
      },
    };
    const res = createResponse();
    const next = jest.fn();

    userFindOne.mockResolvedValue({
      _id: "tenant-1",
      firebaseUid: "tenant-firebase-uid",
      role: "applicant",
    });

    await updateReservationByUser(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBe("VIEWING_PREFERENCE_LOCKED");
    expect(reservationFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("tenant cannot switch to physical visit after remote viewing was already saved", async () => {
    reservationFindById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439021",
      userId: "tenant-1",
      roomId: "room-1",
      status: "viewing_preference_selected",
      viewingPreference: "remote_2d_viewing",
      viewingType: "remote_2d",
      remoteViewingAcknowledged: true,
      remoteViewingQuestions: "",
      agreedToPrivacy: true,
      scheduleRejected: false,
      validIDFrontUrl: null,
      nbiClearanceUrl: null,
      companyIDUrl: null,
      emergencyContact: {},
      employment: {},
      idType: null,
      validIDType: null,
    });
    buildUserUpdatePayload.mockReturnValue({
      viewingPreference: "physical_visit",
      visitDate: "2099-06-01",
      visitTime: "09:00 AM",
      agreedToPrivacy: true,
    });
    const req = {
      params: { reservationId: "507f1f77bcf86cd799439021" },
      user: { uid: "tenant-firebase-uid" },
      body: {
        viewingPreference: "physical_visit",
        visitDate: "2099-06-01",
        visitTime: "09:00 AM",
        agreedToPrivacy: true,
      },
    };
    const res = createResponse();
    const next = jest.fn();

    userFindOne.mockResolvedValue({
      _id: "tenant-1",
      firebaseUid: "tenant-firebase-uid",
      role: "applicant",
    });

    await updateReservationByUser(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBe("VIEWING_PREFERENCE_LOCKED");
    expect(reservationFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("tenant cannot switch to remote viewing after priority review was already saved", async () => {
    reservationFindById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439022",
      userId: "tenant-1",
      roomId: "room-1",
      status: "viewing_preference_selected",
      viewingPreference: "urgent_move_in_review",
      viewingType: "urgent_move_in",
      isUrgentMoveIn: true,
      remoteViewingAcknowledged: false,
      remoteViewingQuestions: "",
      agreedToPrivacy: true,
      scheduleRejected: false,
      validIDFrontUrl: null,
      nbiClearanceUrl: null,
      companyIDUrl: null,
      emergencyContact: {},
      employment: {},
      idType: null,
      validIDType: null,
    });
    buildUserUpdatePayload.mockReturnValue({
      viewingPreference: "remote_2d_viewing",
      remoteViewingAcknowledged: true,
      remoteViewingQuestions: "",
    });
    const req = {
      params: { reservationId: "507f1f77bcf86cd799439022" },
      user: { uid: "tenant-firebase-uid" },
      body: {
        viewingPreference: "remote_2d_viewing",
        remoteViewingAcknowledged: true,
        remoteViewingQuestions: "",
      },
    };
    const res = createResponse();
    const next = jest.fn();

    userFindOne.mockResolvedValue({
      _id: "tenant-1",
      firebaseUid: "tenant-firebase-uid",
      role: "applicant",
    });

    await updateReservationByUser(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBe("VIEWING_PREFERENCE_LOCKED");
    expect(reservationFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("tenant preference change returns 409 when admin reset is stale after processing started", async () => {
    reservationFindById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439024",
      userId: "tenant-1",
      roomId: "room-1",
      status: "pending_application_review",
      viewingPreference: "remote_2d_viewing",
      viewingType: "remote_2d",
      remoteViewingAcknowledged: true,
      remoteViewingQuestions: "",
      viewingPreferenceChangeStatus: "approved",
      applicationSubmittedAt: new Date("2026-05-17T08:00:00.000Z"),
      agreedToPrivacy: true,
      scheduleRejected: false,
      validIDFrontUrl: null,
      nbiClearanceUrl: null,
      companyIDUrl: null,
      emergencyContact: {},
      employment: {},
      idType: null,
      validIDType: null,
    });
    buildUserUpdatePayload.mockReturnValue({
      viewingPreference: "urgent_move_in_review",
      isUrgentMoveIn: true,
    });
    const req = {
      params: { reservationId: "507f1f77bcf86cd799439024" },
      user: { uid: "tenant-firebase-uid" },
      body: {
        viewingPreference: "urgent_move_in_review",
        isUrgentMoveIn: true,
      },
    };
    const res = createResponse();
    const next = jest.fn();

    userFindOne.mockResolvedValue({
      _id: "tenant-1",
      firebaseUid: "tenant-firebase-uid",
      role: "applicant",
    });

    await updateReservationByUser(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBe("VIEWING_PREFERENCE_LOCKED");
    expect(reservationFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("tenant can save first remote viewing preference when only default inperson viewing type exists", async () => {
    const existingReservation = {
      _id: "507f1f77bcf86cd799439023",
      userId: "tenant-1",
      roomId: "room-1",
      status: "pending",
      viewingPreference: null,
      viewingType: "inperson",
      visitDate: null,
      visitTime: "",
      visitCode: null,
      visitStatus: null,
      remoteViewingAcknowledged: false,
      remoteViewingQuestions: "",
      isUrgentMoveIn: false,
      agreedToPrivacy: false,
      scheduleRejected: false,
      validIDFrontUrl: null,
      nbiClearanceUrl: null,
      companyIDUrl: null,
      emergencyContact: {},
      employment: {},
      idType: null,
      validIDType: null,
    };
    const updatedReservation = {
      ...existingReservation,
      status: "viewing_preference_selected",
      userId: { _id: "tenant-1", email: "tala@example.com" },
      roomId: { _id: "room-1", branch: "gil-puyat", name: "Room 1" },
      viewingPreference: "remote_2d_viewing",
      viewingType: "remote_2d",
      remoteViewingAcknowledged: true,
    };

    reservationFindById.mockResolvedValue(existingReservation);
    buildUserUpdatePayload.mockReturnValue({
      viewingPreference: "remote_2d_viewing",
      remoteViewingAcknowledged: true,
      remoteViewingQuestions: "",
    });
    reservationFindByIdAndUpdate.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve(resolve(updatedReservation)),
    });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439023" },
      user: { uid: "tenant-firebase-uid" },
      body: {
        viewingPreference: "remote_2d_viewing",
        remoteViewingAcknowledged: true,
        remoteViewingQuestions: "",
      },
    };
    const res = createResponse();
    const next = jest.fn();

    userFindOne.mockResolvedValue({
      _id: "tenant-1",
      firebaseUid: "tenant-firebase-uid",
      role: "applicant",
    });

    await updateReservationByUser(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.body?.reservation?.viewingPreference).toBe("remote_2d_viewing");
    const updateOperation = reservationFindByIdAndUpdate.mock.calls[0][1];
    expect(updateOperation.$set.visitCode).toBeUndefined();
    expect(updateOperation.$unset).toEqual(
      expect.objectContaining({ visitCode: "" }),
    );
    expect(reservationFindByIdAndUpdate).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439023",
      expect.objectContaining({
        $set: expect.objectContaining({
          viewingPreference: "remote_2d_viewing",
          viewingType: "remote_2d",
          remoteViewingAcknowledged: true,
          status: "viewing_preference_selected",
        }),
      }),
      { new: true, runValidators: true },
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("tenant physical visit schedule is persisted for admin review", async () => {
    const existingReservation = {
      _id: "507f1f77bcf86cd799439011",
      userId: "tenant-1",
      roomId: "room-1",
      status: "pending",
      viewingPreference: null,
      viewingType: null,
      visitDate: null,
      visitTime: "",
      visitCode: null,
      remoteViewingAcknowledged: false,
      agreedToPrivacy: false,
      scheduleRejected: false,
      validIDFrontUrl: null,
      nbiClearanceUrl: null,
      companyIDUrl: null,
      emergencyContact: {},
      employment: {},
      idType: null,
      validIDType: null,
    };
    const updatedReservation = {
      ...existingReservation,
      status: "visit_pending",
      userId: { _id: "tenant-1", email: "tala@example.com" },
      roomId: { _id: "room-1", branch: "gil-puyat", name: "Room 1" },
      viewingPreference: "physical_visit",
      viewingType: "inperson",
      visitDate: new Date("2099-06-01T00:00:00.000Z"),
      visitTime: "09:00 AM",
      visitCode: "VIS-ABC123",
    };

    reservationFindById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ visitCode: null, visitScheduledAt: null }),
      then: (resolve) => Promise.resolve(resolve(existingReservation)),
    });
    roomFindById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ branch: "gil-puyat", capacity: 4, currentOccupancy: 1, isAvailable: true }),
    });
    visitAvailabilityFindOne.mockResolvedValue({
      branch: "gil-puyat",
      enabledWeekdays: [0, 1, 2, 3, 4, 5, 6],
      slots: [{ label: "09:00 AM", enabled: true, capacity: 5 }],
      blackoutDates: [],
      weekdaySystem: "js-get-day",
    });
    roomFind.mockReturnValue({
      distinct: jest.fn().mockResolvedValue(["room-1"]),
    });
    reservationFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    reservationFindOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });
    buildUserUpdatePayload.mockReturnValue({
      agreedToPrivacy: true,
      viewingPreference: "physical_visit",
      visitDate: "2099-06-01",
      visitTime: "09:00 AM",
    });
    reservationFindByIdAndUpdate.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve(resolve(updatedReservation)),
    });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439011" },
      user: { uid: "tenant-firebase-uid" },
      body: {
        agreedToPrivacy: true,
        viewingPreference: "physical_visit",
        visitDate: "2099-06-01",
        visitTime: "09:00 AM",
      },
    };
    const res = createResponse();
    const next = jest.fn();

    userFindOne.mockResolvedValue({
      _id: "tenant-1",
      firebaseUid: "tenant-firebase-uid",
      role: "applicant",
    });

    await updateReservationByUser(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.body?.reservation?.viewingPreference).toBe("physical_visit");
    expect(reservationFindByIdAndUpdate).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439011",
      expect.objectContaining({
        $set: expect.objectContaining({
          agreedToPrivacy: true,
          viewingPreference: "physical_visit",
          viewingType: "inperson",
          visitDate: expect.any(Date),
          visitTime: "09:00 AM",
          visitCode: expect.stringMatching(/^VIS-/),
          visitScheduledAt: expect.any(Date),
          visitStatus: "schedule_approved",
          status: "visit_approved",
        }),
      }),
      { new: true, runValidators: true },
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("physical-visit applicants cannot submit the tenant application before visit clearance", async () => {
    reservationFindById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439012",
      userId: "tenant-1",
      roomId: "room-1",
      status: "viewing_preference_selected",
      viewingPreference: "physical_visit",
      visitDate: new Date("2026-05-18T00:00:00.000Z"),
      visitTime: "10:00 AM",
      visitStatus: "physical_visit_scheduled",
      agreedToPrivacy: true,
      agreedToCertification: true,
      firstName: null,
      lastName: null,
      mobileNumber: null,
      selfiePhotoUrl: null,
      emergencyContact: {},
      validIDFrontUrl: null,
      nbiClearanceUrl: null,
      companyIDUrl: null,
      idType: null,
      validIDType: null,
      applicationSubmittedAt: null,
    });
    buildUserUpdatePayload.mockReturnValue({
      firstName: "Tala",
      lastName: "Applicant",
      mobileNumber: "09123456789",
      agreedToPrivacy: true,
      agreedToCertification: true,
      selfiePhotoUrl: "https://example.com/selfie.jpg",
      validIDFrontUrl: "https://example.com/id-front.jpg",
      validIDBackUrl: "https://example.com/id-back.jpg",
      nbiReason: "To follow",
      companyIDReason: "Student applicant",
      idType: "Passport",
      validIDType: "Passport",
      "emergencyContact.name": "Parent Contact",
      "emergencyContact.contactNumber": "09123456789",
    });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439012" },
      user: { uid: "tenant-firebase-uid" },
      body: {
        submitApplication: true,
        firstName: "Tala",
        lastName: "Applicant",
        mobileNumber: "09123456789",
        agreedToPrivacy: true,
        agreedToCertification: true,
      },
    };
    const res = createResponse();
    const next = jest.fn();

    userFindOne.mockResolvedValue({
      _id: "tenant-1",
      firebaseUid: "tenant-firebase-uid",
      role: "applicant",
    });

    await updateReservationByUser(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body?.code).toBe("PHYSICAL_VISIT_APPLICATION_LOCKED");
    expect(reservationFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("tenant application submission requires fresh final agreements", async () => {
    reservationFindById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439015",
      userId: "tenant-1",
      roomId: "room-1",
      status: "viewing_preference_selected",
      viewingPreference: "remote_2d_viewing",
      remoteViewingAcknowledged: true,
      agreedToPrivacy: true,
      agreedToCertification: true,
      firstName: "Tala",
      lastName: "Applicant",
      mobileNumber: "09123456789",
      birthday: new Date("1998-01-01T00:00:00.000Z"),
      maritalStatus: "single",
      nationality: "Filipino",
      educationLevel: "college",
      address: {
        region: "NCR",
        unitHouseNo: "Unit 1",
        street: "Roxas Blvd",
        province: "Metro Manila",
        city: "Pasay",
        barangay: "Barangay 1",
      },
      selfiePhotoUrl: "https://example.com/selfie.jpg",
      emergencyContact: {
        name: "Parent Contact",
        relationship: "Parent",
        contactNumber: "09123456789",
      },
      healthConcerns: "None",
      employment: {
        employerSchool: "Lilycrest Co",
        employerAddress: "Makati",
        occupation: "Analyst",
      },
      referralSource: "facebook",
      targetMoveInDate: new Date("2099-06-01T00:00:00.000Z"),
      estimatedMoveInTime: "09:00",
      leaseDuration: 12,
      workSchedule: "day",
      validIDFrontUrl: "https://example.com/id-front.jpg",
      validIDBackUrl: "https://example.com/id-back.jpg",
      nbiReason: "To follow",
      companyIDReason: "Student applicant",
      idType: "Passport",
      validIDType: "Passport",
      applicationSubmittedAt: null,
    });
    buildUserUpdatePayload.mockReturnValue({});

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439015" },
      user: { uid: "tenant-firebase-uid" },
      body: { submitApplication: true },
    };
    const res = createResponse();
    const next = jest.fn();

    userFindOne.mockResolvedValue({
      _id: "tenant-1",
      firebaseUid: "tenant-firebase-uid",
      role: "applicant",
    });

    await updateReservationByUser(req, res, next);

    expect(res.statusCode).toBe(422);
    expect(res.body?.code).toBe("APPLICATION_INCOMPLETE");
    expect(res.body?.missingFields).toEqual(
      expect.arrayContaining([
        "privacy policy agreement",
        "certification agreement",
      ]),
    );
    expect(reservationFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("tenant application submission rejects local uploaded document URLs", async () => {
    reservationFindById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439041",
      userId: "tenant-1",
      roomId: "room-1",
      status: "viewing_preference_selected",
      viewingPreference: "remote_2d_viewing",
      remoteViewingAcknowledged: true,
      agreedToPrivacy: true,
      agreedToCertification: true,
      firstName: "Tala",
      lastName: "Applicant",
      mobileNumber: "09123456789",
      birthday: new Date("1998-01-01T00:00:00.000Z"),
      maritalStatus: "single",
      nationality: "Filipino",
      educationLevel: "college",
      address: {
        region: "NCR",
        unitHouseNo: "Unit 1",
        street: "Roxas Blvd",
        province: "Metro Manila",
        city: "Pasay",
        barangay: "Barangay 1",
      },
      selfiePhotoUrl: "file:///tmp/selfie.jpg",
      emergencyContact: {
        name: "Parent Contact",
        relationship: "Parent",
        contactNumber: "09123456789",
      },
      healthConcerns: "None",
      employment: {
        employerSchool: "Lilycrest Co",
        employerAddress: "Makati",
        occupation: "Analyst",
      },
      referralSource: "facebook",
      targetMoveInDate: new Date("2099-06-01T00:00:00.000Z"),
      estimatedMoveInTime: "09:00",
      leaseDuration: 12,
      workSchedule: "day",
      validIDFrontUrl: "https://firebasestorage.googleapis.com/v0/b/demo/o/id-front.jpg",
      validIDBackUrl: "https://firebasestorage.googleapis.com/v0/b/demo/o/id-back.jpg",
      nbiReason: "To follow",
      companyIDReason: "Student applicant",
      idType: "Passport",
      validIDType: "Passport",
      applicationSubmittedAt: null,
      documentPrechecks: {},
    });
    buildUserUpdatePayload.mockReturnValue({});

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439041" },
      user: { uid: "tenant-firebase-uid" },
      body: {
        submitApplication: true,
        agreedToPrivacy: true,
        agreedToCertification: true,
      },
    };
    const res = createResponse();
    const next = jest.fn();

    userFindOne.mockResolvedValue({
      _id: "tenant-1",
      firebaseUid: "tenant-firebase-uid",
      role: "applicant",
    });

    await updateReservationByUser(req, res, next);

    expect(res.statusCode).toBe(422);
    expect(res.body?.code).toBe("INVALID_DOCUMENT_URLS");
    expect(res.body?.documentIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "selfiePhotoUrl",
          label: "profile photo",
        }),
      ]),
    );
    expect(reservationFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("tenant application submission revalidates room capacity before final submit", async () => {
    const reservationId = "507f1f77bcf86cd799439055";
    reservationFindById.mockResolvedValue(
      createCompleteApplicationReservation({
        _id: reservationId,
        roomId: "room-1",
      }),
    );
    roomFindById.mockResolvedValue({
      _id: "room-1",
      branch: "gil-puyat",
      capacity: 1,
      beds: [],
      isArchived: false,
    });
    reservationCountDocuments.mockResolvedValue(1);
    userFindOne.mockResolvedValue({
      _id: "tenant-1",
      firebaseUid: "tenant-firebase-uid",
      role: "applicant",
    });

    const req = createApplicationSubmitRequest({
      params: { reservationId },
    });
    const res = createResponse();
    const next = jest.fn();

    await updateReservationByUser(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body?.code).toBe("ROOM_UNAVAILABLE");
    expect(reservationCountDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "room-1",
        _id: { $ne: reservationId },
      }),
    );
    expect(reservationFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("tenant application submission revalidates selected bed before final submit", async () => {
    const reservationId = "507f1f77bcf86cd799439056";
    reservationFindById.mockResolvedValue(
      createCompleteApplicationReservation({
        _id: reservationId,
        roomId: "room-1",
        selectedBed: { id: "bed-a", position: "upper" },
      }),
    );
    roomFindById.mockResolvedValue({
      _id: "room-1",
      branch: "gil-puyat",
      capacity: 4,
      beds: [{ id: "bed-a", position: "upper", status: "available" }],
      isArchived: false,
    });
    reservationCountDocuments.mockResolvedValue(0);
    reservationFindOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439099",
        status: "reserved",
        selectedBed: { id: "bed-a", position: "upper" },
      }),
    });
    userFindOne.mockResolvedValue({
      _id: "tenant-1",
      firebaseUid: "tenant-firebase-uid",
      role: "applicant",
    });

    const req = createApplicationSubmitRequest({
      params: { reservationId },
    });
    const res = createResponse();
    const next = jest.fn();

    await updateReservationByUser(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBe("BED_UNAVAILABLE");
    expect(reservationFindOne).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "room-1",
        "selectedBed.id": "bed-a",
        _id: { $ne: reservationId },
      }),
    );
    expect(reservationFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("admin can allow application progress without a completed physical visit", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const populate = jest.fn().mockResolvedValue(undefined);
    const reservation = {
      _id: "507f1f77bcf86cd799439013",
      status: "viewing_preference_selected",
      viewingPreference: "physical_visit",
      visitDate: new Date("2026-05-20T00:00:00.000Z"),
      visitTime: "01:00 PM",
      visitCode: "VIS-123456",
      visitHistory: [],
      roomId: { _id: "room-1", branch: "gil-puyat", roomNumber: "301", name: "Room 301" },
      userId: {
        _id: "tenant-1",
        firstName: "Tala",
        lastName: "Applicant",
        email: "tala@example.com",
      },
      toObject: () => ({
        _id: "507f1f77bcf86cd799439013",
        status: "viewing_preference_selected",
        viewingPreference: "physical_visit",
      }),
      populate,
      save,
    };
    reservationFindById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve(resolve(reservation)),
    });
    userFindOne.mockResolvedValue({
      _id: "admin-1",
      firebaseUid: "admin-uid",
      role: "branch_admin",
      firstName: "Branch",
      lastName: "Admin",
      email: "admin@example.com",
    });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439013" },
      body: { action: "allow_without_visit", note: "Proceed with documents first." },
      branchFilter: "gil-puyat",
      user: { uid: "admin-uid", email: "admin@example.com" },
    };
    const res = createResponse();
    const next = jest.fn();

    await manageReservationVisit(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.body?.reservation?.visitStatus).toBe("allowed_without_visit");
    expect(reservation.status).toBe("visit_approved");
    expect(sendPhysicalVisitStatusEmail).toHaveBeenCalled();
    expect(save).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("admin completing a physical visit unlocks application progress", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const populate = jest.fn().mockResolvedValue(undefined);
    const reservation = {
      _id: "507f1f77bcf86cd799439015",
      status: "visit_pending",
      viewingPreference: "physical_visit",
      visitStatus: "schedule_approved",
      scheduleApproved: true,
      visitApproved: false,
      visitDate: new Date("2026-05-20T00:00:00.000Z"),
      visitTime: "01:00 PM",
      visitHistory: [],
      roomId: { _id: "room-1", branch: "gil-puyat", roomNumber: "301", name: "Room 301" },
      userId: { _id: "tenant-1", firstName: "Tala", lastName: "Applicant", email: "tala@example.com" },
      toObject: () => ({ _id: "507f1f77bcf86cd799439015", status: "visit_pending" }),
      populate,
      save,
    };
    reservationFindById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve(resolve(reservation)),
    });
    userFindOne.mockResolvedValue({
      _id: "admin-1",
      firebaseUid: "admin-uid",
      role: "branch_admin",
      firstName: "Branch",
      lastName: "Admin",
      email: "admin@example.com",
    });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439015" },
      body: { action: "mark_visited", note: "Applicant attended." },
      branchFilter: "gil-puyat",
      user: { uid: "admin-uid", email: "admin@example.com" },
    };
    const res = createResponse();
    const next = jest.fn();

    await manageReservationVisit(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.body?.reservation?.visitStatus).toBe("visit_completed");
    expect(reservation.status).toBe("visit_approved");
    expect(reservation.visitApproved).toBe(true);
    expect(save).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("admin marking no-show keeps the reservation active for rescheduling", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const populate = jest.fn().mockResolvedValue(undefined);
    const reservation = {
      _id: "507f1f77bcf86cd799439016",
      status: "visit_approved",
      viewingPreference: "physical_visit",
      visitStatus: "schedule_approved",
      scheduleApproved: true,
      visitApproved: false,
      visitDate: new Date("2026-05-20T00:00:00.000Z"),
      visitTime: "01:00 PM",
      visitHistory: [],
      roomId: { _id: "room-1", branch: "gil-puyat", roomNumber: "301", name: "Room 301" },
      userId: { _id: "tenant-1", firstName: "Tala", lastName: "Applicant", email: "tala@example.com" },
      toObject: () => ({ _id: "507f1f77bcf86cd799439016", status: "visit_approved" }),
      populate,
      save,
    };
    reservationFindById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve(resolve(reservation)),
    });
    userFindOne.mockResolvedValue({
      _id: "admin-1",
      firebaseUid: "admin-uid",
      role: "branch_admin",
      firstName: "Branch",
      lastName: "Admin",
      email: "admin@example.com",
    });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439016" },
      body: { action: "mark_no_show", note: "Applicant missed the visit." },
      branchFilter: "gil-puyat",
      user: { uid: "admin-uid", email: "admin@example.com" },
    };
    const res = createResponse();
    const next = jest.fn();

    await manageReservationVisit(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.body?.reservation?.visitStatus).toBe("no_show");
    // Reservation remains active in visit_pending for rescheduling
    expect(reservation.status).toBe("visit_pending");
    expect(reservation.scheduleApproved).toBe(false);
    expect(reservation.visitApproved).toBe(false);
    expect(save).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("admin can reject an already approved visit schedule", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const populate = jest.fn().mockResolvedValue(undefined);
    const reservation = {
      _id: "507f1f77bcf86cd799439017",
      status: "visit_approved",
      viewingPreference: "physical_visit",
      visitStatus: "schedule_approved",
      scheduleApproved: true,
      scheduleRejected: false,
      visitApproved: false,
      visitDate: new Date("2026-05-20T00:00:00.000Z"),
      visitTime: "01:00 PM",
      visitHistory: [],
      roomId: { _id: "room-1", branch: "gil-puyat", roomNumber: "301", name: "Room 301" },
      userId: { _id: "tenant-1", firstName: "Tala", lastName: "Applicant", email: "tala@example.com" },
      toObject: () => ({ _id: "507f1f77bcf86cd799439017", status: "visit_approved", scheduleApproved: true }),
      populate,
      save,
    };
    reservationFindById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve(resolve(reservation)),
    });
    userFindOne.mockResolvedValue({
      _id: "admin-1",
      firebaseUid: "admin-uid",
      role: "branch_admin",
      firstName: "Branch",
      lastName: "Admin",
      email: "admin@example.com",
    });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439017" },
      body: { action: "reject_schedule", note: "Capacity reached for this date." },
      branchFilter: "gil-puyat",
      user: { uid: "admin-uid", email: "admin@example.com" },
    };
    const res = createResponse();
    const next = jest.fn();

    await manageReservationVisit(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(reservation.scheduleApproved).toBe(false);
    expect(reservation.scheduleRejected).toBe(true);
    expect(reservation.scheduleRejectionReason).toBe("Capacity reached for this date.");
    expect(save).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test.each([
    ["mark_visited", {}],
    ["mark_no_show", {}],
    ["cancel_visit", {}],
    ["reschedule", { visitDate: "2026-05-21", visitTime: "02:00 PM" }],
  ])("rejects normal visit action %s after completion", async (action, payload) => {
    const save = jest.fn().mockResolvedValue(undefined);
    const reservation = {
      _id: "507f1f77bcf86cd799439020",
      status: "visit_approved",
      viewingPreference: "physical_visit",
      visitStatus: "visit_completed",
      visitApproved: true,
      visitDate: new Date("2026-05-20T00:00:00.000Z"),
      visitTime: "01:00 PM",
      visitHistory: [],
      roomId: { _id: "room-1", branch: "gil-puyat", roomNumber: "301", name: "Room 301" },
      userId: {
        _id: "tenant-1",
        firstName: "Tala",
        lastName: "Applicant",
        email: "tala@example.com",
      },
      toObject: () => ({
        _id: "507f1f77bcf86cd799439020",
        status: "visit_approved",
        viewingPreference: "physical_visit",
        visitStatus: "visit_completed",
        visitApproved: true,
      }),
      save,
    };
    reservationFindById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve(resolve(reservation)),
    });
    userFindOne.mockResolvedValue({
      _id: "admin-1",
      firebaseUid: "admin-uid",
      role: "branch_admin",
      firstName: "Branch",
      lastName: "Admin",
      email: "admin@example.com",
    });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439020" },
      body: { action, ...payload },
      branchFilter: "gil-puyat",
      user: { uid: "admin-uid", email: "admin@example.com" },
    };
    const res = createResponse();
    const next = jest.fn();

    await manageReservationVisit(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      error: "Visit is already completed and cannot be changed.",
      code: "VISIT_ALREADY_COMPLETED",
    });
    expect(save).not.toHaveBeenCalled();
    expect(sendPhysicalVisitStatusEmail).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("admin can reschedule a physical visit using the reservation room branch", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const populate = jest.fn().mockResolvedValue(undefined);
    const reservation = {
      _id: "507f1f77bcf86cd799439014",
      status: "viewing_preference_selected",
      viewingPreference: "physical_visit",
      viewingType: "inperson",
      visitDate: new Date("2026-05-20T00:00:00.000Z"),
      visitTime: "01:00 PM",
      visitScheduledAt: new Date("2026-05-12T00:00:00.000Z"),
      visitHistory: [],
      roomId: { _id: "room-1", branch: "gil-puyat", roomNumber: "301", name: "Room 301" },
      userId: {
        _id: "tenant-1",
        firstName: "Tala",
        lastName: "Applicant",
        email: "tala@example.com",
      },
      toObject: () => ({
        _id: "507f1f77bcf86cd799439014",
        status: "viewing_preference_selected",
        viewingPreference: "physical_visit",
      }),
      populate,
      save,
    };
    reservationFindById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve(resolve(reservation)),
    });
    userFindOne.mockResolvedValue({
      _id: "admin-1",
      firebaseUid: "admin-uid",
      role: "branch_admin",
      firstName: "Branch",
      lastName: "Admin",
      email: "admin@example.com",
    });
    visitAvailabilityFindOne.mockResolvedValue({
      branch: "gil-puyat",
      enabledWeekdays: [0, 1, 2, 3, 4, 5, 6],
      slots: [{ label: "02:00 PM", enabled: true, capacity: 5 }],
      blackoutDates: [],
      weekdaySystem: "js-get-day",
    });
    roomFind.mockReturnValue({
      distinct: jest.fn().mockResolvedValue(["room-1"]),
    });
    reservationFind.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439014" },
      body: {
        action: "reschedule",
        visitDate: "2099-05-21",
        visitTime: "02:00 PM",
        note: "Move to the afternoon slot.",
      },
      branchFilter: "gil-puyat",
      user: { uid: "admin-uid", email: "admin@example.com" },
    };
    const res = createResponse();
    const next = jest.fn();

    await manageReservationVisit(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.body?.reservation?.visitStatus).toBe("rescheduled");
    expect(reservation.status).toBe("visit_approved");
    expect(visitAvailabilityFindOne).toHaveBeenCalledWith({ branch: "gil-puyat" });
    expect(reservation.visitTime).toBe("02:00 PM");
    expect(save).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("allows approval when a submitted document has needs_reupload precheck status (manual admin review)", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    reservationFindByIdAndUpdate.mockResolvedValue({
      _id: "507f1f77bcf86cd799439030",
      status: "approved_for_payment",
      userId: { _id: "tenant-1" },
      toObject: () => ({ status: "approved_for_payment" }),
    });
    const reservation = {
      _id: "507f1f77bcf86cd799439030",
      status: "pending_application_review",
      validIDFrontUrl: "https://storage.example.com/id-front.jpg",
      validIDBackUrl: "https://storage.example.com/id-back.jpg",
      selfiePhotoUrl: null,
      nbiClearanceUrl: null,
      companyIDUrl: null,
      documentPrechecks: {
        validIDFront: {
          precheckStatus: "needs_reupload",
          readabilityStatus: "unreadable",
          documentTypeStatus: "unknown",
          canSubmit: false,
          applicantMessage: "ID photo is too blurry to read.",
        },
        validIDBack: {
          precheckStatus: "ready_for_submission",
          readabilityStatus: "readable",
          documentTypeStatus: "possible_match",
          canSubmit: true,
        },
      },
      roomId: { _id: "room-1", branch: "gil-puyat" },
      userId: { _id: "tenant-1", email: "tala@example.com" },
      toObject: () => ({
        status: "pending_application_review",
        roomId: { _id: "room-1", branch: "gil-puyat" },
      }),
      save,
    };
    reservationFindById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve(resolve(reservation)),
    });
    userFindOne.mockResolvedValue({
      _id: "admin-1",
      firebaseUid: "admin-uid",
      role: "branch_admin",
    });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439030" },
      body: { status: "approved_for_payment" },
      branchFilter: "gil-puyat",
      user: { uid: "admin-uid" },
      authUser: { _id: "admin-1" },
    };
    const res = createResponse();
    const next = jest.fn();

    await updateReservation(req, res, next);

    expect(res.statusCode).not.toBe(422);
    expect(res.body?.code).not.toBe("DOCUMENT_PRECHECK_BLOCKS_APPROVAL");
    expect(save).toHaveBeenCalledTimes(1);
    expect(reservation.status).toBe("approved_for_payment");
  });

  test("allows approval when blocked document has manual_review_fallback status", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    reservationFindByIdAndUpdate.mockResolvedValue({
      _id: "507f1f77bcf86cd799439031",
      status: "approved_for_payment",
      userId: { _id: "tenant-1" },
      toObject: () => ({ status: "approved_for_payment" }),
    });
    const reservation = {
      _id: "507f1f77bcf86cd799439031",
      status: "pending_application_review",
      validIDFrontUrl: "https://storage.example.com/id-front.jpg",
      validIDBackUrl: null,
      selfiePhotoUrl: null,
      nbiClearanceUrl: null,
      companyIDUrl: null,
      documentPrechecks: {
        validIDFront: {
          precheckStatus: "manual_review_fallback",
          readabilityStatus: "unknown",
          documentTypeStatus: "unknown",
          canSubmit: true,
        },
      },
      roomId: { _id: "room-1", branch: "gil-puyat" },
      userId: { _id: "tenant-1", email: "tala@example.com" },
      toObject: () => ({
        status: "pending_application_review",
        roomId: { _id: "room-1", branch: "gil-puyat" },
      }),
      save,
    };
    reservationFindById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve(resolve(reservation)),
    });
    userFindOne.mockResolvedValue({
      _id: "admin-1",
      firebaseUid: "admin-uid",
      role: "branch_admin",
    });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439031" },
      body: { status: "approved_for_payment" },
      branchFilter: "gil-puyat",
      user: { uid: "admin-uid" },
      authUser: { _id: "admin-1" },
    };
    const res = createResponse();
    const next = jest.fn();

    await updateReservation(req, res, next);

    expect(res.statusCode).not.toBe(422);
    expect(res.statusCode).not.toBe(500);
    expect(res.body?.code).not.toBe("DOCUMENT_PRECHECK_BLOCKS_APPROVAL");
    expect(next).not.toHaveBeenCalled();
    // Regression guard: this transition computes paymentExpiresAt via dayjs().
    // A missing `dayjs` import throws a ReferenceError that the mocked
    // handleReservationError swallows silently (statusCode stays default),
    // so we assert the mutation and save actually completed.
    expect(save).toHaveBeenCalledTimes(1);
    expect(reservation.status).toBe("approved_for_payment");
    expect(reservation.paymentExpiresAt).toBeInstanceOf(Date);
  });

  test.each([null, "schedule_approved"])(
    "allows application submission when visitApproved=true but visitStatus is %s after refetch",
    async (visitStatus) => {
    const save = jest.fn().mockResolvedValue(true);
    // Simulate an old reservation: admin marked visited via boolean only, visitStatus never written
    const reservation = {
      _id: "507f1f77bcf86cd799439040",
      status: "visit_approved",
      viewingPreference: "physical_visit",
      viewingType: "inperson",
      visitDate: "2025-06-01",
      visitTime: "10:00 AM",
      visitApproved: true,
      visitStatus,
      scheduleApproved: true,
      scheduleRejected: false,
      applicationSubmittedAt: null,  // first submission
      firstName: "Ana",
      lastName: "Cruz",
      mobileNumber: "09171234567",
      birthday: new Date("2000-01-01"),
      maritalStatus: "single",
      nationality: "Filipino",
      educationLevel: "college",
      address: {
        unitHouseNo: "Unit 1",
        street: "Rizal St",
        region: "NCR",
        province: "Metro Manila",
        city: "Makati",
        barangay: "Poblacion",
      },
      selfiePhotoUrl: "https://firebase.example.com/selfie.jpg",
      validIDFrontUrl: "https://firebase.example.com/id-front.jpg",
      validIDBackUrl: "https://firebase.example.com/id-back.jpg",
      nbiClearanceUrl: "https://firebase.example.com/nbi.jpg",
      emergencyContact: { name: "Maria Cruz", relationship: "parent", contactNumber: "09181234567" },
      healthConcerns: "None",
      employment: {
        employerSchool: "UP Manila",
        employerAddress: "Ermita, Manila",
        occupation: "Student",
      },
      referralSource: "facebook",
      targetMoveInDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      estimatedMoveInTime: "08:00",
      leaseDuration: 12,
      workSchedule: "day",
      agreedToPrivacy: true,
      agreedToCertification: true,
      documentPrechecks: {},
      roomId: { _id: "room-1", branch: "gil-puyat" },
      userId: { _id: "tenant-1", email: "ana@example.com" },
      toObject: () => ({ status: "visit_approved", roomId: { _id: "room-1", branch: "gil-puyat" } }),
      save,
    };

    buildUserUpdatePayload.mockReturnValue({
      mobileNumber: "09171234567",
      "emergencyContact.contactNumber": "09181234567",
    });

    reservationFindById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve(resolve(reservation)),
    });
    reservationFindByIdAndUpdate.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve(resolve({ ...reservation, status: "pending_application_review" })),
    });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439040" },
      body: {
        submitApplication: true,
        agreedToPrivacy: true,
        agreedToCertification: true,
        selfiePhotoUrl: "https://firebase.example.com/selfie.jpg",
        validIDFrontUrl: "https://firebase.example.com/id-front.jpg",
        validIDBackUrl: "https://firebase.example.com/id-back.jpg",
        nbiClearanceUrl: "https://firebase.example.com/nbi.jpg",
      },
      userId: "tenant-1",
      branchFilter: "gil-puyat",
    };
    const res = createResponse();
    const next = jest.fn();

    await updateReservationByUser(req, res, next);

    // Must NOT block with PHYSICAL_VISIT_APPLICATION_LOCKED
    expect(res.statusCode).not.toBe(403);
    expect(res.body?.code).not.toBe("PHYSICAL_VISIT_APPLICATION_LOCKED");
  });

  test("rejects application draft autosave when application is already approved by admin", async () => {
    userFindOne.mockResolvedValue({ _id: "tenant-1" });
    reservationFindById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439103",
      userId: "tenant-1",
      roomId: "room-1",
      status: "approved_for_payment",
      applicationSubmittedAt: new Date("2026-05-17T08:00:00.000Z"),
      approvedForPaymentAt: new Date("2026-05-17T09:00:00.000Z"),
      documentsApproved: true,
      emergencyContact: {},
      employment: {},
      documentPrechecks: {},
    });
    buildUserUpdatePayload.mockReturnValue({ firstName: "Ana" });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439103" },
      user: { uid: "tenant-firebase-uid" },
      body: { applicationDraftAutosave: true, firstName: "Ana" },
    };
    const res = createResponse();
    const next = jest.fn();

    await updateReservationByUser(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBe("APPLICATION_LOCKED_APPROVED");
    expect(reservationFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects application submission when application is already approved for payment", async () => {
    userFindOne.mockResolvedValue({ _id: "tenant-1" });
    reservationFindById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439104",
      userId: "tenant-1",
      roomId: "room-1",
      status: "approved_for_payment",
      applicationSubmittedAt: new Date("2026-05-17T08:00:00.000Z"),
      approvedForPaymentAt: new Date("2026-05-17T09:00:00.000Z"),
      documentsApproved: true,
      emergencyContact: {},
      employment: {},
      documentPrechecks: {},
    });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439104" },
      user: { uid: "tenant-firebase-uid" },
      body: { submitApplication: true },
    };
    const res = createResponse();
    const next = jest.fn();

    await updateReservationByUser(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBe("APPLICATION_LOCKED_APPROVED");
    expect(reservationFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
