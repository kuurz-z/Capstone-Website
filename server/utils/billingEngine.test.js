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
});
