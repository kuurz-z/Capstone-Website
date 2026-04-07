import { describe, expect, test } from "@jest/globals";
import { computeBilling } from "./billingEngine.js";

describe("computeBilling - strict segmented mode", () => {
  test("computes one boundary segment when no move events exist", () => {
    const utilityPeriod = {
      startDate: new Date("2026-03-15T00:00:00.000Z"),
      endDate: new Date("2026-04-15T00:00:00.000Z"),
      startReading: 100,
      endReading: 140,
      ratePerUnit: 12,
    };

    const readings = [
      {
        reading: 100,
        date: new Date("2026-03-15T00:00:00.000Z"),
        eventType: "period-start",
      },
      {
        reading: 140,
        date: new Date("2026-04-15T00:00:00.000Z"),
        eventType: "period-end",
      },
    ];

    const tenantEvents = [
      {
        tenantId: "tenant-1",
        tenantName: "Tenant One",
        moveInReading: 100,
        moveOutReading: null,
      },
      {
        tenantId: "tenant-2",
        tenantName: "Tenant Two",
        moveInReading: 100,
        moveOutReading: null,
      },
    ];

    const result = computeBilling({
      utilityPeriod,
      readings,
      reservations: [],
      tenantEvents,
      forceSegmented: true,
    });

    expect(result.strategy).toBe("segment-based-strict");
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toEqual(
      expect.objectContaining({
        unitsConsumed: 40,
        activeTenantCount: 2,
        sharePerTenantUnits: 20,
        sharePerTenantCost: 240,
      }),
    );
  });

  test("throws when a consuming segment has no active tenants", () => {
    const utilityPeriod = {
      startDate: new Date("2026-03-15T00:00:00.000Z"),
      endDate: new Date("2026-04-15T00:00:00.000Z"),
      startReading: 200,
      endReading: 260,
      ratePerUnit: 10,
    };

    const readings = [
      {
        reading: 200,
        date: new Date("2026-03-15T00:00:00.000Z"),
        eventType: "period-start",
      },
      {
        reading: 260,
        date: new Date("2026-04-15T00:00:00.000Z"),
        eventType: "period-end",
      },
    ];

    expect(() =>
      computeBilling({
        utilityPeriod,
        readings,
        reservations: [],
        tenantEvents: [],
        forceSegmented: true,
      }),
    ).toThrow(/no active tenants/i);
  });

  test("removes zero-consumption boundary segments and keeps consuming segments", () => {
    const utilityPeriod = {
      startDate: new Date("2026-03-15T00:00:00.000Z"),
      endDate: new Date("2026-04-15T00:00:00.000Z"),
      startReading: 1000,
      endReading: 1204,
      ratePerUnit: 16,
    };

    const readings = [
      {
        reading: 1000,
        date: new Date("2026-03-15T00:00:00.000Z"),
        eventType: "period-start",
      },
      {
        reading: 1000,
        date: new Date("2026-03-15T00:00:00.000Z"),
        eventType: "move-in",
      },
      {
        reading: 1204,
        date: new Date("2026-04-15T00:00:00.000Z"),
        eventType: "period-end",
      },
    ];

    const tenantEvents = [
      {
        tenantId: "tenant-1",
        tenantName: "Tenant One",
        moveInReading: 1000,
        moveOutReading: null,
      },
    ];

    const result = computeBilling({
      utilityPeriod,
      readings,
      reservations: [],
      tenantEvents,
      forceSegmented: true,
    });

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toEqual(
      expect.objectContaining({
        segmentIndex: 0,
        readingFrom: 1000,
        readingTo: 1204,
        unitsConsumed: 204,
      }),
    );
  });
});

describe("computeBilling - water occupancy mode", () => {
  test("splits shared-room water charge by covered days", () => {
    const utilityPeriod = {
      startDate: new Date("2026-03-15T00:00:00.000Z"),
      endDate: new Date("2026-04-15T00:00:00.000Z"),
      startReading: 0,
      endReading: 0,
      ratePerUnit: 1200,
    };

    const reservations = [
      {
        _id: "res-1",
        userId: {
          _id: "tenant-1",
          firstName: "Ana",
          lastName: "Stay",
          email: "ana@example.com",
        },
        checkInDate: new Date("2026-03-15T00:00:00.000Z"),
        checkOutDate: null,
      },
      {
        _id: "res-2",
        userId: {
          _id: "tenant-2",
          firstName: "Ben",
          lastName: "Leave",
          email: "ben@example.com",
        },
        checkInDate: new Date("2026-03-20T00:00:00.000Z"),
        checkOutDate: new Date("2026-04-05T00:00:00.000Z"),
      },
    ];

    const result = computeBilling({
      utilityPeriod,
      reservations,
      utilityType: "water",
      roomType: "double-sharing",
    });

    expect(result.strategy).toBe("occupancy-day-proration");
    expect(result.segments).toEqual([]);
    expect(result.computedTotalCost).toBe(1200);
    expect(result.tenantSummaries).toHaveLength(2);
    expect(result.tenantSummaries[0]).toEqual(
      expect.objectContaining({
        tenantId: "tenant-1",
        coveredDays: 31,
        allocationRule: "shared-prorated-days",
      }),
    );
    expect(result.tenantSummaries[1]).toEqual(
      expect.objectContaining({
        tenantId: "tenant-2",
        coveredDays: 16,
        allocationRule: "shared-prorated-days",
      }),
    );
    expect(
      result.tenantSummaries.reduce((sum, entry) => sum + entry.billAmount, 0),
    ).toBeCloseTo(1200, 2);
  });

  test("charges a private room fixed amount for a single tenant", () => {
    const utilityPeriod = {
      startDate: new Date("2026-03-15T00:00:00.000Z"),
      endDate: new Date("2026-04-15T00:00:00.000Z"),
      startReading: 0,
      endReading: 0,
      ratePerUnit: 500,
    };

    const reservations = [
      {
        _id: "res-1",
        userId: {
          _id: "tenant-1",
          firstName: "Pri",
          lastName: "Vate",
        },
        checkInDate: new Date("2026-03-18T00:00:00.000Z"),
        checkOutDate: null,
      },
    ];

    const result = computeBilling({
      utilityPeriod,
      reservations,
      utilityType: "water",
      roomType: "private",
    });

    expect(result.tenantSummaries).toHaveLength(1);
    expect(result.tenantSummaries[0]).toEqual(
      expect.objectContaining({
        coveredDays: 28,
        shareFactor: 1,
        billAmount: 500,
        allocationRule: "private-fixed",
      }),
    );
  });
});
