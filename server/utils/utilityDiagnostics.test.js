import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const roomFind = jest.fn();
const roomFindById = jest.fn();
const reservationDistinct = jest.fn();
const utilityReadingDistinct = jest.fn();
const utilityPeriodFind = jest.fn();
const utilityReadingFind = jest.fn();
const reservationFind = jest.fn();

await jest.unstable_mockModule("../models/index.js", () => ({
  Room: {
    find: roomFind,
    findById: roomFindById,
  },
  Reservation: {
    distinct: reservationDistinct,
    find: reservationFind,
  },
  UtilityPeriod: {
    find: utilityPeriodFind,
  },
  UtilityReading: {
    distinct: utilityReadingDistinct,
    find: utilityReadingFind,
  },
}));

const { getUtilityDiagnostics } = await import("./utilityDiagnostics.js");

function mockLeanResult(value) {
  return {
    lean: jest.fn().mockResolvedValue(value),
  };
}

function mockSelectLeanResult(value) {
  return {
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(value),
    }),
  };
}

function mockSortedLeanResult(value) {
  return {
    sort: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(value),
    }),
  };
}

describe("getUtilityDiagnostics", () => {
  beforeEach(() => {
    roomFind.mockReset();
    roomFindById.mockReset();
    reservationDistinct.mockReset();
    utilityReadingDistinct.mockReset();
    utilityPeriodFind.mockReset();
    utilityReadingFind.mockReset();
    reservationFind.mockReset();

    utilityPeriodFind.mockReturnValue(mockSortedLeanResult([]));
    utilityReadingFind.mockReturnValue(mockSortedLeanResult([]));
    reservationFind.mockReturnValue({
      populate: jest.fn().mockReturnValue(mockLeanResult([])),
    });
  });

  test("includes branch rooms with active checked-in tenants even when no readings exist yet", async () => {
    roomFind.mockReturnValueOnce(
      mockSelectLeanResult([
        {
          _id: "room-1",
          name: "Room A",
          roomNumber: "A-101",
          branch: "gil-puyat",
          type: "private",
          capacity: 1,
        },
      ]),
    );
    roomFindById.mockReturnValue(
      mockSelectLeanResult({
        _id: "room-1",
        name: "Room A",
        roomNumber: "A-101",
        branch: "gil-puyat",
        type: "private",
        capacity: 1,
      }),
    );

    reservationDistinct.mockResolvedValue(["room-1"]);
    utilityReadingDistinct.mockResolvedValue([]);

    const result = await getUtilityDiagnostics({ branch: "gil-puyat" });

    expect(result.electricityRooms).toHaveLength(1);
    expect(result.electricityRooms[0]).toMatchObject({
      roomId: "room-1",
      id: "room-1",
      name: "Room A",
      roomName: "Room A",
      branch: "gil-puyat",
      activeTenantCount: 0,
      hasOpenPeriod: false,
      latestReading: null,
    });
    expect(roomFind).toHaveBeenCalledWith({
      isArchived: false,
      branch: "gil-puyat",
    });
  });

  test("returns all branch rooms when the branch has no reservations or readings yet", async () => {
    roomFind.mockReturnValueOnce(
      mockSelectLeanResult([
        {
          _id: "room-2",
          name: "Room B",
          roomNumber: "B-201",
          branch: "guadalupe",
          type: "double-sharing",
          capacity: 2,
        },
      ]),
    );
    roomFindById.mockReturnValue(
      mockSelectLeanResult({
        _id: "room-2",
        name: "Room B",
        roomNumber: "B-201",
        branch: "guadalupe",
        type: "double-sharing",
        capacity: 2,
      }),
    );

    reservationDistinct.mockResolvedValue([]);
    utilityReadingDistinct.mockResolvedValue([]);

    const result = await getUtilityDiagnostics({ branch: "guadalupe" });

    expect(result.electricityRooms).toHaveLength(1);
    expect(result.waterRooms).toHaveLength(1);
    expect(roomFind).toHaveBeenCalledWith({
      isArchived: false,
      branch: "guadalupe",
    });
  });

  test("limits water rooms to private and double-sharing types", async () => {
    const rooms = [
      {
        _id: "room-private",
        name: "Room Private",
        roomNumber: "P-101",
        branch: "gil-puyat",
        type: "private",
        capacity: 1,
      },
      {
        _id: "room-double",
        name: "Room Double",
        roomNumber: "D-201",
        branch: "gil-puyat",
        type: "double-sharing",
        capacity: 2,
      },
      {
        _id: "room-quad",
        name: "Room Quad",
        roomNumber: "Q-301",
        branch: "gil-puyat",
        type: "quadruple-sharing",
        capacity: 4,
      },
    ];

    roomFind.mockReturnValueOnce(mockSelectLeanResult(rooms));
    roomFindById.mockImplementation((roomId) =>
      mockSelectLeanResult(rooms.find((room) => room._id === roomId) || null),
    );

    const result = await getUtilityDiagnostics({ branch: "gil-puyat" });

    expect(result.electricityRooms).toHaveLength(3);
    expect(result.waterRooms).toHaveLength(2);
    expect(result.waterRooms.map((room) => room.type)).toEqual([
      "private",
      "double-sharing",
    ]);
  });

  test("loads room type when building water room eligibility", async () => {
    const selectedFields = [];
    roomFind.mockReturnValueOnce({
      select: jest.fn().mockImplementation((fields) => {
        selectedFields.push(fields);
        return {
          lean: jest.fn().mockResolvedValue([
            {
              _id: "room-private",
              type: "private",
            },
          ]),
        };
      }),
    });
    roomFindById.mockReturnValue(
      mockSelectLeanResult({
        _id: "room-private",
        name: "Room Private",
        roomNumber: "P-101",
        branch: "gil-puyat",
        type: "private",
        capacity: 1,
      }),
    );

    await getUtilityDiagnostics({ branch: "gil-puyat" });

    expect(selectedFields).toContain("_id type");
  });
});
