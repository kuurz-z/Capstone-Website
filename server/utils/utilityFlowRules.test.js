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
    expect(isWaterBillableRoom("quadruple-sharing")).toBe(false);
  });
});

describe("filterBillableReservationsForPeriod", () => {
  test("keeps only overlapping moved-in and moved-out reservations", () => {
    const reservations = [
      {
        _id: "res-1",
        userId: { _id: "tenant-1" },
        status: "moveIn",
        moveInDate: new Date("2026-03-10T00:00:00.000Z"),
        moveOutDate: null,
      },
      {
        _id: "res-2",
        userId: { _id: "tenant-2" },
        status: "reserved",
        moveInDate: new Date("2026-03-20T00:00:00.000Z"),
        moveOutDate: null,
      },
      {
        _id: "res-3",
        userId: { _id: "tenant-3" },
        status: "moveOut",
        moveInDate: new Date("2026-02-20T00:00:00.000Z"),
        moveOutDate: new Date("2026-03-14T00:00:00.000Z"),
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
        status: "moveIn",
        moveInDate: new Date("2026-03-20T00:00:00.000Z"),
        moveOutDate: null,
      },
      {
        _id: "res-2",
        userId: { _id: "tenant-2", firstName: "Ben", lastName: "MoveOut" },
        status: "moveOut",
        moveInDate: new Date("2026-03-01T00:00:00.000Z"),
        moveOutDate: new Date("2026-04-10T00:00:00.000Z"),
      },
    ];
    const readings = [
      {
        tenantId: "tenant-2",
        eventType: "moveIn",
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
        status: "moveIn",
        moveInDate: new Date("2026-03-22T00:00:00.000Z"),
        moveOutDate: null,
      },
    ];

    const readings = [
      {
        tenantId: "tenant-1",
        eventType: "moveIn",
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
        status: "moveIn",
        moveInDate: new Date("2026-03-01T00:00:00.000Z"),
        moveOutDate: null,
      },
      {
        _id: "res-2",
        userId: { _id: "tenant-2", firstName: "New", lastName: "Arrival" },
        status: "moveOut",
        moveInDate: new Date("2026-03-20T00:00:00.000Z"),
        moveOutDate: new Date("2026-04-05T00:00:00.000Z"),
      },
    ];
    const readings = [
      {
        tenantId: "tenant-2",
        eventType: "moveIn",
        reading: 130,
        date: new Date("2026-03-20T00:00:00.000Z"),
      },
      {
        tenantId: "tenant-2",
        eventType: "moveOut",
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

  test("anchors move-ins on cycle start date to period start reading", () => {
    const reservations = [
      {
        _id: "res-start",
        userId: {
          _id: "tenant-start",
          firstName: "Start",
          lastName: "Day",
        },
        status: "moveIn",
        moveInDate: new Date("2026-03-15T00:00:00.000Z"),
        moveOutDate: null,
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
        status: "moveIn",
        selectedBed: { id: "bed-a" },
        moveInDate: new Date("2026-03-18T00:00:00.000Z"),
        moveOutDate: new Date("2026-04-05T00:00:00.000Z"),
      },
      {
        _id: "res-2",
        userId: { _id: "tenant-2", firstName: "Bea", lastName: "Two" },
        status: "moveIn",
        selectedBed: { id: "bed-a" },
        moveInDate: new Date("2026-04-01T00:00:00.000Z"),
        moveOutDate: null,
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
