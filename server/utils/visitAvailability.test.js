import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const visitAvailabilityFindOne = jest.fn();
const visitAvailabilityCreate = jest.fn();
const roomFind = jest.fn();
const reservationFind = jest.fn();

await jest.unstable_mockModule("../models/index.js", () => ({
  ROOM_BRANCHES: ["gil-puyat", "guadalupe"],
  Room: { find: roomFind },
  Reservation: { find: reservationFind },
  VisitAvailability: {
    findOne: visitAvailabilityFindOne,
    create: visitAvailabilityCreate,
  },
}));

await jest.unstable_mockModule("./lifecycleNaming.js", () => ({
  reservationStatusesForQuery: jest.fn((...statuses) => statuses.flat()),
}));

const {
  buildVisitAvailability,
  getDateClosureReason,
  getVisitAvailabilitySettings,
  serializeVisitAvailabilitySettings,
  validateVisitSelection,
} = await import("./visitAvailability.js");

const buildSettings = (overrides = {}) => ({
  branch: "gil-puyat",
  enabledWeekdays: [1, 2, 3, 4, 5],
  slots: [{ label: "09:00 AM", enabled: true, capacity: 1 }],
  blackoutDates: [],
  ...overrides,
});

const mockRoomIds = () => {
  roomFind.mockReturnValue({
    distinct: jest.fn().mockResolvedValue(["room-1", "room-2"]),
  });
};

const mockReservations = (rows = []) => {
  reservationFind.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(rows),
    }),
  });
};

describe("visitAvailability", () => {
  beforeEach(() => {
    visitAvailabilityFindOne.mockReset();
    visitAvailabilityCreate.mockReset();
    roomFind.mockReset();
    reservationFind.mockReset();
    visitAvailabilityFindOne.mockResolvedValue(buildSettings());
    mockRoomIds();
    mockReservations();
  });

  test("creates default branch settings when missing", async () => {
    visitAvailabilityFindOne.mockResolvedValue(null);
    visitAvailabilityCreate.mockResolvedValue(buildSettings());

    const settings = await getVisitAvailabilitySettings("gil-puyat");

    expect(visitAvailabilityCreate).toHaveBeenCalledWith({ branch: "gil-puyat" });
    expect(settings.branch).toBe("gil-puyat");
  });

  test("rejects same-day visit attempts", async () => {
    const result = await validateVisitSelection({
      branch: "gil-puyat",
      visitDate: "2026-05-04",
      visitTime: "09:00 AM",
      roomId: "room-1",
      now: new Date("2026-05-04T08:00:00"),
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("VISIT_DATE_SAME_DAY");
  });

  test("rejects past visit attempts", async () => {
    const result = await validateVisitSelection({
      branch: "gil-puyat",
      visitDate: "2026-05-03",
      visitTime: "09:00 AM",
      roomId: "room-1",
      now: new Date("2026-05-04T08:00:00"),
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("VISIT_DATE_IN_PAST");
  });

  test("rejects closed blackout dates", async () => {
    visitAvailabilityFindOne.mockResolvedValue(
      buildSettings({ blackoutDates: [{ date: "2026-05-05", reason: "Staff training" }] }),
    );

    const result = await validateVisitSelection({
      branch: "gil-puyat",
      visitDate: "2026-05-05",
      visitTime: "09:00 AM",
      roomId: "room-1",
      now: new Date("2026-05-04T08:00:00"),
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("VISIT_DATE_CLOSED");
    expect(result.error).toBe("Staff training");
  });

  test("treats canonical Monday-Friday settings as open weekdays only", () => {
    const settings = buildSettings({ enabledWeekdays: [1, 2, 3, 4, 5], weekdaySystem: "js-get-day" });
    const now = new Date("2026-05-04T08:00:00");

    expect(getDateClosureReason({ dateKey: "2026-05-08", settings, now })).toBeNull();
    expect(getDateClosureReason({ dateKey: "2026-05-09", settings, now })?.code).toBe("VISIT_DATE_CLOSED");
    expect(getDateClosureReason({ dateKey: "2026-05-10", settings, now })?.code).toBe("VISIT_DATE_CLOSED");
    expect(getDateClosureReason({ dateKey: "2026-05-11", settings, now })).toBeNull();
  });

  test("interprets legacy Monday-zero default as Monday-Friday", () => {
    const settings = buildSettings({ enabledWeekdays: [0, 1, 2, 3, 4], weekdaySystem: undefined });
    const now = new Date("2026-05-04T08:00:00");

    expect(serializeVisitAvailabilitySettings(settings).enabledWeekdays).toEqual([1, 2, 3, 4, 5]);
    expect(getDateClosureReason({ dateKey: "2026-05-08", settings, now })).toBeNull();
    expect(getDateClosureReason({ dateKey: "2026-05-09", settings, now })?.code).toBe("VISIT_DATE_CLOSED");
    expect(getDateClosureReason({ dateKey: "2026-05-10", settings, now })?.code).toBe("VISIT_DATE_CLOSED");
  });

  test("builds applicant availability with weekends closed for Monday-Friday rules", async () => {
    visitAvailabilityFindOne.mockResolvedValue(
      buildSettings({ enabledWeekdays: [1, 2, 3, 4, 5], weekdaySystem: "js-get-day" }),
    );

    const result = await buildVisitAvailability({
      branch: "gil-puyat",
      from: "2026-05-08",
      days: 4,
      now: new Date("2026-05-04T08:00:00"),
    });

    expect(result.dates.map((date) => [date.date, date.available])).toEqual([
      ["2026-05-08", true],
      ["2026-05-09", false],
      ["2026-05-10", false],
      ["2026-05-11", true],
    ]);
  });

  test("rejects configured capacity when slot is full", async () => {
    mockReservations([{ visitTime: "09:00 AM" }]);

    const result = await validateVisitSelection({
      branch: "gil-puyat",
      visitDate: "2026-05-05",
      visitTime: "09:00 AM",
      roomId: "room-1",
      now: new Date("2026-05-04T08:00:00"),
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("VISIT_CAPACITY_REACHED");
  });

  test("rejects room-slot conflicts after capacity allows the slot", async () => {
    visitAvailabilityFindOne.mockResolvedValue(
      buildSettings({ slots: [{ label: "09:00 AM", enabled: true, capacity: 2 }] }),
    );
    reservationFind
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ visitTime: "09:00 AM" }]),
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ visitTime: "09:00 AM" }]),
        }),
      });

    const result = await validateVisitSelection({
      branch: "gil-puyat",
      visitDate: "2026-05-05",
      visitTime: "09:00 AM",
      roomId: "room-1",
      now: new Date("2026-05-04T08:00:00"),
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("VISIT_SLOT_CONFLICT");
  });
});
