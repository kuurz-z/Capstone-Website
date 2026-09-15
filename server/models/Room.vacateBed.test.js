import { describe, expect, it } from "@jest/globals";
import mongoose from "mongoose";
import Room from "./Room.js";

describe("Room.vacateBed method", () => {
  const user1 = new mongoose.Types.ObjectId();
  const user2 = new mongoose.Types.ObjectId();
  const res1 = new mongoose.Types.ObjectId();
  const res2 = new mongoose.Types.ObjectId();

  const createSampleRoom = () => {
    return new Room({
      name: "Room 204",
      roomNumber: "204",
      branch: "gil-puyat",
      type: "quadruple-sharing",
      capacity: 4,
      currentOccupancy: 2,
      price: 5000,
      beds: [
        {
          id: "bed-1",
          position: "lower",
          bunkBlock: "A",
          code: "204-A-L",
          status: "occupied",
          occupiedBy: {
            userId: user1,
            reservationId: res1,
            occupiedSince: new Date("2026-01-01"),
          },
        },
        {
          id: "bed-2",
          position: "upper",
          bunkBlock: "A",
          code: "204-A-U",
          status: "available",
          occupiedBy: {
            userId: null,
            reservationId: null,
            occupiedSince: null,
          },
        },
        {
          id: "bed-3",
          position: "lower",
          bunkBlock: "B",
          code: "204-B-L",
          status: "occupied",
          occupiedBy: {
            userId: user2,
            reservationId: res2,
            occupiedSince: new Date("2026-02-01"),
          },
        },
        {
          id: "bed-4",
          position: "upper",
          bunkBlock: "B",
          code: "204-B-U",
          status: "available",
          occupiedBy: {
            userId: null,
            reservationId: null,
            occupiedSince: null,
          },
        },
      ],
    });
  };

  it("vacates bed by exact bed code (e.g. 204-B-L) and resets bed attributes", () => {
    const room = createSampleRoom();
    const result = room.vacateBed("204-B-L");

    expect(result).toBe(true);
    const vacatedBed = room.beds.find((b) => b.code === "204-B-L");
    expect(vacatedBed.status).toBe("available");
    expect(vacatedBed.lockedBy).toBeNull();
    expect(vacatedBed.lockExpiresAt).toBeNull();
    expect(vacatedBed.occupiedBy.userId).toBeNull();
    expect(vacatedBed.occupiedBy.reservationId).toBeNull();
    expect(vacatedBed.occupiedBy.occupiedSince).toBeNull();

    // Bed 1 must remain occupied
    const otherBed = room.beds.find((b) => b.code === "204-A-L");
    expect(otherBed.status).toBe("occupied");
    expect(String(otherBed.occupiedBy.userId)).toBe(String(user1));
  });

  it("vacates bed by direct bed id (case-insensitive)", () => {
    const room = createSampleRoom();
    const result = room.vacateBed("BED-1");

    expect(result).toBe(true);
    const bed1 = room.beds.find((b) => b.id === "bed-1");
    expect(bed1.status).toBe("available");
    expect(bed1.occupiedBy.userId).toBeNull();
  });

  it("vacates bed by bed _id", () => {
    const room = createSampleRoom();
    const targetBedMongoId = room.beds[0]._id;
    const result = room.vacateBed(String(targetBedMongoId));

    expect(result).toBe(true);
    expect(room.beds[0].status).toBe("available");
  });

  it("vacates bed matching position string 'lower' and user ID when multiple lower beds exist", () => {
    const room = createSampleRoom();
    // Both bed-1 and bed-3 are 'lower'. We want to vacate user2's bed.
    const result = room.vacateBed("lower", user2);

    expect(result).toBe(true);
    const bed3 = room.beds.find((b) => b.id === "bed-3");
    expect(bed3.status).toBe("available");
    expect(bed3.occupiedBy.userId).toBeNull();

    // Bed 1 must remain untouched
    const bed1 = room.beds.find((b) => b.id === "bed-1");
    expect(bed1.status).toBe("occupied");
    expect(String(bed1.occupiedBy.userId)).toBe(String(user1));
  });

  it("vacates bed matching tenant userId even if bedId is null", () => {
    const room = createSampleRoom();
    const result = room.vacateBed(null, user1);

    expect(result).toBe(true);
    const bed1 = room.beds.find((b) => b.id === "bed-1");
    expect(bed1.status).toBe("available");
    expect(bed1.occupiedBy.userId).toBeNull();

    // Bed 3 must remain occupied
    const bed3 = room.beds.find((b) => b.id === "bed-3");
    expect(bed3.status).toBe("occupied");
  });

  it("vacates bed when populated user object { _id } is passed as userId", () => {
    const room = createSampleRoom();
    const result = room.vacateBed(null, { _id: user2 });

    expect(result).toBe(true);
    const bed3 = room.beds.find((b) => b.id === "bed-3");
    expect(bed3.status).toBe("available");
    expect(bed3.occupiedBy.userId).toBeNull();
  });

  it("vacates bed matching reservationId when bedId is null or unmatched", () => {
    const room = createSampleRoom();
    const result = room.vacateBed(null, null, res2);

    expect(result).toBe(true);
    const bed3 = room.beds.find((b) => b.id === "bed-3");
    expect(bed3.status).toBe("available");
    expect(bed3.occupiedBy.reservationId).toBeNull();
  });

  it("vacates bed when populated reservation object { _id } is passed", () => {
    const room = createSampleRoom();
    const result = room.vacateBed(null, null, { _id: res1 });

    expect(result).toBe(true);
    const bed1 = room.beds.find((b) => b.id === "bed-1");
    expect(bed1.status).toBe("available");
  });

  it("vacates bed matching lockedBy user if bed was locked or reserved", () => {
    const room = createSampleRoom();
    const lockedUser = new mongoose.Types.ObjectId();
    room.beds[1].status = "locked";
    room.beds[1].lockedBy = lockedUser;
    room.beds[1].lockExpiresAt = new Date(Date.now() + 600000);

    const result = room.vacateBed(null, lockedUser);
    expect(result).toBe(true);
    expect(room.beds[1].status).toBe("available");
    expect(room.beds[1].lockedBy).toBeNull();
    expect(room.beds[1].lockExpiresAt).toBeNull();
  });

  it("vacates position string 'upper' (case-insensitive) when exactly 1 occupied/reserved bed has that position", () => {
    const room = createSampleRoom();
    // Make bed-4 (upper) occupied
    room.beds[3].status = "occupied";
    room.beds[3].occupiedBy = {
      userId: new mongoose.Types.ObjectId(),
      reservationId: new mongoose.Types.ObjectId(),
      occupiedSince: new Date(),
    };

    // Only bed-4 is occupied among upper beds
    const result = room.vacateBed("UPPER");
    expect(result).toBe(true);
    expect(room.beds[3].status).toBe("available");
    expect(room.beds[3].occupiedBy.userId).toBeNull();
  });

  it("falls back to vacating the only occupied bed when no identifiers match", () => {
    const singleOccupiedRoom = new Room({
      name: "Room 101",
      roomNumber: "101",
      branch: "gil-puyat",
      type: "private",
      capacity: 1,
      currentOccupancy: 1,
      price: 10000,
      beds: [
        {
          id: "bed-single-1",
          position: "single",
          bunkBlock: "A",
          code: "101-A-S",
          status: "occupied",
          occupiedBy: {
            userId: user1,
            reservationId: res1,
            occupiedSince: new Date(),
          },
        },
      ],
    });

    const result = singleOccupiedRoom.vacateBed("non-existent-id");
    expect(result).toBe(true);
    expect(singleOccupiedRoom.beds[0].status).toBe("available");
  });

  it("returns false if no bed matches and multiple occupied beds exist without matching fallback", () => {
    const room = createSampleRoom();
    const nonExistentUser = new mongoose.Types.ObjectId();
    const result = room.vacateBed("non-existent-id", nonExistentUser);
    expect(result).toBe(false);
  });

  it("handles empty or null beds array safely without throwing", () => {
    const emptyRoom = new Room({
      name: "Empty Room",
      roomNumber: "999",
      branch: "gil-puyat",
      type: "private",
      capacity: 1,
      price: 1000,
      beds: [],
    });

    expect(emptyRoom.vacateBed("bed-1")).toBe(false);
  });

  it("markBedForCleaning correctly delegates to vacateBed and vacates the bed", () => {
    const room = createSampleRoom();
    const result = room.markBedForCleaning("204-A-L");
    expect(result).toBe(true);
    expect(room.beds[0].status).toBe("available");
  });
});
