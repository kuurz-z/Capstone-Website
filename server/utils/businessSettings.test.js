import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const findOne = jest.fn();
const create = jest.fn();

await jest.unstable_mockModule("../models/BusinessSettings.js", () => ({
  default: {
    findOne,
    create,
  },
}));

const {
  DEFAULT_BRANCH_OVERRIDES,
  DEFAULT_BUSINESS_SETTINGS,
  getBusinessSettings,
  getDefaultElectricityRatePerKwh,
  getDefaultWaterRatePerUnit,
  getLifecyclePolicySettings,
  getPenaltyRatePerDay,
  getReservationFeeAmount,
  mergeBranchOverrides,
  resolveElectricityRatePerKwh,
  resolvePenaltyRatePerDay,
  resolveWaterRatePerUnit,
  serializeBusinessSettings,
} = await import("./businessSettings.js");
const { BUSINESS } = await import("../config/constants.js");

describe("businessSettings", () => {
  beforeEach(() => {
    findOne.mockReset();
    create.mockReset();
  });

  test("creates the global settings document with expected defaults", async () => {
    const createdDoc = {
      key: "global",
      ...DEFAULT_BUSINESS_SETTINGS,
      branchOverrides: DEFAULT_BRANCH_OVERRIDES,
      changedBy: null,
      changedAt: null,
    };

    findOne.mockResolvedValue(null);
    create.mockResolvedValue(createdDoc);

    const settings = await getBusinessSettings();

    expect(findOne).toHaveBeenCalledWith({ key: "global" });
    expect(create).toHaveBeenCalledWith({
      key: "global",
      ...DEFAULT_BUSINESS_SETTINGS,
      branchOverrides: DEFAULT_BRANCH_OVERRIDES,
      changedBy: null,
      changedAt: null,
    });
    expect(settings).toBe(createdDoc);
  });

  test("backfills newly added policy fields and metadata on older documents", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const existingSettings = {
      key: "global",
      reservationFeeAmount: BUSINESS.DEPOSIT_AMOUNT,
      penaltyRatePerDay: null,
      defaultElectricityRatePerKwh: undefined,
      defaultWaterRatePerUnit: null,
      noShowGraceDays: null,
      stalePendingHours: undefined,
      staleVisitPendingHours: null,
      visitPendingWarnDays: undefined,
      staleVisitApprovedHours: null,
      stalePaymentPendingHours: undefined,
      archiveCancelledAfterDays: null,
      branchOverrides: undefined,
      save,
    };

    findOne.mockResolvedValue(existingSettings);

    const settings = await getBusinessSettings();

    expect(settings.penaltyRatePerDay).toBe(BUSINESS.PENALTY_RATE_PER_DAY);
    expect(settings.defaultElectricityRatePerKwh).toBe(
      BUSINESS.DEFAULT_ELECTRICITY_RATE_PER_KWH,
    );
    expect(settings.defaultWaterRatePerUnit).toBe(0);
    expect(settings.noShowGraceDays).toBe(BUSINESS.NOSHOW_GRACE_DAYS);
    expect(settings.stalePendingHours).toBe(BUSINESS.STALE_PENDING_HOURS);
    expect(settings.staleVisitPendingHours).toBe(
      BUSINESS.STALE_VISIT_PENDING_HOURS,
    );
    expect(settings.visitPendingWarnDays).toBe(BUSINESS.VISIT_PENDING_WARN_DAYS);
    expect(settings.staleVisitApprovedHours).toBe(
      BUSINESS.STALE_VISIT_APPROVED_HOURS,
    );
    expect(settings.stalePaymentPendingHours).toBe(
      BUSINESS.STALE_PAYMENT_PENDING_HOURS,
    );
    expect(settings.archiveCancelledAfterDays).toBe(
      BUSINESS.ARCHIVE_CANCELLED_AFTER_DAYS,
    );
    expect(settings.branchOverrides).toEqual(DEFAULT_BRANCH_OVERRIDES);
    expect(settings.changedBy).toBeNull();
    expect(settings.changedAt).toBeNull();
    expect(save).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  test("getter helpers return the configured values", async () => {
    const configuredSettings = {
      key: "global",
      reservationFeeAmount: 2500,
      penaltyRatePerDay: 75,
      defaultElectricityRatePerKwh: 18.5,
      defaultWaterRatePerUnit: 32.25,
      noShowGraceDays: 5,
      stalePendingHours: 4,
      staleVisitPendingHours: 240,
      visitPendingWarnDays: 9,
      staleVisitApprovedHours: 72,
      stalePaymentPendingHours: 60,
      archiveCancelledAfterDays: 14,
      branchOverrides: DEFAULT_BRANCH_OVERRIDES,
      changedBy: {
        userId: "owner-1",
        email: "owner@example.com",
        role: "owner",
      },
      changedAt: new Date("2026-04-18T10:00:00.000Z"),
      save: jest.fn(),
    };

    findOne.mockResolvedValue(configuredSettings);

    await expect(getReservationFeeAmount()).resolves.toBe(2500);
    await expect(getPenaltyRatePerDay()).resolves.toBe(75);
    await expect(getDefaultElectricityRatePerKwh()).resolves.toBe(18.5);
    await expect(getDefaultWaterRatePerUnit()).resolves.toBe(32.25);
    await expect(getLifecyclePolicySettings()).resolves.toEqual({
      noShowGraceDays: 5,
      stalePendingHours: 4,
      staleVisitPendingHours: 240,
      visitPendingWarnDays: 9,
      staleVisitApprovedHours: 72,
      stalePaymentPendingHours: 60,
      archiveCancelledAfterDays: 14,
    });
  });

  test("serializeBusinessSettings returns normalized payloads with changer metadata", () => {
    const changedAt = new Date("2026-04-18T11:30:00.000Z");
    const serialized = serializeBusinessSettings({
      reservationFeeAmount: 2600,
      branchOverrides: {
        guadalupe: {
          isApplianceFeeEnabled: false,
          applianceFeeAmountPerUnit: 180,
          changedBy: {
            userId: "owner-1",
            email: "owner@example.com",
            role: "owner",
          },
          changedAt,
        },
      },
      changedBy: {
        userId: "owner-1",
        email: "owner@example.com",
        role: "owner",
      },
      changedAt,
      updatedAt: changedAt,
    });

    expect(serialized).toEqual(
      expect.objectContaining({
        reservationFeeAmount: 2600,
        changedBy: {
          userId: "owner-1",
          email: "owner@example.com",
          role: "owner",
        },
        changedAt,
        updatedAt: changedAt,
        branchOverrides: expect.objectContaining({
          guadalupe: expect.objectContaining({
            isApplianceFeeEnabled: false,
            applianceFeeAmountPerUnit: 180,
            changedBy: {
              userId: "owner-1",
              email: "owner@example.com",
              role: "owner",
            },
            changedAt,
          }),
        }),
      }),
    );
  });

  test("mergeBranchOverrides preserves existing branch metadata outside the patched branch", () => {
    const merged = mergeBranchOverrides(DEFAULT_BRANCH_OVERRIDES, {
      "gil-puyat": {
        isApplianceFeeEnabled: true,
        applianceFeeAmountPerUnit: 120,
      },
    });

    expect(merged["gil-puyat"]).toMatchObject({
      isApplianceFeeEnabled: true,
      applianceFeeAmountPerUnit: 120,
    });
    expect(merged.guadalupe).toEqual(DEFAULT_BRANCH_OVERRIDES.guadalupe);
  });

  test("resolve helpers keep the existing fallback behavior", () => {
    expect(resolveElectricityRatePerKwh(21.5, 18)).toBe(21.5);
    expect(resolveElectricityRatePerKwh(null, 18)).toBe(18);
    expect(resolveElectricityRatePerKwh(undefined, undefined)).toBe(
      BUSINESS.DEFAULT_ELECTRICITY_RATE_PER_KWH,
    );

    expect(resolveWaterRatePerUnit(42, 30)).toBe(42);
    expect(resolveWaterRatePerUnit("18.75", 30)).toBe("18.75");
    expect(resolveWaterRatePerUnit(undefined, 30)).toBe(30);
    expect(resolveWaterRatePerUnit("", 30)).toBe(30);
    expect(resolveWaterRatePerUnit(null, undefined)).toBe(0);

    expect(resolvePenaltyRatePerDay(60, 50)).toBe(60);
    expect(resolvePenaltyRatePerDay(undefined, 50)).toBe(50);
    expect(resolvePenaltyRatePerDay(null, undefined)).toBe(BUSINESS.PENALTY_RATE_PER_DAY);
  });
});
