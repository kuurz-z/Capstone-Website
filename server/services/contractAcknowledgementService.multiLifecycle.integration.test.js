/**
 * Multi-Lifecycle Contract Acknowledgement Integration Test Suite
 *
 * Validates the complete round-trip lifecycle of contract acknowledgements:
 * 1. Initial Booking (Lifecycle 1 - Term 1) -> generated draft contract -> acknowledgement required (not yet acknowledged).
 * 2. Tenant acknowledges draft contract -> acknowledgement recorded.
 * 3. Stay Extension via renewStayWorkflow (Lifecycle 1 - Term 2) -> creates upcoming Stay & renewal Contract ->
 *    upcoming contract requires its own distinct acknowledgement -> tenant acknowledges renewal contract.
 * 4. Tenant moves out via moveOutStayWorkflow -> upcoming renewal contract and stay are cancelled -> lifecycle 1 closes.
 * 5. Re-booking (Lifecycle 2) on the same user account -> creates new Reservation & Contract ->
 *    canonical contract resolves to the new contract -> term lineage resets to Term #1: Initial Stay ->
 *    acknowledgement for new contract is required and unacknowledged (does NOT inherit previous lifecycle's acknowledgement) ->
 *    tenant acknowledges new contract successfully.
 */

import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

// Mock audit logger
await jest.unstable_mockModule("./audit/auditLogger.js", () => ({
  default: { log: jest.fn().mockResolvedValue(undefined) },
}));

// Mock mobile push service
await jest.unstable_mockModule("./notifications/mobilePushService.js", () => ({
  sendMobilePushToRecipients: jest.fn().mockResolvedValue({ sent: 1 }),
  sendMobilePushBill: jest.fn(),
  sendMobilePushAnnouncement: jest.fn(),
}));

// Mock prepared contract PDF generation for fast, deterministic integration runs
const mockGenerate = jest.fn(async ({ contractId, actorId, session = null }) => {
  const { Contract } = await import("../models/index.js");
  const { transitionContract } = await import("./contractService.js");
  const contract = await Contract.findById(contractId).session(session);
  if (!contract) return null;
  contract.preparedDocuments = contract.preparedDocuments || [];
  const nextVersion = (contract.preparedDocuments.length || 0) + 1;
  contract.preparedDocuments.push({
    documentType: "prepared",
    version: nextVersion,
    storageProvider: "local",
    storageKey: `gil-puyat/2026/prepared_${contract._id}_v${nextVersion}.pdf`,
    fileName: `prepared_${contract._id}_v${nextVersion}.pdf`,
    fileHash: `hash-${contract._id}-v${nextVersion}`,
    fileSize: 2048,
    pageCount: 4,
    templateId: "official-v1",
    templateVersion: "1.0.0",
    coordinateVersion: "1.0.0",
    generatedAt: new Date(),
    generatedBy: actorId,
    superseded: false,
  });
  contract.generatedFileHash = `hash-${contract._id}-v${nextVersion}`;
  contract.generatedVersion = nextVersion;
  contract.publicationStatus = "ready_for_resident";
  contract.tenantVisible = true;
  if (contract.status === "ready_for_generation") {
    await transitionContract(contract, "generated", actorId, "prepared (test)", session);
  } else {
    await contract.save(session ? { session } : undefined);
  }
  return {
    contract,
    document: contract.preparedDocuments.at(-1),
    previousStatus: "ready_for_generation",
    isRegeneration: false,
  };
});

await jest.unstable_mockModule("./contractPdfService.js", () => ({
  generatePreparedContractPdf: mockGenerate,
  renderPreparedContractPdf: jest.fn(),
}));

const {
  acknowledgeContract,
  getAcknowledgementStatus,
  getAcknowledgementStatusForContract,
} = await import("./contractAcknowledgementService.js");

const {
  resolveTenantCanonicalContract,
  resolveTenantUpcomingContract,
  attachContractLineage,
} = await import("./tenantContractSelectionService.js");

const { generateContractNumber } = await import("./contractService.js");
const { renewStayWorkflow, moveOutStayWorkflow } = await import("../utils/tenantActionService.js");
const { createOpenUtilityPeriodWithBoundary } = await import("./billing/utilityPeriodLifecycleService.js");

const {
  BedHistory,
  Bill,
  BusinessSettings,
  Contract,
  ContractAcknowledgement,
  Reservation,
  Room,
  Stay,
  User,
  UtilityPeriod,
  UtilityReading,
} = await import("../models/index.js");

jest.setTimeout(180_000);

describe("Contract Acknowledgement Multi-Lifecycle Integration Suite", () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "contract_ack_multi_lifecycle" });
    await Promise.all([
      ContractAcknowledgement.syncIndexes(),
      UtilityPeriod.syncIndexes(),
    ]);
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  }, 120_000);

  beforeEach(async () => {
    jest.clearAllMocks();
    await Promise.all([
      BedHistory.deleteMany({}),
      Bill.deleteMany({}),
      BusinessSettings.deleteMany({}),
      Contract.deleteMany({}),
      ContractAcknowledgement.deleteMany({}),
      Reservation.deleteMany({}),
      Room.deleteMany({}),
      Stay.deleteMany({}),
      User.deleteMany({}),
      UtilityPeriod.deleteMany({}),
      UtilityReading.deleteMany({}),
    ]);

    await BusinessSettings.create({
      key: "global",
      officeHoursStartMinutes: 0,
      officeHoursEndMinutes: 1440,
      officeDaysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      longTermLeaseMinMonths: 6,
      isDiscountEnabled: true,
      privateDiscountPercent: 10,
      doubleDiscountPercent: 10,
      quadrupleDiscountPercent: 10,
    });
  });

  const fakeReq = () => ({
    ip: "127.0.0.1",
    get: (header) => (header === "user-agent" ? "jest-multi-lifecycle-agent" : ""),
  });

  const minimalPreparedDocument = (actorId, contractId, version = 1) => ({
    documentType: "prepared",
    version,
    storageProvider: "local",
    storageKey: `gil-puyat/2026/prepared_${contractId}_v${version}.pdf`,
    fileName: `prepared_${contractId}_v${version}.pdf`,
    fileHash: `hash-${contractId}-v${version}`,
    fileSize: 2048,
    pageCount: 4,
    generatedAt: new Date(),
    generatedBy: actorId,
    templateId: "official-v1",
    templateVersion: "1.0.0",
    coordinateVersion: "1.0.0",
    superseded: false,
  });

  test("full multi-lifecycle round-trip: Initial Booking -> Acknowledgement -> Renewal Extension -> Renewal Acknowledgement -> Move-out -> Re-booking -> Fresh Term #1 Acknowledgement", async () => {
    const actorId = new mongoose.Types.ObjectId();

    // 1. Create Admin & Tenant User
    const admin = await User.create({
      _id: actorId,
      firebaseUid: `admin-fb-${new mongoose.Types.ObjectId()}`,
      email: "admin@lilycrest.test",
      username: "admin_lifecycle",
      firstName: "Admin",
      lastName: "Officer",
      role: "owner",
      accountStatus: "active",
      branch: "gil-puyat",
    });

    const tenant = await User.create({
      firebaseUid: `tenant-fb-${new mongoose.Types.ObjectId()}`,
      email: "tenant.multilife@lilycrest.test",
      username: "tenant_multilife",
      firstName: "Alex",
      lastName: "Rivera",
      role: "tenant",
      tenantStatus: "active",
      branch: "gil-puyat",
    });

    // 2. Create Room 1
    const room1 = await Room.create({
      name: "Room 301",
      roomNumber: "301",
      branch: "gil-puyat",
      type: "quadruple-sharing",
      capacity: 4,
      currentOccupancy: 1,
      price: 6300,
      monthlyPrice: 6300,
      beds: [
        { id: "bed-1", position: "lower", status: "occupied", occupiedBy: { userId: tenant._id } },
        { id: "bed-2", position: "upper", status: "available" },
        { id: "bed-3", position: "lower", status: "available" },
        { id: "bed-4", position: "upper", status: "available" },
      ],
    });

    const lease1Start = new Date("2026-01-01T00:00:00.000Z");
    const lease1End = new Date("2026-07-01T00:00:00.000Z");

    await createOpenUtilityPeriodWithBoundary({
      utilityType: "electricity",
      room: room1,
      startDate: lease1Start,
      startReading: 1000,
      ratePerUnit: 16,
      actorId: admin._id,
    });

    // ── STEP A: Initial Reservation Booking (Lifecycle 1 - Term 1) ──────────────
    const reservation1 = await Reservation.create({
      userId: tenant._id,
      roomId: room1._id,
      status: "moveIn",
      paymentStatus: "paid",
      applicationReviewedAt: new Date("2025-12-15T00:00:00.000Z"),
      applicationReviewedBy: admin._id,
      approvedForPaymentAt: new Date("2025-12-15T00:00:00.000Z"),
      leaseDuration: 6,
      leaseDurationMonths: 6,
      reservationFeeAmount: 2000,
      preferredRoomType: "quadruple-sharing",
      agreedToPrivacy: true,
      agreedToCertification: true,
      totalPrice: 6300,
      monthlyRent: 6300,
      securityDepositHeld: 6300,
      moveInDate: lease1Start,
      selectedBed: { id: "bed-1", position: "lower" },
    });

    room1.beds[0].occupiedBy.reservationId = reservation1._id;
    await room1.save();

    const stay1 = await Stay.create({
      tenantId: tenant._id,
      reservationId: reservation1._id,
      branch: room1.branch,
      roomId: room1._id,
      bedId: "bed-1",
      leaseStartDate: lease1Start,
      leaseEndDate: lease1End,
      leaseDurationMonths: 6,
      monthlyRent: 6300,
      status: "active",
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    reservation1.currentStayId = stay1._id;
    await reservation1.save();

    await BedHistory.create({
      tenantId: tenant._id,
      reservationId: reservation1._id,
      branch: room1.branch,
      roomId: room1._id,
      bedId: "bed-1",
      stayId: stay1._id,
      moveInDate: lease1Start,
      status: "active",
    });

    const c1Number = await generateContractNumber(room1.branch, lease1Start);
    const contract1Id = new mongoose.Types.ObjectId();
    const contract1 = await Contract.create({
      _id: contract1Id,
      ...c1Number,
      contractPurpose: "initial",
      tenantId: tenant._id,
      applicationId: reservation1._id,
      reservationId: reservation1._id,
      stayId: stay1._id,
      roomId: room1._id,
      branch: room1.branch,
      propertyName: "Lilycrest Dormitory",
      propertyAddress: "123 Gil Puyat Ave",
      roomNumber: room1.roomNumber,
      roomType: room1.type,
      bedId: "bed-1",
      tenantLegalName: "Alex Rivera",
      tenantAddress: "123 Test St, Makati",
      tenantNationality: "Filipino",
      tenantBirthDate: new Date("1998-05-10"),
      leaseType: "long_term",
      leaseStartDate: lease1Start,
      leaseEndDate: lease1End,
      leaseDurationMonths: 6,
      approvedMonthlyRate: 6300,
      securityDepositAmount: 6300,
      status: "generated",
      isCurrent: true,
      tenantVisible: true,
      publicationStatus: "ready_for_resident",
      preparedDocuments: [minimalPreparedDocument(admin._id, contract1Id, 1)],
      statusHistory: [{ status: "generated", changedBy: admin._id, reason: "initial booking draft" }],
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    // Verification: Initial draft requires acknowledgement and is NOT acknowledged
    const initialAckStatus = await getAcknowledgementStatusForContract(contract1, tenant._id);
    expect(initialAckStatus).toMatchObject({
      required: true,
      acknowledged: false,
      acknowledgedAt: null,
      documentKind: "draft",
      documentVersion: 1,
    });

    const canonicalL1 = await resolveTenantCanonicalContract(tenant._id);
    expect(String(canonicalL1._id)).toBe(String(contract1._id));

    const lineageL1 = attachContractLineage([contract1]);
    expect(lineageL1[0].termNumber).toBe(1);
    expect(lineageL1[0].termLabel).toBe("Term #1: Initial Stay");

    // ── STEP B: Tenant Acknowledges Draft Contract ───────────────────────────
    const ack1 = await acknowledgeContract({
      contractId: contract1._id,
      tenantId: tenant._id,
      req: fakeReq(),
    });
    expect(ack1.documentKind).toBe("draft");
    expect(ack1.documentVersion).toBe(1);

    const acknowledgedStatusL1 = await getAcknowledgementStatusForContract(contract1, tenant._id);
    expect(acknowledgedStatusL1).toMatchObject({
      required: true,
      acknowledged: true,
      documentKind: "draft",
      documentVersion: 1,
    });
    expect(acknowledgedStatusL1.acknowledgedAt).toBeTruthy();

    const ackCountStepB = await ContractAcknowledgement.countDocuments({ tenantId: tenant._id });
    expect(ackCountStepB).toBe(1);

    // ── STEP C: Tenant Extends Stay via renewStayWorkflow ────────────────────
    const renewalStart = new Date("2026-07-02T00:00:00.000Z");
    const renewalEnd = new Date("2027-01-01T00:00:00.000Z");

    const renewResult = await renewStayWorkflow({
      reservationId: reservation1._id,
      payload: {
        confirm: true,
        newLeaseStartDate: renewalStart.toISOString(),
        newLeaseEndDate: renewalEnd.toISOString(),
        monthlyRent: 6300,
        notes: "6 months extension",
      },
      actorId: admin._id,
    });

    expect(renewResult.stay).toBeTruthy();
    expect(renewResult.stay.status).toBe("upcoming");
    expect(String(renewResult.stay.previousStayId)).toBe(String(stay1._id));

    // Poll for the auto-generated renewal successor contract
    let renewalContract = null;
    for (let i = 0; i < 40 && !renewalContract; i++) {
      renewalContract = await Contract.findOne({
        reservationId: reservation1._id,
        contractPurpose: "renewal",
      });
      if (!renewalContract) await new Promise((r) => setTimeout(r, 50));
    }
    expect(renewalContract).toBeTruthy();
    expect(String(renewalContract.replacesContractId)).toBe(String(contract1._id));
    expect(renewalContract.contractPurpose).toBe("renewal");

    // Ensure renewal contract has prepared document
    if (!renewalContract.preparedDocuments || renewalContract.preparedDocuments.length === 0) {
      renewalContract.preparedDocuments = [minimalPreparedDocument(admin._id, renewalContract._id, 1)];
      renewalContract.status = "generated";
      renewalContract.tenantVisible = true;
      renewalContract.publicationStatus = "ready_for_resident";
      await renewalContract.save();
    }

    // Verify upcoming contract resolution
    const upcomingContract = await resolveTenantUpcomingContract(tenant._id);
    expect(upcomingContract).toBeTruthy();
    expect(String(upcomingContract._id)).toBe(String(renewalContract._id));

    // Canonical contract remains the current in-effect Contract 1
    const currentDuringRenewal = await resolveTenantCanonicalContract(tenant._id);
    expect(String(currentDuringRenewal._id)).toBe(String(contract1._id));

    // Lineage shows Term 1 and Term 2
    const lineageWithRenewal = attachContractLineage([contract1, renewalContract]);
    const term1Entry = lineageWithRenewal.find((c) => String(c._id) === String(contract1._id));
    const term2Entry = lineageWithRenewal.find((c) => String(c._id) === String(renewalContract._id));
    expect(term1Entry.termNumber).toBe(1);
    expect(term1Entry.termLabel).toBe("Term #1: Initial Stay");
    expect(term2Entry.termNumber).toBe(2);
    expect(term2Entry.termLabel).toBe("Term #2: Stay Extension");

    // Renewal contract requires its OWN acknowledgement (not yet acknowledged)
    const renewalAckStatusBefore = await getAcknowledgementStatusForContract(renewalContract, tenant._id);
    expect(renewalAckStatusBefore).toMatchObject({
      required: true,
      acknowledged: false,
      documentKind: "draft",
      documentVersion: 1,
    });

    // Tenant acknowledges upcoming renewal contract
    const ackRenewal = await acknowledgeContract({
      contractId: renewalContract._id,
      tenantId: tenant._id,
      req: fakeReq(),
    });
    expect(ackRenewal.documentKind).toBe("draft");
    expect(ackRenewal.documentVersion).toBe(1);

    const renewalAckStatusAfter = await getAcknowledgementStatusForContract(renewalContract, tenant._id);
    expect(renewalAckStatusAfter).toMatchObject({
      required: true,
      acknowledged: true,
      documentKind: "draft",
      documentVersion: 1,
    });

    const ackCountStepC = await ContractAcknowledgement.countDocuments({ tenantId: tenant._id });
    expect(ackCountStepC).toBe(2);

    // ── STEP D: Tenant Moves Out via moveOutStayWorkflow ─────────────────────
    await moveOutStayWorkflow({
      reservationId: reservation1._id,
      payload: {
        confirm: true,
        moveOutDate: "2026-07-01",
        finalUtilityReading: 1500,
        keyReturned: true,
        forceOverride: true,
      },
      actorId: admin._id,
    });

    // Verify Lifecycle 1 is closed
    const reloadedContract1 = await Contract.findById(contract1._id).lean();
    expect(reloadedContract1.status).toBe("expired");
    expect(reloadedContract1.isCurrent).toBe(false);

    const reloadedRenewalContract = await Contract.findById(renewalContract._id).lean();
    expect(reloadedRenewalContract.status).toBe("cancelled");
    expect(reloadedRenewalContract.isCurrent).toBe(false);

    const reloadedStay1 = await Stay.findById(stay1._id).lean();
    expect(["completed", "terminated"]).toContain(reloadedStay1.status);

    const reloadedUpcomingStay = await Stay.findById(renewResult.stay._id).lean();
    expect(reloadedUpcomingStay.status).toBe("cancelled");

    const reloadedRes1 = await Reservation.findById(reservation1._id).lean();
    expect(reloadedRes1.status).toBe("moveOut");

    // No canonical or upcoming contract is active for tenant after move out
    const canonicalAfterMoveOut = await resolveTenantCanonicalContract(tenant._id);
    expect(canonicalAfterMoveOut).toBeNull();
    const upcomingAfterMoveOut = await resolveTenantUpcomingContract(tenant._id);
    expect(upcomingAfterMoveOut).toBeNull();

    // ── STEP E: Re-booking (Lifecycle 2) on the Same User Account ─────────────
    // User re-activates tenancy with a new reservation in Room 2
    await User.updateOne({ _id: tenant._id }, { $set: { tenantStatus: "active" } });

    const room2 = await Room.create({
      name: "Room 402",
      roomNumber: "402",
      branch: "gil-puyat",
      type: "quadruple-sharing",
      capacity: 4,
      currentOccupancy: 1,
      price: 6300,
      monthlyPrice: 6300,
      beds: [
        { id: "bed-1", position: "lower", status: "occupied", occupiedBy: { userId: tenant._id } },
        { id: "bed-2", position: "upper", status: "available" },
      ],
    });

    const lease2Start = new Date("2027-02-01T00:00:00.000Z");
    const lease2End = new Date("2027-08-01T00:00:00.000Z");

    const reservation2 = await Reservation.create({
      userId: tenant._id,
      roomId: room2._id,
      status: "moveIn",
      paymentStatus: "paid",
      applicationReviewedAt: new Date("2027-01-15T00:00:00.000Z"),
      applicationReviewedBy: admin._id,
      approvedForPaymentAt: new Date("2027-01-15T00:00:00.000Z"),
      leaseDuration: 6,
      leaseDurationMonths: 6,
      reservationFeeAmount: 2000,
      preferredRoomType: "quadruple-sharing",
      agreedToPrivacy: true,
      agreedToCertification: true,
      totalPrice: 6300,
      monthlyRent: 6300,
      securityDepositHeld: 6300,
      moveInDate: lease2Start,
      selectedBed: { id: "bed-1", position: "lower" },
    });

    room2.beds[0].occupiedBy.reservationId = reservation2._id;
    await room2.save();

    const stay2 = await Stay.create({
      tenantId: tenant._id,
      reservationId: reservation2._id,
      branch: room2.branch,
      roomId: room2._id,
      bedId: "bed-1",
      leaseStartDate: lease2Start,
      leaseEndDate: lease2End,
      leaseDurationMonths: 6,
      monthlyRent: 6300,
      status: "active",
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    reservation2.currentStayId = stay2._id;
    await reservation2.save();

    await BedHistory.create({
      tenantId: tenant._id,
      reservationId: reservation2._id,
      branch: room2.branch,
      roomId: room2._id,
      bedId: "bed-1",
      stayId: stay2._id,
      moveInDate: lease2Start,
      status: "active",
    });

    const c2Number = await generateContractNumber(room2.branch, lease2Start);
    const contract2Id = new mongoose.Types.ObjectId();
    const contract2 = await Contract.create({
      _id: contract2Id,
      ...c2Number,
      contractPurpose: "initial",
      tenantId: tenant._id,
      applicationId: reservation2._id,
      reservationId: reservation2._id,
      stayId: stay2._id,
      roomId: room2._id,
      branch: room2.branch,
      propertyName: "Lilycrest Dormitory",
      propertyAddress: "123 Gil Puyat Ave",
      roomNumber: room2.roomNumber,
      roomType: room2.type,
      bedId: "bed-1",
      tenantLegalName: "Alex Rivera",
      tenantAddress: "123 Test St, Makati",
      tenantNationality: "Filipino",
      tenantBirthDate: new Date("1998-05-10"),
      leaseType: "long_term",
      leaseStartDate: lease2Start,
      leaseEndDate: lease2End,
      leaseDurationMonths: 6,
      approvedMonthlyRate: 6300,
      securityDepositAmount: 6300,
      status: "generated",
      isCurrent: true,
      tenantVisible: true,
      publicationStatus: "ready_for_resident",
      preparedDocuments: [minimalPreparedDocument(admin._id, contract2Id, 1)],
      statusHistory: [{ status: "generated", changedBy: admin._id, reason: "lifecycle 2 initial booking draft" }],
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    // Verify canonical contract becomes the new contract for Lifecycle 2
    const canonicalL2 = await resolveTenantCanonicalContract(tenant._id);
    expect(canonicalL2).toBeTruthy();
    expect(String(canonicalL2._id)).toBe(String(contract2._id));

    // Verify term lineage is Term #1: Initial Stay (independent lifecycle)
    const lineageL2 = attachContractLineage([contract1, renewalContract, contract2]);
    const contract2Lineage = lineageL2.find((c) => String(c._id) === String(contract2._id));
    expect(contract2Lineage).toBeTruthy();
    expect(contract2Lineage.termNumber).toBe(1);
    expect(contract2Lineage.termLabel).toBe("Term #1: Initial Stay");

    // Verify acknowledgement for new contract is required: true, acknowledged: false
    // (does NOT carry over previous lifecycle's acknowledgement)
    const ackStatusL2Before = await getAcknowledgementStatusForContract(contract2, tenant._id);
    expect(ackStatusL2Before).toMatchObject({
      required: true,
      acknowledged: false,
      acknowledgedAt: null,
      documentKind: "draft",
      documentVersion: 1,
    });

    // Tenant acknowledges new contract
    const ackL2 = await acknowledgeContract({
      contractId: contract2._id,
      tenantId: tenant._id,
      req: fakeReq(),
    });
    expect(ackL2.documentKind).toBe("draft");
    expect(ackL2.documentVersion).toBe(1);

    const ackStatusL2After = await getAcknowledgementStatusForContract(contract2, tenant._id);
    expect(ackStatusL2After).toMatchObject({
      required: true,
      acknowledged: true,
      documentKind: "draft",
      documentVersion: 1,
    });

    // Total distinct acknowledgement records = 3 across all lifecycles
    const finalAckCount = await ContractAcknowledgement.countDocuments({ tenantId: tenant._id });
    expect(finalAckCount).toBe(3);
  });

  test("solitary stay extension renewal contract acknowledgement is strictly isolated from current contract", async () => {
    const actorId = new mongoose.Types.ObjectId();

    const admin = await User.create({
      _id: actorId,
      firebaseUid: `admin-solo-${new mongoose.Types.ObjectId()}`,
      email: "admin.solo@lilycrest.test",
      username: "admin_solo",
      firstName: "Admin",
      lastName: "Solo",
      role: "owner",
      accountStatus: "active",
      branch: "gil-puyat",
    });

    const tenant = await User.create({
      firebaseUid: `tenant-solo-${new mongoose.Types.ObjectId()}`,
      email: "tenant.solo@lilycrest.test",
      username: "tenant_solo",
      firstName: "Jordan",
      lastName: "Cruz",
      role: "tenant",
      tenantStatus: "active",
      branch: "gil-puyat",
    });

    const room = await Room.create({
      name: "Room 302",
      roomNumber: "302",
      branch: "gil-puyat",
      type: "quadruple-sharing",
      capacity: 4,
      currentOccupancy: 1,
      price: 6300,
      monthlyPrice: 6300,
      beds: [
        { id: "bed-1", position: "lower", status: "occupied", occupiedBy: { userId: tenant._id } },
        { id: "bed-2", position: "upper", status: "available" },
      ],
    });

    const leaseStart = new Date("2026-03-01T00:00:00.000Z");
    const leaseEnd = new Date("2026-09-01T00:00:00.000Z");

    const reservation = await Reservation.create({
      userId: tenant._id,
      roomId: room._id,
      status: "moveIn",
      paymentStatus: "paid",
      applicationReviewedAt: new Date("2026-02-15T00:00:00.000Z"),
      applicationReviewedBy: admin._id,
      approvedForPaymentAt: new Date("2026-02-15T00:00:00.000Z"),
      leaseDuration: 6,
      leaseDurationMonths: 6,
      reservationFeeAmount: 2000,
      preferredRoomType: "quadruple-sharing",
      agreedToPrivacy: true,
      agreedToCertification: true,
      totalPrice: 6300,
      monthlyRent: 6300,
      securityDepositHeld: 6300,
      moveInDate: leaseStart,
      selectedBed: { id: "bed-1", position: "lower" },
    });

    room.beds[0].occupiedBy.reservationId = reservation._id;
    await room.save();

    const stay = await Stay.create({
      tenantId: tenant._id,
      reservationId: reservation._id,
      branch: room.branch,
      roomId: room._id,
      bedId: "bed-1",
      leaseStartDate: leaseStart,
      leaseEndDate: leaseEnd,
      leaseDurationMonths: 6,
      monthlyRent: 6300,
      status: "active",
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    reservation.currentStayId = stay._id;
    await reservation.save();

    const c1Number = await generateContractNumber(room.branch, leaseStart);
    const contract1Id = new mongoose.Types.ObjectId();
    const currentContract = await Contract.create({
      _id: contract1Id,
      ...c1Number,
      contractPurpose: "initial",
      tenantId: tenant._id,
      applicationId: reservation._id,
      reservationId: reservation._id,
      stayId: stay._id,
      roomId: room._id,
      branch: room.branch,
      propertyName: "Lilycrest Dormitory",
      propertyAddress: "123 Gil Puyat Ave",
      roomNumber: room.roomNumber,
      roomType: room.type,
      bedId: "bed-1",
      tenantLegalName: "Jordan Cruz",
      tenantAddress: "123 Ayala Ave, Makati",
      tenantNationality: "Filipino",
      tenantBirthDate: new Date("1996-03-20"),
      leaseType: "long_term",
      leaseStartDate: leaseStart,
      leaseEndDate: leaseEnd,
      leaseDurationMonths: 6,
      approvedMonthlyRate: 6300,
      securityDepositAmount: 6300,
      status: "generated",
      isCurrent: true,
      tenantVisible: true,
      publicationStatus: "ready_for_resident",
      preparedDocuments: [minimalPreparedDocument(admin._id, contract1Id, 1)],
      statusHistory: [{ status: "generated", changedBy: admin._id, reason: "initial booking draft" }],
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    // 1. Tenant acknowledges current contract
    await acknowledgeContract({ contractId: currentContract._id, tenantId: tenant._id, req: fakeReq() });
    const currentStatus = await getAcknowledgementStatusForContract(currentContract, tenant._id);
    expect(currentStatus.acknowledged).toBe(true);

    // 2. Perform renewal stay extension
    const extStart = new Date("2026-09-02T00:00:00.000Z");
    const extEnd = new Date("2027-03-01T00:00:00.000Z");

    const renewRes = await renewStayWorkflow({
      reservationId: reservation._id,
      payload: {
        confirm: true,
        newLeaseStartDate: extStart.toISOString(),
        newLeaseEndDate: extEnd.toISOString(),
        monthlyRent: 6300,
      },
      actorId: admin._id,
    });

    let renewalContract = null;
    for (let i = 0; i < 40 && !renewalContract; i++) {
      renewalContract = await Contract.findOne({
        reservationId: reservation._id,
        contractPurpose: "renewal",
      });
      if (!renewalContract) await new Promise((r) => setTimeout(r, 50));
    }
    expect(renewalContract).toBeTruthy();

    if (!renewalContract.preparedDocuments || renewalContract.preparedDocuments.length === 0) {
      renewalContract.preparedDocuments = [minimalPreparedDocument(admin._id, renewalContract._id, 1)];
      renewalContract.status = "generated";
      renewalContract.tenantVisible = true;
      renewalContract.publicationStatus = "ready_for_resident";
      await renewalContract.save();
    }

    // 3. Current contract remains acknowledged: true, renewal contract is acknowledged: false
    const currentCheck = await getAcknowledgementStatusForContract(currentContract, tenant._id);
    const renewalCheck = await getAcknowledgementStatusForContract(renewalContract, tenant._id);
    expect(currentCheck.acknowledged).toBe(true);
    expect(renewalCheck.acknowledged).toBe(false);

    // 4. Acknowledging renewal contract does not affect current contract
    await acknowledgeContract({ contractId: renewalContract._id, tenantId: tenant._id, req: fakeReq() });
    const renewalCheckAfter = await getAcknowledgementStatusForContract(renewalContract, tenant._id);
    expect(renewalCheckAfter.acknowledged).toBe(true);

    const currentCheckAfter = await getAcknowledgementStatusForContract(currentContract, tenant._id);
    expect(currentCheckAfter.acknowledged).toBe(true);

    // 5. Total acknowledgements recorded is exactly 2
    expect(await ContractAcknowledgement.countDocuments({ tenantId: tenant._id })).toBe(2);
  });
});

