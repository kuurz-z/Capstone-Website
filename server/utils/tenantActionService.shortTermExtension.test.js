import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, test, jest } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const pushMock = jest.fn().mockResolvedValue({ sent: 1 });
await jest.unstable_mockModule("../services/notifications/mobilePushService.js", () => ({
  sendMobilePushToRecipients: pushMock,
  sendMobilePushBill: jest.fn(),
  sendMobilePushAnnouncement: jest.fn(),
}));

const { renewStayWorkflow } = await import("./tenantActionService.js");
const { Reservation, Room, Stay, User, Contract, BusinessSettings } = await import("../models/index.js");
const { generateContractNumber } = await import("../services/contractService.js");
const { toManilaStartOfDay } = await import("./dateUtils.js");

jest.setTimeout(120_000);

describe("Short-Term Lease Extension Limits & Contract Visibility", () => {
  let mongo;
  let admin;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "short_term_extension_test" });
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  }, 120_000);

  beforeEach(async () => {
    for (const c of Object.values(mongoose.connection.collections)) {
      await c.deleteMany({});
    }
    await BusinessSettings.create({ key: "global", longTermLeaseMinMonths: 6 });
    admin = await User.create({
      firebaseUid: `admin-${new mongoose.Types.ObjectId()}`,
      email: "admin@lilycrest.test",
      username: "admin_test",
      firstName: "Admin",
      lastName: "User",
      role: "owner",
      accountStatus: "active",
    });
  });

  async function seedTenancy({ roomType = "quadruple-sharing", durationMonths = 3, startDateStr = "2026-01-01" }) {
    const tenant = await User.create({
      firebaseUid: `firebase-${new mongoose.Types.ObjectId()}`,
      email: `tenant-${new mongoose.Types.ObjectId()}@example.test`,
      username: `tenant_${new mongoose.Types.ObjectId().toString().slice(-8)}`,
      firstName: "Sample",
      lastName: "Tenant",
      role: "tenant",
      tenantStatus: "active",
    });

    const room = await Room.create({
      name: "Room 101",
      roomNumber: `101-${Date.now().toString().slice(-4)}`,
      branch: "gil-puyat",
      type: roomType,
      capacity: 4,
      price: 6300,
      monthlyPrice: 6300,
      beds: [{ id: "bed-1", position: "upper", status: "occupied" }],
    });

    const start = toManilaStartOfDay(startDateStr).toDate();
    const end = toManilaStartOfDay(startDateStr).add(durationMonths, "month").subtract(1, "millisecond").toDate();

    const reservation = await Reservation.create({
      userId: tenant._id,
      roomId: room._id,
      status: "moveIn",
      leaseDuration: durationMonths,
      leaseDurationMonths: durationMonths,
      monthlyRent: 6300,
      totalPrice: 6300,
      reservationFeeAmount: 2000,
      paymentStatus: "paid",
      preferredRoomType: roomType,
      agreedToPrivacy: true,
      agreedToCertification: true,
      moveInDate: start,
      selectedBed: { id: "bed-1" },
    });

    const stay = await Stay.create({
      tenantId: tenant._id,
      reservationId: reservation._id,
      branch: room.branch,
      roomId: room._id,
      bedId: "bed-1",
      leaseStartDate: start,
      leaseEndDate: end,
      leaseDurationMonths: durationMonths,
      monthlyRent: 6300,
      status: "active",
    });

    reservation.currentStayId = stay._id;
    await reservation.save();

    const contractNumber = await generateContractNumber(room.branch, new Date());
    const oldContract = await Contract.create({
      ...contractNumber,
      tenantId: tenant._id,
      reservationId: reservation._id,
      applicationId: reservation._id,
      stayId: stay._id,
      roomId: room._id,
      branch: room.branch,
      roomNumber: room.roomNumber,
      roomType,
      bedId: "bed-1",
      leaseType: durationMonths < 6 ? "short_term" : "long_term",
      leaseStartDate: start,
      leaseEndDate: end,
      leaseDurationMonths: durationMonths,
      propertyName: "Lilycrest Dorm",
      propertyAddress: "Gil Puyat Avenue, Makati",
      tenantLegalName: "Sample Tenant",
      tenantAddress: "123 Manila St",
      tenantNationality: "Filipino",
      tenantBirthDate: new Date("1998-05-12"),
      approvedMonthlyRate: 6300,
      securityDepositAmount: 6300,
      status: "active",
      isCurrent: true,
      tenantVisible: true,
      createdBy: tenant._id,
      updatedBy: tenant._id,
    });

    return { tenant, room, reservation, stay, oldContract, start, end };
  }

  test("a) Short-term lease (<6m) rejecting an extension > 5 months (SHORT_TERM_LIMIT_EXCEEDED)", async () => {
    const { reservation, end } = await seedTenancy({ durationMonths: 3, startDateStr: "2026-01-01" });
    const newStart = toManilaStartOfDay(end).add(1, "day");
    const newEnd = newStart.add(6, "month").subtract(1, "millisecond");

    await expect(
      renewStayWorkflow({
        reservationId: reservation._id,
        payload: {
          confirm: true,
          newLeaseStartDate: newStart.format("YYYY-MM-DD"),
          newLeaseEndDate: newEnd.format("YYYY-MM-DD"),
          leaseDurationMonths: 6,
          monthlyRent: 6300,
        },
        actorId: admin._id,
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "SHORT_TERM_LIMIT_EXCEEDED",
      message: "Short-term stays can only be extended up to 5 months. To transition to a long-term stay (6–12 months), the tenant must complete move-out and submit a new long-term reservation.",
    });
  });

  test("b) Short-term lease (<6m) accepting an extension <= 5 months and generating a successor contract with tenantVisible: true", async () => {
    const { reservation, oldContract, end } = await seedTenancy({ durationMonths: 3, startDateStr: "2026-01-01" });
    const newStart = toManilaStartOfDay(end).add(1, "day");
    const newEnd = newStart.add(3, "month").subtract(1, "millisecond");

    const result = await renewStayWorkflow({
      reservationId: reservation._id,
      payload: {
        confirm: true,
        newLeaseStartDate: newStart.format("YYYY-MM-DD"),
        newLeaseEndDate: newEnd.format("YYYY-MM-DD"),
        leaseDurationMonths: 3,
        monthlyRent: 6300,
      },
      actorId: admin._id,
    });

    expect(result).toBeDefined();
    expect(result.stay.status).toBe("upcoming");
    expect(result.stay.leaseDurationMonths).toBe(3);

    const successorContract = await Contract.findOne({
      replacesContractId: oldContract._id,
      contractPurpose: "renewal",
    });

    expect(successorContract).toBeDefined();
    expect(successorContract.tenantVisible).toBe(true);
    expect(successorContract.leaseDurationMonths).toBe(3);
    expect(successorContract.replacesContractId.toString()).toBe(oldContract._id.toString());
  });

  test("c) Long-term lease (>=6m) accepting standard renewal durations (e.g. 6m, 12m)", async () => {
    const { reservation, oldContract, end } = await seedTenancy({ durationMonths: 6, startDateStr: "2026-01-01" });
    const newStart = toManilaStartOfDay(end).add(1, "day");
    const newEnd = newStart.add(6, "month").subtract(1, "millisecond");

    const result = await renewStayWorkflow({
      reservationId: reservation._id,
      payload: {
        confirm: true,
        newLeaseStartDate: newStart.format("YYYY-MM-DD"),
        newLeaseEndDate: newEnd.format("YYYY-MM-DD"),
        leaseDurationMonths: 6,
        monthlyRent: 6300,
      },
      actorId: admin._id,
    });

    expect(result).toBeDefined();
    expect(result.stay.status).toBe("upcoming");
    expect(result.stay.leaseDurationMonths).toBe(6);

    const successorContract = await Contract.findOne({
      replacesContractId: oldContract._id,
      contractPurpose: "renewal",
    });

    expect(successorContract).toBeDefined();
    expect(successorContract.tenantVisible).toBe(true);
    expect(successorContract.leaseDurationMonths).toBe(6);
  });
});
