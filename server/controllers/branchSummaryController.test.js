import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const createLeanQuery = (result) => ({
  select: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(result),
  }),
});

const models = {
  Room: { find: jest.fn() },
  User: { find: jest.fn() },
  Reservation: { find: jest.fn() },
  Bill: { find: jest.fn() },
  MaintenanceRequest: { find: jest.fn() },
  Inquiry: { find: jest.fn() },
};

const sendSuccess = jest.fn();

await jest.unstable_mockModule("../models/index.js", () => models);
await jest.unstable_mockModule("../middleware/errorHandler.js", () => ({
  sendSuccess,
}));

const { getOwnerBranchSummaries } = await import("./branchSummaryController.js");

describe("branchSummaryController", () => {
  beforeEach(() => {
    models.Room.find.mockReset();
    models.User.find.mockReset();
    models.Reservation.find.mockReset();
    models.Bill.find.mockReset();
    models.MaintenanceRequest.find.mockReset();
    models.Inquiry.find.mockReset();
    sendSuccess.mockReset();
  });

  test("builds complete owner branch summaries without pagination fallbacks", async () => {
    models.Room.find.mockReturnValue(
      createLeanQuery([
        {
          _id: "room-gp-1",
          branch: "gil-puyat",
          capacity: 10,
          currentOccupancy: 9,
        },
        {
          _id: "room-gg-1",
          branch: "guadalupe",
          capacity: 8,
          currentOccupancy: 3,
        },
      ]),
    );
    models.User.find.mockReturnValue(
      createLeanQuery([
        {
          _id: "admin-1",
          branch: "gil-puyat",
          firstName: "Ava",
          lastName: "Cruz",
          email: "ava@example.com",
        },
      ]),
    );
    models.Reservation.find
      .mockReturnValueOnce(
        createLeanQuery([
          { userId: "tenant-1", roomId: "room-gp-1" },
          { userId: "tenant-2", roomId: "room-gp-1" },
          { userId: "tenant-3", roomId: "room-gg-1" },
          { userId: "tenant-3", roomId: "room-gg-1" },
        ]),
      )
      .mockReturnValueOnce(
        createLeanQuery([
          { roomId: "room-gp-1" },
          { roomId: "room-gp-1" },
          { roomId: "room-gg-1" },
        ]),
      );
    models.Bill.find.mockReturnValue(
      createLeanQuery([
        { branch: "gil-puyat" },
        { branch: "guadalupe" },
      ]),
    );
    models.MaintenanceRequest.find.mockReturnValue(
      createLeanQuery([
        { branch: "gil-puyat" },
        { branch: "gil-puyat" },
        { branch: "guadalupe" },
      ]),
    );
    models.Inquiry.find.mockReturnValue(
      createLeanQuery([
        { branch: "gil-puyat" },
        { branch: "gil-puyat" },
        { branch: "gil-puyat" },
      ]),
    );

    const next = jest.fn();
    await getOwnerBranchSummaries({}, {}, next);

    expect(sendSuccess).toHaveBeenCalledTimes(1);
    const payload = sendSuccess.mock.calls[0][1];
    expect(payload.branches).toEqual([
      expect.objectContaining({
        branch: "gil-puyat",
        totalRooms: 1,
        tenantCount: 2,
        assignedAdminCount: 1,
        overdueBillingCount: 1,
        openMaintenanceCount: 2,
        pendingReservationsCount: 2,
        pendingInquiriesCount: 3,
        unresolvedWorkloadCount: 7,
        occupancy: expect.objectContaining({
          occupiedBeds: 9,
          totalBeds: 10,
          availableBeds: 1,
          rate: 90,
        }),
        warningStates: {
          noAssignedAdmin: false,
          highOccupancyPressure: true,
          elevatedUnresolvedWorkload: false,
        },
      }),
      expect.objectContaining({
        branch: "guadalupe",
        totalRooms: 1,
        tenantCount: 1,
        assignedAdminCount: 0,
        overdueBillingCount: 1,
        openMaintenanceCount: 1,
        pendingReservationsCount: 1,
        pendingInquiriesCount: 0,
        unresolvedWorkloadCount: 2,
        occupancy: expect.objectContaining({
          occupiedBeds: 3,
          totalBeds: 8,
          availableBeds: 5,
          rate: 37.5,
        }),
        warningStates: {
          noAssignedAdmin: true,
          highOccupancyPressure: false,
          elevatedUnresolvedWorkload: false,
        },
      }),
    ]);
    expect(next).not.toHaveBeenCalled();
  });
});
