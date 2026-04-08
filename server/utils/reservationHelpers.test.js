import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const userFindById = jest.fn();
const roomFindById = jest.fn();
const reservationFindOne = jest.fn();
const setCustomUserClaims = jest.fn();

await jest.unstable_mockModule("../models/index.js", () => ({
  User: {
    findById: userFindById,
  },
  Room: {
    findById: roomFindById,
  },
  Reservation: {
    findOne: reservationFindOne,
  },
}));

await jest.unstable_mockModule("../config/firebase.js", () => ({
  getAuth: () => ({
    setCustomUserClaims,
  }),
}));

const { syncReservationUserLifecycle } = await import("./reservationHelpers.js");

const createUser = (overrides = {}) => ({
  firebaseUid: "firebase-user-1",
  role: "applicant",
  tenantStatus: "applicant",
  branch: null,
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const mockRoomBranch = (branch) => {
  const select = jest.fn().mockResolvedValue({ branch });
  roomFindById.mockReturnValue({ select });
  return select;
};

const mockNoFallbackReservations = () => {
  reservationFindOne.mockImplementation(() => ({
    sort: jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue(null),
    }),
  }));
};

describe("syncReservationUserLifecycle", () => {
  beforeEach(() => {
    userFindById.mockReset();
    roomFindById.mockReset();
    reservationFindOne.mockReset();
    setCustomUserClaims.mockReset();
  });

  test("promotes a moved-in reservation user to active tenant and syncs branch", async () => {
    const user = createUser();
    userFindById.mockResolvedValue(user);
    mockRoomBranch("gil-puyat");

    await syncReservationUserLifecycle({
      status: "moveIn",
      previousStatus: "reserved",
      userId: "user-1",
      roomId: "room-1",
      reservationId: "reservation-1",
    });

    expect(user.role).toBe("tenant");
    expect(user.tenantStatus).toBe("active");
    expect(user.branch).toBe("gil-puyat");
    expect(user.save).toHaveBeenCalledTimes(1);
    expect(setCustomUserClaims).toHaveBeenCalledWith("firebase-user-1", {
      role: "tenant",
      tenantStatus: "active",
    });
  });

  test("falls back to the latest moved-out reservation when a reservation is archived", async () => {
    const user = createUser({ role: "tenant", tenantStatus: "active", branch: "gil-puyat" });
    userFindById.mockResolvedValue(user);

    const populateCheckedIn = jest.fn().mockResolvedValue(null);
    const populateReserved = jest.fn().mockResolvedValue(null);
    const populateCheckedOut = jest.fn().mockResolvedValue({
      roomId: { branch: "guadalupe" },
    });

    reservationFindOne
      .mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({ populate: populateCheckedIn }),
      })
      .mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({ populate: populateReserved }),
      })
      .mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({ populate: populateCheckedOut }),
      });

    await syncReservationUserLifecycle({
      status: "archived",
      previousStatus: "moveIn",
      userId: "user-1",
      roomId: "room-1",
      reservationId: "reservation-1",
    });

    expect(user.role).toBe("applicant");
    expect(user.tenantStatus).toBe("inactive");
    expect(user.branch).toBe("guadalupe");
    expect(setCustomUserClaims).toHaveBeenCalledWith("firebase-user-1", {
      role: "applicant",
      tenantStatus: "inactive",
    });
  });

  test("force sync updates branch on same-status transfer", async () => {
    const user = createUser({ role: "tenant", tenantStatus: "active", branch: "gil-puyat" });
    userFindById.mockResolvedValue(user);
    mockRoomBranch("guadalupe");

    await syncReservationUserLifecycle({
      status: "moveIn",
      previousStatus: "moveIn",
      userId: "user-1",
      roomId: "room-2",
      reservationId: "reservation-1",
      force: true,
    });

    expect(user.role).toBe("tenant");
    expect(user.tenantStatus).toBe("active");
    expect(user.branch).toBe("guadalupe");
    expect(user.save).toHaveBeenCalledTimes(1);
  });

  test("resets cancelled reservations with no fallback stay to applicant with no branch", async () => {
    const user = createUser({ role: "tenant", tenantStatus: "active", branch: "gil-puyat" });
    userFindById.mockResolvedValue(user);
    mockNoFallbackReservations();

    await syncReservationUserLifecycle({
      status: "cancelled",
      previousStatus: "reserved",
      userId: "user-1",
      roomId: "room-1",
      reservationId: "reservation-1",
    });

    expect(user.role).toBe("applicant");
    expect(user.tenantStatus).toBe("applicant");
    expect(user.branch).toBeNull();
  });
});
