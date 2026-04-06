import { describe, expect, test } from "@jest/globals";
import {
  buildTenantEventsForPeriod,
  filterBillableReservationsForPeriod,
  findBedOccupancyOverlaps,
  findMissingElectricityLifecycleReadings,
  isWaterBillableRoom,
} from "./utilityFlowRules.js";

const basePeriod = {
  startDate: new Date("2026-03-15T00:00:00.000Z"),
  endDate: new Date("2026-04-15T00:00:00.000Z"),
  startReading: 100,
};

describe("isWaterBillableRoom", () => {
  test("only allows private and double-sharing rooms", () => {
    expect(isWaterBillableRoom("private")).toBe(true);
    expect(isWaterBillableRoom("double-sharing")).toBe(true);
    expect(isWaterBillableRoom("quadruple-sharing")).toBe(true);
  });
});

describe("filterBillableReservationsForPeriod", () => {
  test("keeps only overlapping checked-in and checked-out reservations", () => {
    const reservations = [
      {
        _id: "res-1",
        userId: { _id: "tenant-1" },
        status: "checked-in",
        checkInDate: new Date("2026-03-10T00:00:00.000Z"),
        checkOutDate: null,
      },
      {
        _id: "res-2",
        userId: { _id: "tenant-2" },
        status: "reserved",
        checkInDate: new Date("2026-03-20T00:00:00.000Z"),
        checkOutDate: null,
      },
      {
        _id: "res-3",
        userId: { _id: "tenant-3" },
        status: "checked-out",
        checkInDate: new Date("2026-02-20T00:00:00.000Z"),
        checkOutDate: new Date("2026-03-14T00:00:00.000Z"),
      },
    ];

    const result = filterBillableReservationsForPeriod({
      reservations,
      cycleStart: basePeriod.startDate,
      cycleEnd: basePeriod.endDate,
    });

    expect(result.map((entry) => entry._id)).toEqual(["res-1"]);
  });
});

describe("findMissingElectricityLifecycleReadings", () => {
  test("flags move-in and move-out events that happened inside the cycle without matching readings", () => {
    const reservations = [
      {
        _id: "res-1",
        userId: { _id: "tenant-1", firstName: "Ana", lastName: "MoveIn" },
        status: "checked-in",
        checkInDate: new Date("2026-03-20T00:00:00.000Z"),
        checkOutDate: null,
      },
      {
        _id: "res-2",
        userId: { _id: "tenant-2", firstName: "Ben", lastName: "MoveOut" },
        status: "checked-out",
        checkInDate: new Date("2026-03-01T00:00:00.000Z"),
        checkOutDate: new Date("2026-04-10T00:00:00.000Z"),
      },
    ];
    const readings = [
      {
        tenantId: "tenant-2",
        eventType: "move-in",
        reading: 120,
        date: new Date("2026-03-15T00:00:00.000Z"),
      },
    ];

    const result = findMissingElectricityLifecycleReadings({
      period: basePeriod,
      reservations,
      readings,
    });

    expect(result.hasMissingReadings).toBe(true);
    expect(result.missingMoveInReadings.map((entry) => entry.tenantId)).toEqual(
      ["tenant-1"],
    );
    expect(
      result.missingMoveOutReadings.map((entry) => entry.tenantId),
    ).toEqual(["tenant-2"]);
  });

  test("requires lifecycle readings to match the exact move event date", () => {
    const reservations = [
      {
        _id: "res-1",
        userId: { _id: "tenant-1", firstName: "Mina", lastName: "Exact" },
        status: "checked-in",
        checkInDate: new Date("2026-03-22T00:00:00.000Z"),
        checkOutDate: null,
      },
    ];

    const readings = [
      {
        tenantId: "tenant-1",
        eventType: "move-in",
        reading: 140,
        date: new Date("2026-03-21T00:00:00.000Z"),
      },
    ];

    const result = findMissingElectricityLifecycleReadings({
      period: basePeriod,
      reservations,
      readings,
    });

    expect(result.hasMissingReadings).toBe(true);
    expect(result.missingMoveInReadings).toEqual([
      expect.objectContaining({
        tenantId: "tenant-1",
        reason: "missing exact-date move-in reading",
      }),
    ]);
  });
});

describe("buildTenantEventsForPeriod", () => {
  test("anchors pre-cycle tenants to the period start reading and keeps in-cycle move readings", () => {
    const reservations = [
      {
        _id: "res-1",
        userId: { _id: "tenant-1", firstName: "Carry", lastName: "Over" },
        status: "checked-in",
        checkInDate: new Date("2026-03-01T00:00:00.000Z"),
        checkOutDate: null,
      },
      {
        _id: "res-2",
        userId: { _id: "tenant-2", firstName: "New", lastName: "Arrival" },
        status: "checked-out",
        checkInDate: new Date("2026-03-20T00:00:00.000Z"),
        checkOutDate: new Date("2026-04-05T00:00:00.000Z"),
      },
    ];
    const readings = [
      {
        tenantId: "tenant-2",
        eventType: "move-in",
        reading: 130,
        date: new Date("2026-03-20T00:00:00.000Z"),
      },
      {
        tenantId: "tenant-2",
        eventType: "move-out",
        reading: 165,
        date: new Date("2026-04-05T00:00:00.000Z"),
      },
    ];

    const result = buildTenantEventsForPeriod({
      period: basePeriod,
      reservations,
      readings,
    });

    expect(result).toEqual([
      expect.objectContaining({
        tenantId: "tenant-1",
        moveInReading: 100,
        moveOutReading: null,
      }),
      expect.objectContaining({
        tenantId: "tenant-2",
        moveInReading: 130,
        moveOutReading: 165,
      }),
    ]);
  });

  test("anchors check-ins on cycle start date to period start reading", () => {
    const reservations = [
      {
        _id: "res-start",
        userId: {
          _id: "tenant-start",
          firstName: "Start",
          lastName: "Day",
        },
        status: "checked-in",
        checkInDate: new Date("2026-03-15T00:00:00.000Z"),
        checkOutDate: null,
      },
    ];

    const result = buildTenantEventsForPeriod({
      period: basePeriod,
      reservations,
      readings: [],
    });

    expect(result).toEqual([
      expect.objectContaining({
        tenantId: "tenant-start",
        moveInReading: 100,
        moveOutReading: null,
      }),
    ]);
  });
});

describe("findBedOccupancyOverlaps", () => {
  test("flags overlaps for the same bed during the billing scope", () => {
    const reservations = [
      {
        _id: "res-1",
        userId: { _id: "tenant-1", firstName: "Alex", lastName: "One" },
        status: "checked-in",
        selectedBed: { id: "bed-a" },
        checkInDate: new Date("2026-03-18T00:00:00.000Z"),
        checkOutDate: new Date("2026-04-05T00:00:00.000Z"),
      },
      {
        _id: "res-2",
        userId: { _id: "tenant-2", firstName: "Bea", lastName: "Two" },
        status: "checked-in",
        selectedBed: { id: "bed-a" },
        checkInDate: new Date("2026-04-01T00:00:00.000Z"),
        checkOutDate: null,
      },
    ];

    const result = findBedOccupancyOverlaps({
      reservations,
      cycleStart: basePeriod.startDate,
      cycleEnd: basePeriod.endDate,
    });

    expect(result.hasOverlaps).toBe(true);
    expect(result.overlaps[0]).toEqual(
      expect.objectContaining({
        bedKey: "bed-a",
        firstTenantName: "Alex One",
        secondTenantName: "Bea Two",
      }),
    );
  });
});
