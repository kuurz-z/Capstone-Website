import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const userFindById = jest.fn();
const roomFindById = jest.fn();
const setCustomUserClaims = jest.fn();

await jest.unstable_mockModule("../models/index.js", () => ({
  User: { findById: userFindById },
  Room: { findById: roomFindById },
  Reservation: {},
}));

await jest.unstable_mockModule("../config/firebase.js", () => ({
  getAuth: () => ({ setCustomUserClaims }),
}));

const { handleStatusTransition } = await import("../utils/reservationHelpers.js");

describe("reservation lifecycle transitions", () => {
  beforeEach(() => {
    userFindById.mockReset();
    roomFindById.mockReset();
    setCustomUserClaims.mockReset();
  });

  test("reserved updates keep applicant lifecycle and sync branch", async () => {
    const user = {
      firebaseUid: "firebase-1",
      role: "applicant",
      tenantStatus: "applicant",
      branch: null,
      save: jest.fn(async function save() {
        return this;
      }),
    };
    userFindById.mockResolvedValue(user);
    roomFindById.mockResolvedValue({ branch: "gil-puyat" });

    await handleStatusTransition("reserved", "pending", "user-1", "room-1");

    expect(user.branch).toBe("gil-puyat");
    expect(user.role).toBe("applicant");
    expect(user.tenantStatus).toBe("applicant");
    expect(setCustomUserClaims).toHaveBeenCalledWith("firebase-1", {
      role: "applicant",
      tenantStatus: "applicant",
    });
  });

  test("moveIn promotes applicant to active tenant", async () => {
    const user = {
      firebaseUid: "firebase-2",
      role: "applicant",
      tenantStatus: "applicant",
      branch: null,
      save: jest.fn(async function save() {
        return this;
      }),
    };
    userFindById.mockResolvedValue(user);
    roomFindById.mockResolvedValue({ branch: "guadalupe" });

    await handleStatusTransition("moveIn", "reserved", "user-2", "room-2");

    expect(user.role).toBe("tenant");
    expect(user.tenantStatus).toBe("active");
    expect(setCustomUserClaims).toHaveBeenCalledWith("firebase-2", {
      role: "tenant",
      tenantStatus: "active",
    });
  });

  test("cancelled keeps applicant lifecycle when returning to queue", async () => {
    const user = {
      firebaseUid: "firebase-3",
      role: "applicant",
      tenantStatus: "applicant",
      branch: "gil-puyat",
      save: jest.fn(async function save() {
        return this;
      }),
    };
    userFindById.mockResolvedValue(user);

    await handleStatusTransition("cancelled", "reserved", "user-3", "room-3");

    expect(user.branch).toBeNull();
    expect(user.role).toBe("applicant");
    expect(user.tenantStatus).toBe("applicant");
    expect(setCustomUserClaims).toHaveBeenCalledWith("firebase-3", {
      role: "applicant",
      tenantStatus: "applicant",
    });
  });
});
