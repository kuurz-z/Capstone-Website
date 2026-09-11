import { describe, test, expect, jest, beforeEach } from "@jest/globals";

const mockBusinessSettings = {
  key: "global",
  isDiscountEnabled: true,
  reservationFeeAmount: 3000,
  longTermLeaseMinMonths: 6,
  save: jest.fn().mockResolvedValue(true),
  branchOverrides: {},
};

await jest.unstable_mockModule("../../models/BusinessSettings.js", () => ({
  default: {
    findOne: jest.fn(() => ({
      lean: jest.fn().mockResolvedValue(mockBusinessSettings),
      then: (resolve) => Promise.resolve(mockBusinessSettings).then(resolve),
    })),
    create: jest.fn().mockResolvedValue(mockBusinessSettings),
  },
}));

const { Reservation, User } = await import("../../models/index.js");
const { getReservations } = await import("./reservationCrudController.js");

const mockDbUser = { _id: "user_123", role: "applicant" };

describe("getReservations archive isolation", () => {
  let findSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(User, "findOne").mockResolvedValue(mockDbUser);
    const mockQuery = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([]),
    };
    mockQuery.then = (resolve) => Promise.resolve([]).then(resolve);
    findSpy = jest.spyOn(Reservation, "find").mockReturnValue(mockQuery);
  });

  test("filters out archived reservations when no query params are provided", async () => {
    const req = { user: { uid: "firebase_user_1" }, query: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await getReservations(req, res);

    expect(findSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_123",
        isArchived: { $ne: true },
      })
    );
  });

  test("queries only archived reservations when archive=archived", async () => {
    const req = { user: { uid: "firebase_user_1" }, query: { archive: "archived" } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await getReservations(req, res);

    expect(findSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_123",
        isArchived: true,
      })
    );
  });

  test("includes archived reservations when includeArchived=true", async () => {
    const req = { user: { uid: "firebase_user_1" }, query: { includeArchived: "true" } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await getReservations(req, res);

    expect(findSpy).toHaveBeenCalledWith({
      userId: "user_123",
    });
  });
});
