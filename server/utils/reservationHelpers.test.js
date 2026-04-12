import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const userFindById = jest.fn();
const userFind = jest.fn();
const roomFindById = jest.fn();
const reservationFindOne = jest.fn();
const reservationFindById = jest.fn();
const setCustomUserClaims = jest.fn();

await jest.unstable_mockModule("../models/index.js", () => ({
  User: {
    findById: userFindById,
    find: userFind,
  },
  Room: {
    findById: roomFindById,
  },
  Reservation: {
    findOne: reservationFindOne,
    findById: reservationFindById,
  },
}));

await jest.unstable_mockModule("../config/firebase.js", () => ({
  getAuth: () => ({
    setCustomUserClaims,
  }),
}));

const {
  syncReservationUserLifecycle,
  reconcileTenantUsersForScope,
} = await import("./reservationHelpers.js");

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

const mockReservationById = ({ moveOutDate = null, branch = "gil-puyat" } = {}) => {
  reservationFindById.mockReturnValue({
    select: jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue({
        _id: "reservation-1",
        moveOutDate,
        roomId: { _id: "room-1", branch },
      }),
    }),
  });
};

describe("syncReservationUserLifecycle", () => {
  beforeEach(() => {
    userFindById.mockReset();
    userFind.mockReset();
    roomFindById.mockReset();
    reservationFindOne.mockReset();
    reservationFindById.mockReset();
    setCustomUserClaims.mockReset();
  });

  test("promotes a moved-in reservation user to active tenant and syncs branch", async () => {
    const user = createUser();
    userFindById.mockResolvedValue(user);
    mockRoomBranch("gil-puyat");
    mockReservationById({ branch: "gil-puyat" });

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

  test("resets archived tenant with no valid fallback to applicant with no branch", async () => {
    const user = createUser({ role: "tenant", tenantStatus: "active", branch: "gil-puyat" });
    userFindById.mockResolvedValue(user);
    mockNoFallbackReservations();

    await syncReservationUserLifecycle({
      status: "archived",
      previousStatus: "moveIn",
      userId: "user-1",
      roomId: "room-1",
      reservationId: "reservation-1",
    });

    expect(user.role).toBe("applicant");
    expect(user.tenantStatus).toBe("applicant");
    expect(user.branch).toBeNull();
    expect(setCustomUserClaims).toHaveBeenCalledWith("firebase-user-1", {
      role: "applicant",
      tenantStatus: "applicant",
    });
  });

  test("force sync updates branch on same-status transfer", async () => {
    const user = createUser({ role: "tenant", tenantStatus: "active", branch: "gil-puyat" });
    userFindById.mockResolvedValue(user);
    mockRoomBranch("guadalupe");
    mockReservationById({ branch: "guadalupe" });

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

  test("moveOut now reverts tenant lifecycle back to applicant when no fallback exists", async () => {
    const user = createUser({ role: "tenant", tenantStatus: "active", branch: "gil-puyat" });
    userFindById.mockResolvedValue(user);
    mockNoFallbackReservations();

    await syncReservationUserLifecycle({
      status: "moveOut",
      previousStatus: "moveIn",
      userId: "user-1",
      roomId: "room-1",
      reservationId: "reservation-1",
    });

    expect(user.role).toBe("applicant");
    expect(user.tenantStatus).toBe("applicant");
    expect(user.branch).toBeNull();
  });

  test("expired moved-in reservation falls back to reserved applicant lifecycle", async () => {
    const user = createUser({ role: "tenant", tenantStatus: "active", branch: "gil-puyat" });
    userFindById.mockResolvedValue(user);

    reservationFindById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          _id: "reservation-1",
          moveOutDate: new Date("2026-01-01T00:00:00.000Z"),
          roomId: { branch: "gil-puyat" },
        }),
      }),
    });

    reservationFindOne
      .mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(null),
        }),
      })
      .mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue({
            _id: "reservation-2",
            roomId: { _id: "room-2", branch: "guadalupe" },
          }),
        }),
      });

    await syncReservationUserLifecycle({
      status: "moveIn",
      previousStatus: "moveIn",
      userId: "user-1",
      roomId: "room-1",
      reservationId: "reservation-1",
      force: true,
    });

    expect(user.role).toBe("applicant");
    expect(user.tenantStatus).toBe("applicant");
    expect(user.branch).toBe("guadalupe");
  });
});

describe("reconcileTenantUsersForScope", () => {
  beforeEach(() => {
    userFindById.mockReset();
    userFind.mockReset();
    roomFindById.mockReset();
    reservationFindOne.mockReset();
    reservationFindById.mockReset();
    setCustomUserClaims.mockReset();
  });

  test("downgrades stale tenant-role users with no qualifying stay", async () => {
    userFind.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: "user-1",
            role: "tenant",
            tenantStatus: "active",
            branch: "gil-puyat",
          },
        ]),
      }),
    });

    const user = createUser({ role: "tenant", tenantStatus: "active", branch: "gil-puyat" });
    userFindById.mockResolvedValue(user);
    mockNoFallbackReservations();

    await reconcileTenantUsersForScope({ branch: "gil-puyat" });

    expect(user.role).toBe("applicant");
    expect(user.tenantStatus).toBe("applicant");
    expect(user.branch).toBeNull();
  });
});
