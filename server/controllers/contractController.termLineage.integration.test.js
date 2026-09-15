import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

jest.setTimeout(120_000);

await jest.unstable_mockModule("../middleware/logger.js", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { Contract, Reservation, Stay, User, Room } = await import("../models/index.js");
const { getMyCurrentContract, getMyContractHistory } = await import("./contractController.js");

const TENANT_UID = "tenant-fb-uid-lineage";

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: "contract_lineage_test" });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

beforeEach(async () => {
  await Promise.all([
    Contract.deleteMany({}),
    Reservation.deleteMany({}),
    Stay.deleteMany({}),
    User.deleteMany({}),
    Room.deleteMany({}),
  ]);
});

const res = () => ({
  statusCode: 200,
  body: null,
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
});

describe("contractController - upcoming renewal contract & term lineage", () => {
  test("getMyCurrentContract returns upcoming renewal contract with acknowledgement and term lineage", async () => {
    const tenant = await User.create({
      firebaseUid: TENANT_UID,
      email: "tenant@lilycrest.test",
      username: "tenant_lineage",
      firstName: "Jane",
      lastName: "Doe",
      role: "tenant",
      tenantStatus: "active",
    });

    const room = await Room.create({
      name: "GP-201",
      roomNumber: "201",
      branch: "gil-puyat",
      type: "quadruple-sharing",
      capacity: 4,
      price: 6300,
    });

    const reservation = await Reservation.create({
      userId: tenant._id,
      roomId: room._id,
      status: "moveIn",
      leaseDuration: 6,
      reservationFeeAmount: 2000,
      agreedToPrivacy: true,
      agreedToCertification: true,
      totalPrice: 6300,
      monthlyRent: 6300,
      moveInDate: new Date("2026-01-01"),
    });

    const activeStay = await Stay.create({
      tenantId: tenant._id,
      reservationId: reservation._id,
      roomId: room._id,
      bedId: "bed-1",
      branch: "gil-puyat",
      status: "active",
      leaseStartDate: new Date("2026-01-01"),
      leaseEndDate: new Date("2026-07-01"),
      leaseDurationMonths: 6,
      monthlyRent: 6300,
    });

    const currentContractId = new mongoose.Types.ObjectId();
    const upcomingContractId = new mongoose.Types.ObjectId();

    await Contract.create({
      _id: currentContractId,
      contractNumber: "LIL-GP-2026-00001",
      contractYear: 2026,
      contractSequence: 1,
      contractPurpose: "initial",
      tenantId: tenant._id,
      reservationId: reservation._id,
      stayId: activeStay._id,
      roomId: room._id,
      branch: "gil-puyat",
      propertyName: "Lilycrest Dormitory",
      propertyAddress: "123 Gil Puyat Ave",
      roomNumber: "201",
      roomType: "quadruple-sharing",
      leaseType: "short_term",
      status: "active",
      isCurrent: true,
      tenantVisible: true,
      publicationStatus: "published",
      leaseStartDate: new Date("2026-01-01"),
      leaseEndDate: new Date("2026-07-01"),
      leaseDurationMonths: 6,
      approvedMonthlyRate: 6300,
      advanceRentAmount: 6300,
      securityDepositAmount: 6300,
      createdBy: tenant._id,
      updatedBy: tenant._id,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    await Contract.create({
      _id: upcomingContractId,
      contractNumber: "LIL-GP-2026-00002",
      contractYear: 2026,
      contractSequence: 2,
      contractPurpose: "renewal",
      replacesContractId: currentContractId,
      tenantId: tenant._id,
      reservationId: reservation._id,
      roomId: room._id,
      branch: "gil-puyat",
      propertyName: "Lilycrest Dormitory",
      propertyAddress: "123 Gil Puyat Ave",
      roomNumber: "201",
      roomType: "quadruple-sharing",
      leaseType: "short_term",
      status: "generated",
      isCurrent: false,
      tenantVisible: true,
      publicationStatus: "ready_for_resident",
      leaseStartDate: new Date("2026-07-02"),
      leaseEndDate: new Date("2026-10-02"),
      leaseDurationMonths: 3,
      approvedMonthlyRate: 6300,
      advanceRentAmount: 6300,
      securityDepositAmount: 6300,
      createdBy: tenant._id,
      updatedBy: tenant._id,
      createdAt: new Date("2026-06-15T00:00:00.000Z"),
    });

    const r = res();
    await getMyCurrentContract(
      { user: { uid: TENANT_UID }, id: "req-1" },
      r,
    );

    expect(r.statusCode).toBe(200);
    expect(r.body.contractAvailable).toBe(true);

    // Current Contract View
    expect(r.body.contract).toBeTruthy();
    expect(r.body.contract.id).toBe(String(currentContractId));
    expect(r.body.contract.termNumber).toBe(1);
    expect(r.body.contract.termLabel).toBe("Term #1: Initial Stay");
    expect(r.body.contract.isShortTerm).toBe(false);

    // Upcoming Contract View
    expect(r.body.upcoming).toBeTruthy();
    expect(r.body.upcoming.id).toBe(String(upcomingContractId));
    expect(r.body.upcoming.termNumber).toBe(2);
    expect(r.body.upcoming.termLabel).toBe("Term #2: Stay Extension");
    expect(r.body.upcoming.isShortTerm).toBe(true);
    expect(r.body.upcoming.leaseDurationMonths).toBe(3);
    expect(r.body.upcoming.tenantDocument).toBeTruthy();
    expect(r.body.upcoming.acknowledgement).toBeTruthy();
  });

  test("getMyContractHistory returns chronological term lineage with term labels and duration flags", async () => {
    const tenant = await User.create({
      firebaseUid: TENANT_UID,
      email: "tenant2@lilycrest.test",
      username: "tenant_lineage2",
      firstName: "John",
      lastName: "Smith",
      role: "tenant",
      tenantStatus: "active",
    });

    const room = await Room.create({
      name: "GP-202",
      roomNumber: "202",
      branch: "gil-puyat",
      type: "quadruple-sharing",
      capacity: 4,
      price: 6300,
    });

    const reservation = await Reservation.create({
      userId: tenant._id,
      roomId: room._id,
      status: "moveIn",
      leaseDuration: 12,
      reservationFeeAmount: 2000,
      agreedToPrivacy: true,
      agreedToCertification: true,
      totalPrice: 6300,
      monthlyRent: 6300,
      moveInDate: new Date("2025-01-01"),
    });

    // Contract 1: Term 1 (expired initial lease, 6 months)
    const c1 = await Contract.create({
      contractNumber: "LIL-GP-2025-00010",
      contractYear: 2025,
      contractSequence: 10,
      contractPurpose: "initial",
      tenantId: tenant._id,
      reservationId: reservation._id,
      roomId: room._id,
      branch: "gil-puyat",
      propertyName: "Lilycrest Dormitory",
      propertyAddress: "123 Gil Puyat Ave",
      roomNumber: "202",
      roomType: "quadruple-sharing",
      leaseType: "short_term",
      status: "expired",
      isCurrent: false,
      tenantVisible: true,
      publicationStatus: "published",
      leaseStartDate: new Date("2025-01-01"),
      leaseEndDate: new Date("2025-07-01"),
      leaseDurationMonths: 6,
      approvedMonthlyRate: 6300,
      createdBy: tenant._id,
      updatedBy: tenant._id,
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
    });

    // Contract 2: Term 2 (renewed stay extension, 3 months)
    const c2 = await Contract.create({
      contractNumber: "LIL-GP-2025-00020",
      contractYear: 2025,
      contractSequence: 20,
      contractPurpose: "renewal",
      replacesContractId: c1._id,
      tenantId: tenant._id,
      reservationId: reservation._id,
      roomId: room._id,
      branch: "gil-puyat",
      propertyName: "Lilycrest Dormitory",
      propertyAddress: "123 Gil Puyat Ave",
      roomNumber: "202",
      roomType: "quadruple-sharing",
      leaseType: "short_term",
      status: "renewed",
      isCurrent: false,
      tenantVisible: true,
      publicationStatus: "published",
      leaseStartDate: new Date("2025-07-02"),
      leaseEndDate: new Date("2025-10-02"),
      leaseDurationMonths: 3,
      approvedMonthlyRate: 6300,
      createdBy: tenant._id,
      updatedBy: tenant._id,
      createdAt: new Date("2025-06-15T00:00:00.000Z"),
    });

    // Contract 3: Term 3 (active current contract, 3 months)
    const c3 = await Contract.create({
      contractNumber: "LIL-GP-2025-00030",
      contractYear: 2025,
      contractSequence: 30,
      contractPurpose: "renewal",
      replacesContractId: c2._id,
      tenantId: tenant._id,
      reservationId: reservation._id,
      roomId: room._id,
      branch: "gil-puyat",
      propertyName: "Lilycrest Dormitory",
      propertyAddress: "123 Gil Puyat Ave",
      roomNumber: "202",
      roomType: "quadruple-sharing",
      leaseType: "short_term",
      status: "active",
      isCurrent: true,
      tenantVisible: true,
      publicationStatus: "published",
      leaseStartDate: new Date("2025-10-03"),
      leaseEndDate: new Date("2026-01-03"),
      leaseDurationMonths: 3,
      approvedMonthlyRate: 6300,
      createdBy: tenant._id,
      updatedBy: tenant._id,
      createdAt: new Date("2025-09-15T00:00:00.000Z"),
    });

    await Stay.create({
      tenantId: tenant._id,
      reservationId: reservation._id,
      roomId: room._id,
      bedId: "bed-1",
      branch: "gil-puyat",
      status: "active",
      leaseStartDate: new Date("2025-10-03"),
      leaseEndDate: new Date("2026-01-03"),
      leaseDurationMonths: 3,
      monthlyRent: 6300,
    });

    const r = res();
    await getMyContractHistory(
      { user: { uid: TENANT_UID }, id: "req-2" },
      r,
    );

    expect(r.statusCode).toBe(200);
    expect(r.body.contracts).toHaveLength(2);

    const term1 = r.body.contracts.find((c) => String(c.id) === String(c1._id));
    expect(term1).toBeTruthy();
    expect(term1.termNumber).toBe(1);
    expect(term1.termLabel).toBe("Term #1: Initial Stay");
    expect(term1.isShortTerm).toBe(false);
    expect(term1.leaseDurationMonths).toBe(6);

    const term2 = r.body.contracts.find((c) => String(c.id) === String(c2._id));
    expect(term2).toBeTruthy();
    expect(term2.termNumber).toBe(2);
    expect(term2.termLabel).toBe("Term #2: Stay Extension");
    expect(term2.isShortTerm).toBe(true);
    expect(term2.leaseDurationMonths).toBe(3);
  });
});
