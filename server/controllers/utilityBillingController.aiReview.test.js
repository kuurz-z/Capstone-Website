import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const utilityPeriodFindOne = jest.fn();
const utilityPeriodFind = jest.fn();
const utilityPeriodUpdateOne = jest.fn();
const utilityPeriodFindByIdAndUpdate = jest.fn();
const roomFindById = jest.fn();
const utilityReadingFind = jest.fn();
const reservationFind = jest.fn();
const billFind = jest.fn();
const resolveAdminAccessContext = jest.fn();
const deriveUtilityPeriodBillingState = jest.fn();
const buildElectricityReview = jest.fn();
const buildBillingIntelligenceSnapshot = jest.fn();
const generateBillingIntelligence = jest.fn();
const getRoomLabel = jest.fn();

const makeQueryChain = (result) => {
  const chain = {
    sort: jest.fn(() => chain),
    select: jest.fn(() => chain),
    populate: jest.fn(() => chain),
    lean: jest.fn(() => Promise.resolve(result)),
  };
  return chain;
};

await jest.unstable_mockModule("../models/index.js", () => ({
  Room: {
    findById: roomFindById,
  },
  Reservation: {
    find: reservationFind,
  },
  User: {},
  UtilityPeriod: {
    findOne: utilityPeriodFindOne,
    find: utilityPeriodFind,
    updateOne: utilityPeriodUpdateOne,
    findByIdAndUpdate: utilityPeriodFindByIdAndUpdate,
  },
  UtilityReading: {
    find: utilityReadingFind,
  },
  Bill: {
    find: billFind,
  },
}));

await jest.unstable_mockModule("../utils/adminAccess.js", () => ({
  resolveAdminAccessContext,
}));

await jest.unstable_mockModule("../utils/utilityDiagnostics.js", () => ({
  deriveUtilityPeriodBillingState,
  getUtilityDiagnostics: jest.fn(),
}));

await jest.unstable_mockModule("../utils/electricityReviewRules.js", () => ({
  buildElectricityReview,
}));

await jest.unstable_mockModule("../services/billingIntelligenceService.js", () => ({
  buildBillingIntelligenceSnapshot,
  generateBillingIntelligence,
}));

await jest.unstable_mockModule("../utils/roomLabel.js", () => ({
  getRoomLabel,
}));

await jest.unstable_mockModule("../utils/billingEngine.js", () => ({
  computeBilling: jest.fn(),
}));

await jest.unstable_mockModule("../utils/billingAudit.js", () => ({
  logBillingAudit: jest.fn(),
}));

await jest.unstable_mockModule("../utils/utilityBillFlow.js", () => ({
  sendUtilityPeriodBills: jest.fn(),
  upsertDraftBillsForUtility: jest.fn(),
}));

await jest.unstable_mockModule("../utils/userReference.js", () => ({
  resolveReferencedUser: jest.fn(),
  UNKNOWN_TENANT_LABEL: "Unknown tenant",
}));

await jest.unstable_mockModule("../utils/utilityFlowRules.js", () => ({
  buildTenantEventsForPeriod: jest.fn(() => []),
  filterBillableReservationsForPeriod: jest.fn(() => []),
  findBedOccupancyOverlaps: jest.fn(() => ({ hasOverlap: false, overlaps: [] })),
  findMissingElectricityLifecycleReadings: jest.fn(() => ({
    missingMoveInReadings: [],
    missingMoveOutReadings: [],
  })),
  isWaterBillableRoom: jest.fn(() => true),
}));

await jest.unstable_mockModule("../utils/billingPolicy.js", () => ({
  getUtilityDispatchEntry: jest.fn(),
  syncBillAmounts: jest.fn(),
}));

await jest.unstable_mockModule("../utils/lifecycleNaming.js", () => ({
  buildMoveInBeforeQuery: jest.fn(() => ({})),
  buildMoveOutAfterOrMissingQuery: jest.fn(() => ({})),
  BILLABLE_RESERVATION_STATUS_QUERY: ["active", "moveIn", "moveOut"],
  hasReservationStatus: jest.fn(() => true),
  isUtilityEventType: jest.fn(() => false),
  normalizeReservationPayload: jest.fn((reservation) => reservation),
  normalizeUtilityEventType: jest.fn((eventType) => eventType),
  readMoveInDate: jest.fn((reservation) => reservation?.moveInDate || null),
  readMoveOutDate: jest.fn((reservation) => reservation?.moveOutDate || null),
  serializeUtilityPeriod: jest.fn((period) => period),
  serializeUtilityReading: jest.fn((reading) => reading),
  utilityEventTypesForQuery: jest.fn(() => []),
}));

await jest.unstable_mockModule("../middleware/logger.js", () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { exportUtilityRows, getUtilityAiReview } = await import("./utilityBillingController.js");

const createRes = () => ({
  statusCode: 200,
  payload: null,
  status: jest.fn(function status(code) {
    this.statusCode = code;
    return this;
  }),
  json: jest.fn(function json(payload) {
    this.payload = payload;
    return this;
  }),
});

const basePeriod = {
  _id: "period-1",
  id: "period-1",
  roomId: "room-1",
  utilityType: "electricity",
  status: "closed",
  isArchived: false,
  startDate: "2026-04-01",
  endDate: "2026-04-30",
  tenantSummaries: [],
};

const baseRoom = {
  _id: "room-1",
  name: "Room 201",
  roomNumber: "201",
  branch: "gil-puyat",
  type: "double-sharing",
};

const baseInsight = {
  provider: "heuristic-fallback",
  usedFallback: true,
  generatedAt: "2026-05-02T00:00:00.000Z",
  headline: "This electricity period should be reviewed.",
  summary: "Validation and anomaly signals were summarized.",
  riskLevel: "medium",
  keyFindings: ["Validation warning needs admin review."],
  recommendedActions: ["Confirm source meter readings."],
  riskDrivers: ["Warning-level data quality issue."],
  reviewChecklist: ["Check source readings."],
  disputePreventionNote: "Document the reading source before publishing.",
  tenantExplanationDraft: "Draft tenant explanation.",
  confidence: "medium",
};

const arrangeSuccessfulQueries = ({
  admin = { isOwner: false, branch: "gil-puyat" },
  period = basePeriod,
  room = baseRoom,
} = {}) => {
  resolveAdminAccessContext.mockResolvedValue(admin);
  utilityPeriodFindOne.mockReturnValue(makeQueryChain(period));
  roomFindById.mockReturnValue(makeQueryChain(room));
  utilityPeriodFind.mockReturnValue(makeQueryChain([period]));
  utilityReadingFind.mockReturnValue(makeQueryChain([]));
  reservationFind.mockReturnValue(makeQueryChain([]));
  billFind.mockReturnValue(makeQueryChain([]));
  deriveUtilityPeriodBillingState.mockReturnValue({
    billingState: "ready_to_send",
    billingLabel: "Ready to Send",
  });
  buildElectricityReview.mockReturnValue({
    validationState: "warning",
    canSendBill: true,
    reviewRequired: true,
  });
  buildBillingIntelligenceSnapshot.mockReturnValue({
    utilityType: "electricity",
    period: { id: period?._id || period?.id },
  });
  generateBillingIntelligence.mockResolvedValue({
    insight: baseInsight,
    model: null,
    fallbackReason: null,
  });
  getRoomLabel.mockReturnValue("Room 201");
};

describe("getUtilityAiReview", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    arrangeSuccessfulQueries();
  });

  test("returns unsupported response for water periods", async () => {
    const req = { params: { utilityType: "water", periodId: "period-1" } };
    const res = createRes();
    const next = jest.fn();

    await getUtilityAiReview(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.payload).toMatchObject({
      success: false,
      utilityType: "water",
      error: "AI billing review is currently available for electricity only.",
    });
    expect(utilityPeriodFindOne).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("allows a branch admin to review an own-branch electricity period", async () => {
    const req = {
      params: { utilityType: "electricity", periodId: "period-1" },
    };
    const res = createRes();
    const next = jest.fn();

    await getUtilityAiReview(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.payload).toMatchObject({
      success: true,
      periodId: "period-1",
      utilityType: "electricity",
      snapshotMeta: {
        provider: "heuristic-fallback",
        usedFallback: true,
        generatedAt: "2026-05-02T00:00:00.000Z",
      },
      insight: {
        headline: baseInsight.headline,
        riskLevel: "medium",
        disclaimer:
          "This AI review is advisory only. Deterministic billing rules control validation, amounts, and sending.",
      },
    });
    expect(buildElectricityReview).toHaveBeenCalledWith(
      expect.objectContaining({
        period: expect.objectContaining({ _id: "period-1" }),
        periods: [basePeriod],
        readings: [],
        reservations: [],
      }),
    );
    expect(buildBillingIntelligenceSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        period: basePeriod,
        periods: [basePeriod],
        room: expect.objectContaining({ roomLabel: "Room 201" }),
        billingState: "ready_to_send",
        billingLabel: "Ready to Send",
      }),
    );
    expect(generateBillingIntelligence).toHaveBeenCalledWith({
      utilityType: "electricity",
      period: { id: "period-1" },
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("allows an owner to review another branch electricity period", async () => {
    arrangeSuccessfulQueries({
      admin: { isOwner: true, branch: "main" },
      room: { ...baseRoom, branch: "another-branch" },
    });
    const req = {
      params: { utilityType: "electricity", periodId: "period-1" },
    };
    const res = createRes();
    const next = jest.fn();

    await getUtilityAiReview(req, res, next);

    expect(res.payload).toMatchObject({ success: true });
    expect(generateBillingIntelligence).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  test("denies a branch admin reviewing another branch period", async () => {
    arrangeSuccessfulQueries({
      admin: { isOwner: false, branch: "gil-puyat" },
      room: { ...baseRoom, branch: "legarda" },
    });
    const req = {
      params: { utilityType: "electricity", periodId: "period-1" },
    };
    const res = createRes();
    const next = jest.fn();

    await getUtilityAiReview(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.payload).toEqual({ error: "Access denied" });
    expect(generateBillingIntelligence).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("returns not found when the electricity period does not exist", async () => {
    utilityPeriodFindOne.mockReturnValue(makeQueryChain(null));
    const req = {
      params: { utilityType: "electricity", periodId: "missing-period" },
    };
    const res = createRes();
    const next = jest.fn();

    await getUtilityAiReview(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.payload).toEqual({ error: "Electricity period not found" });
    expect(roomFindById).not.toHaveBeenCalled();
    expect(generateBillingIntelligence).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("does not call mutating UtilityPeriod methods during AI review", async () => {
    const req = {
      params: { utilityType: "electricity", periodId: "period-1" },
    };
    const res = createRes();
    const next = jest.fn();

    await getUtilityAiReview(req, res, next);

    expect(res.payload).toMatchObject({ success: true });
    expect(utilityPeriodUpdateOne).not.toHaveBeenCalled();
    expect(utilityPeriodFindByIdAndUpdate).not.toHaveBeenCalled();
  });
});

describe("exportUtilityRows", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getRoomLabel.mockImplementation((room) => room?.name || room?.roomNumber || "Room");
    resolveAdminAccessContext.mockResolvedValue({
      isOwner: false,
      branch: "gil-puyat",
    });
  });

  test("exports branch-scoped electricity rows for branch admins", async () => {
    utilityPeriodFind.mockReturnValue(
      makeQueryChain([
        {
          _id: "period-1",
          utilityType: "electricity",
          status: "closed",
          startDate: "2026-04-01",
          endDate: "2026-04-30",
          startReading: 100,
          endReading: 180,
          computedTotalUsage: 80,
          computedTotalCost: 1200,
          ratePerUnit: 15,
          roomId: {
            _id: "room-1",
            name: "Room 201",
            branch: "gil-puyat",
          },
          tenantSummaries: [
            {
              tenantId: "tenant-1",
              tenantName: "Test Tenant",
              tenantEmail: "tenant@example.com",
              usage: 40,
              amount: 600,
              billId: "bill-1",
            },
          ],
        },
        {
          _id: "period-2",
          utilityType: "electricity",
          status: "closed",
          roomId: {
            _id: "room-2",
            name: "Other Room",
            branch: "guadalupe",
          },
          tenantSummaries: [{ tenantName: "Other Tenant", amount: 500 }],
        },
      ]),
    );

    const req = { params: { utilityType: "electricity" }, query: {} };
    const res = createRes();
    const next = jest.fn();

    await exportUtilityRows(req, res, next);

    expect(utilityPeriodFind).toHaveBeenCalledWith({
      utilityType: "electricity",
      isArchived: false,
      status: { $in: ["closed", "revised"] },
    });
    expect(res.payload).toMatchObject({
      success: true,
      rows: [
        {
          utilityType: "electricity",
          branch: "gil-puyat",
          roomName: "Room 201",
          tenantName: "Test Tenant",
          tenantEmail: "tenant@example.com",
          usage: 40,
          amount: 600,
          billId: "bill-1",
        },
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("allows owners to export an explicitly selected branch", async () => {
    resolveAdminAccessContext.mockResolvedValue({
      isOwner: true,
      branch: null,
    });
    utilityPeriodFind.mockReturnValue(
      makeQueryChain([
        {
          _id: "period-1",
          utilityType: "water",
          status: "closed",
          roomId: { _id: "room-1", name: "Room 201", branch: "gil-puyat" },
          tenantSummaries: [{ tenantName: "GP Tenant", amount: 500 }],
        },
        {
          _id: "period-2",
          utilityType: "water",
          status: "closed",
          roomId: { _id: "room-2", name: "Room 301", branch: "guadalupe" },
          tenantSummaries: [{ tenantName: "Guad Tenant", amount: 700 }],
        },
      ]),
    );

    const req = {
      params: { utilityType: "water" },
      query: { branch: "guadalupe" },
    };
    const res = createRes();
    const next = jest.fn();

    await exportUtilityRows(req, res, next);

    expect(res.payload.rows).toHaveLength(1);
    expect(res.payload.rows[0]).toMatchObject({
      utilityType: "water",
      branch: "guadalupe",
      tenantName: "Guad Tenant",
      amount: 700,
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects invalid utility export types", async () => {
    const req = { params: { utilityType: "internet" }, query: {} };
    const res = createRes();
    const next = jest.fn();

    await exportUtilityRows(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.payload).toEqual({ error: "Invalid utility type specified" });
    expect(utilityPeriodFind).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
