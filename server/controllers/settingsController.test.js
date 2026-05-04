import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const getBusinessSettings = jest.fn();
const getBranchSettings = jest.fn();
const mergeBranchOverrides = jest.fn();
const serializeBusinessSettings = jest.fn();
const logModification = jest.fn();

const DEFAULT_BRANCH_OVERRIDES = {
  "gil-puyat": {
    isApplianceFeeEnabled: false,
    applianceFeeAmountPerUnit: 0,
    changedBy: null,
    changedAt: null,
  },
  guadalupe: {
    isApplianceFeeEnabled: true,
    applianceFeeAmountPerUnit: 200,
    changedBy: null,
    changedAt: null,
  },
};

const buildSerializedSettings = (value = {}) => ({
  reservationFeeAmount: value.reservationFeeAmount ?? 2000,
  penaltyRatePerDay: value.penaltyRatePerDay ?? 50,
  defaultElectricityRatePerKwh: value.defaultElectricityRatePerKwh ?? 16,
  defaultWaterRatePerUnit: value.defaultWaterRatePerUnit ?? 0,
  noShowGraceDays: value.noShowGraceDays ?? 7,
  stalePendingHours: value.stalePendingHours ?? 2,
  staleVisitPendingHours: value.staleVisitPendingHours ?? 336,
  visitPendingWarnDays: value.visitPendingWarnDays ?? 12,
  staleVisitApprovedHours: value.staleVisitApprovedHours ?? 48,
  stalePaymentPendingHours: value.stalePaymentPendingHours ?? 48,
  archiveCancelledAfterDays: value.archiveCancelledAfterDays ?? 7,
  branchOverrides: value.branchOverrides ?? DEFAULT_BRANCH_OVERRIDES,
  changedBy: value.changedBy ?? null,
  changedAt: value.changedAt ?? null,
  updatedAt: value.updatedAt ?? null,
});

await jest.unstable_mockModule("../utils/businessSettings.js", () => ({
  DEFAULT_BRANCH_OVERRIDES,
  getBusinessSettings,
  getBranchSettings,
  mergeBranchOverrides,
  serializeBusinessSettings,
}));

await jest.unstable_mockModule("../utils/auditLogger.js", () => ({
  default: {
    logModification,
  },
}));

const {
  getBusinessRules,
  updateBranchBillingSettings,
  updateBusinessRules,
} = await import("./settingsController.js");

const createResponse = () => {
  const res = {
    req: { id: "req-1" },
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
  };

  return res;
};

describe("settingsController", () => {
  beforeEach(() => {
    getBusinessSettings.mockReset();
    getBranchSettings.mockReset();
    mergeBranchOverrides.mockReset();
    serializeBusinessSettings.mockReset();
    logModification.mockReset();

    serializeBusinessSettings.mockImplementation((value) =>
      buildSerializedSettings(value),
    );
    getBranchSettings.mockImplementation(
      (branch, settings) => settings.branchOverrides?.[branch] || DEFAULT_BRANCH_OVERRIDES[branch],
    );
    mergeBranchOverrides.mockImplementation((current, patch = {}) => ({
      ...current,
      ...Object.fromEntries(
        Object.entries(patch).map(([branch, override]) => [
          branch,
          {
            ...(current?.[branch] || DEFAULT_BRANCH_OVERRIDES[branch]),
            ...(override || {}),
          },
        ]),
      ),
    }));
  });

  test("getBusinessRules returns normalized persisted business settings", async () => {
    const req = {};
    const res = createResponse();
    const next = jest.fn();
    const updatedAt = new Date("2026-04-18T09:00:00.000Z");

    getBusinessSettings.mockResolvedValue({
      reservationFeeAmount: 2000,
      penaltyRatePerDay: 50,
      defaultElectricityRatePerKwh: 16,
      defaultWaterRatePerUnit: 28,
      noShowGraceDays: 7,
      stalePendingHours: 2,
      staleVisitPendingHours: 336,
      visitPendingWarnDays: 12,
      staleVisitApprovedHours: 48,
      stalePaymentPendingHours: 48,
      archiveCancelledAfterDays: 7,
      branchOverrides: DEFAULT_BRANCH_OVERRIDES,
      changedBy: {
        userId: "owner-1",
        email: "owner@example.com",
        role: "owner",
      },
      changedAt: updatedAt,
      updatedAt,
    });

    await getBusinessRules(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(
      buildSerializedSettings({
        defaultWaterRatePerUnit: 28,
        changedBy: {
          userId: "owner-1",
          email: "owner@example.com",
          role: "owner",
        },
        changedAt: updatedAt,
        updatedAt,
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("updateBusinessRules persists lifecycle settings, stamps metadata, and logs an audit event", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const settings = {
      _id: "settings-1",
      key: "global",
      reservationFeeAmount: 2000,
      penaltyRatePerDay: 50,
      defaultElectricityRatePerKwh: 16,
      defaultWaterRatePerUnit: 0,
      noShowGraceDays: 7,
      stalePendingHours: 2,
      staleVisitPendingHours: 336,
      visitPendingWarnDays: 12,
      staleVisitApprovedHours: 48,
      stalePaymentPendingHours: 48,
      archiveCancelledAfterDays: 7,
      branchOverrides: DEFAULT_BRANCH_OVERRIDES,
      changedBy: null,
      changedAt: null,
      updatedAt: new Date("2026-04-18T08:00:00.000Z"),
      save,
    };
    const req = {
      user: {
        uid: "owner-1",
        email: "owner@example.com",
        owner: true,
      },
      body: {
        reservationFeeAmount: "2500",
        penaltyRatePerDay: "75",
        defaultElectricityRatePerKwh: "18.5",
        defaultWaterRatePerUnit: "30.25",
        noShowGraceDays: "5",
        stalePendingHours: "4",
        staleVisitPendingHours: "240",
        visitPendingWarnDays: "10",
        staleVisitApprovedHours: "72",
        stalePaymentPendingHours: "60",
        archiveCancelledAfterDays: "14",
        branchOverrides: {
          guadalupe: {
            isApplianceFeeEnabled: false,
            applianceFeeAmountPerUnit: 150,
          },
        },
      },
    };
    const res = createResponse();
    const next = jest.fn();

    getBusinessSettings.mockResolvedValue(settings);

    await updateBusinessRules(req, res, next);

    expect(settings.reservationFeeAmount).toBe(2500);
    expect(settings.penaltyRatePerDay).toBe(75);
    expect(settings.defaultElectricityRatePerKwh).toBe(18.5);
    expect(settings.defaultWaterRatePerUnit).toBe(30.25);
    expect(settings.noShowGraceDays).toBe(5);
    expect(settings.stalePendingHours).toBe(4);
    expect(settings.staleVisitPendingHours).toBe(240);
    expect(settings.visitPendingWarnDays).toBe(10);
    expect(settings.staleVisitApprovedHours).toBe(72);
    expect(settings.stalePaymentPendingHours).toBe(60);
    expect(settings.archiveCancelledAfterDays).toBe(14);
    expect(settings.changedBy).toEqual({
      userId: "owner-1",
      email: "owner@example.com",
      role: "owner",
    });
    expect(settings.changedAt).toBeInstanceOf(Date);
    expect(settings.branchOverrides.guadalupe).toMatchObject({
      isApplianceFeeEnabled: false,
      applianceFeeAmountPerUnit: 150,
      changedBy: {
        userId: "owner-1",
        email: "owner@example.com",
        role: "owner",
      },
    });
    expect(settings.branchOverrides.guadalupe.changedAt).toBeInstanceOf(Date);
    expect(save).toHaveBeenCalledTimes(1);
    expect(logModification).toHaveBeenCalledTimes(1);
    expect(logModification).toHaveBeenCalledWith(
      req,
      "business_settings",
      "settings-1",
      expect.any(Object),
      expect.objectContaining({
        reservationFeeAmount: 2500,
        archiveCancelledAfterDays: 14,
      }),
      "Updated business settings",
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });

  test("updateBusinessRules rejects invalid whole-number lifecycle input", async () => {
    const settings = {
      reservationFeeAmount: 2000,
      penaltyRatePerDay: 50,
      defaultElectricityRatePerKwh: 16,
      defaultWaterRatePerUnit: 0,
      noShowGraceDays: 7,
      stalePendingHours: 2,
      staleVisitPendingHours: 336,
      visitPendingWarnDays: 12,
      staleVisitApprovedHours: 48,
      stalePaymentPendingHours: 48,
      archiveCancelledAfterDays: 7,
      branchOverrides: DEFAULT_BRANCH_OVERRIDES,
      save: jest.fn(),
    };
    const req = {
      body: {
        stalePendingHours: "1.5",
      },
    };
    const res = createResponse();
    const next = jest.fn();

    getBusinessSettings.mockResolvedValue(settings);

    await updateBusinessRules(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: "Stale pending hours must be a non-negative whole number",
    });
    expect(settings.save).not.toHaveBeenCalled();
    expect(logModification).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("updateBranchBillingSettings stamps branch metadata and logs the override change", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const settings = {
      _id: "settings-1",
      key: "global",
      branchOverrides: DEFAULT_BRANCH_OVERRIDES,
      changedBy: null,
      changedAt: null,
      updatedAt: new Date("2026-04-18T08:00:00.000Z"),
      save,
    };
    const req = {
      params: { branch: "guadalupe" },
      user: {
        uid: "owner-2",
        email: "owner2@example.com",
        dbRole: "owner",
      },
      body: {
        isApplianceFeeEnabled: false,
        applianceFeeAmountPerUnit: "175",
      },
    };
    const res = createResponse();
    const next = jest.fn();

    getBusinessSettings.mockResolvedValue(settings);

    await updateBranchBillingSettings(req, res, next);

    expect(settings.changedBy).toEqual({
      userId: "owner-2",
      email: "owner2@example.com",
      role: "owner",
    });
    expect(settings.changedAt).toBeInstanceOf(Date);
    expect(settings.branchOverrides.guadalupe).toMatchObject({
      isApplianceFeeEnabled: false,
      applianceFeeAmountPerUnit: 175,
      changedBy: {
        userId: "owner-2",
        email: "owner2@example.com",
        role: "owner",
      },
    });
    expect(settings.branchOverrides.guadalupe.changedAt).toBeInstanceOf(Date);
    expect(save).toHaveBeenCalledTimes(1);
    expect(logModification).toHaveBeenCalledWith(
      req,
      "business_settings",
      "settings-1",
      expect.any(Object),
      expect.any(Object),
      "Updated guadalupe branch billing override",
    );
    expect(res.body.data).toMatchObject({
      branch: "guadalupe",
      settings: expect.objectContaining({
        applianceFeeAmountPerUnit: 175,
        isApplianceFeeEnabled: false,
      }),
    });
    expect(next).not.toHaveBeenCalled();
  });
});
