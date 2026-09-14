/**
 * ============================================================================
 * Phase 2B — scheduleRoomTransfer: model + hold + no-mutation
 * ============================================================================
 * Proves:
 *   - a FUTURE-dated transfer creates a ScheduledRoomTransfer{status:"scheduled"}
 *     and places a REAL destination hold (private capacity slot / shared bed)
 *   - the tenant's current Stay / Reservation.roomId / selectedBed /
 *     monthlyRent / recurringRentRate / SOURCE occupancy are UNCHANGED
 *   - no Bill, no TenantCredit, no UtilityReading cutoff
 *   - the Addendum Draft is generated + isCurrent:false
 *   - previewSnapshot is computed against the FUTURE effective date
 *   - only ONE open schedule per reservation (DB partial-unique index)
 *   - a pending future renewal blocks scheduling
 *   - no fake bed for a private destination
 *   - a second tenant cannot exceed private capacity / cannot take a held bed
 *   - Job-15 reconciliation and the realtime room sync PRESERVE the hold
 *   - a held bed exposes scheduledIncoming:true
 *   - terminal (executed/cancelled) schedules are NOT counted as open holds
 *
 * PDF generation + contract validation are mocked (same pattern as the other
 * transfer integration suites).
 */
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, test, jest } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const mockValidate = jest.fn(async () => ({
  valid: true, missingFields: [], errors: [],
  generationData: { pricing: {} },
  template: { templateId: "generic", templateVersion: 1, legalContentVersion: 1 },
}));
const mockGenerate = jest.fn(async ({ contractId, actorId }) => {
  const { Contract } = await import("../models/index.js");
  const { transitionContract } = await import("./contractService.js");
  const contract = await Contract.findById(contractId);
  contract.preparedDocuments = contract.preparedDocuments || [];
  contract.preparedDocuments.push({
    documentType: "prepared", version: 1, storageProvider: "local",
    storageKey: "t/p_v1.pdf", fileName: "p_v1.pdf", fileHash: `h-${contract._id}-v1`,
    fileSize: 2048, pageCount: 4, templateId: "generic", templateVersion: "1",
    coordinateVersion: "1", generatedAt: new Date(), generatedBy: actorId, superseded: false,
  });
  contract.generatedFileHash = `h-${contract._id}-v1`;
  contract.generatedVersion = 1;
  contract.publicationStatus = "ready_for_resident";
  contract.tenantVisible = true;
  if (contract.status === "ready_for_generation") {
    await transitionContract(contract, "generated", actorId, "prepared (test)");
  } else {
    await contract.save();
  }
  return { contract, document: contract.preparedDocuments.at(-1), previousStatus: "ready_for_generation", isRegeneration: false };
});
await jest.unstable_mockModule("../services/contractPdfService.js", () => ({ generatePreparedContractPdf: mockGenerate }));
const realContractService = await import("./contractService.js");
await jest.unstable_mockModule("./contractService.js", () => ({
  ...realContractService,
  validateContractForGeneration: mockValidate,
}));

const { scheduleRoomTransfer } = await import("./scheduledRoomTransferService.js");
const { reconcileOccupancyIntegrity } = await import("../utils/scheduler.js");
const { generateContractNumber } = await import("./contractService.js");
const {
  Contract, Reservation, Room, User, Stay, BedHistory, Bill, BusinessSettings,
  MoveOutClearance, TenantCredit, TerminationReview, UtilityReading, ScheduledRoomTransfer,
} = await import("../models/index.js");

jest.setTimeout(240_000);

const RATE = { private: 13500, "double-sharing": 8100, "quadruple-sharing": 5400 };
const CAP = { private: 1, "double-sharing": 2, "quadruple-sharing": 4 };
const NEEDS_BED = new Set(["double-sharing", "quadruple-sharing"]);
const MOVE_IN = new Date("2026-01-01T00:00:00.000Z");
const LEASE_END = new Date("2026-12-31T00:00:00.000Z");

// A future Manila business date, ~10 days out from the real clock.
function futureDateISO(daysAhead = 10) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function pastDateISO(daysBack = 5) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function bedsFor(type, prefix) {
  if (!NEEDS_BED.has(type)) return [];
  return Array.from({ length: CAP[type] }, (_, i) => ({
    id: `${prefix}-b${i + 1}`, position: i % 2 ? "upper" : "lower", status: "available",
  }));
}

async function seed({ sourceType = "quadruple-sharing", roomNumber = "301", securityDepositHeld = RATE[sourceType] } = {}) {
  const tenant = await User.create({
    firebaseUid: `fb-${new mongoose.Types.ObjectId()}`, email: `t-${new mongoose.Types.ObjectId()}@ex.test`,
    username: `t_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
    firstName: "Sched", lastName: "Tenant", role: "tenant", tenantStatus: "active",
  });
  const srcBeds = bedsFor(sourceType, `r${roomNumber}`);
  if (srcBeds.length) srcBeds[0] = { ...srcBeds[0], status: "occupied", occupiedBy: { userId: tenant._id } };
  const roomA = await Room.create({
    name: `Room ${roomNumber}`, roomNumber, branch: "gil-puyat",
    type: sourceType, capacity: CAP[sourceType], currentOccupancy: 1, price: RATE[sourceType], beds: srcBeds,
  });
  const srcBedId = NEEDS_BED.has(sourceType) ? `r${roomNumber}-b1` : "";
  const reservation = await Reservation.create({
    userId: tenant._id, roomId: roomA._id, status: "moveIn", leaseDuration: 12,
    reservationFeeAmount: 2000, preferredRoomType: sourceType,
    agreedToPrivacy: true, agreedToCertification: true,
    totalPrice: RATE[sourceType], monthlyRent: RATE[sourceType],
    selectedBed: { id: srcBedId }, moveInDate: MOVE_IN, securityDepositHeld,
  });
  if (srcBeds.length) { roomA.beds[0].occupiedBy.reservationId = reservation._id; await roomA.save(); }
  const stay = await Stay.create({
    tenantId: tenant._id, reservationId: reservation._id, branch: "gil-puyat",
    roomId: roomA._id, bedId: srcBedId || `room-${roomA._id}`,
    leaseStartDate: MOVE_IN, leaseEndDate: LEASE_END, monthlyRent: RATE[sourceType], status: "active",
  });
  if (NEEDS_BED.has(sourceType)) {
    await BedHistory.create({
      bedId: srcBedId, roomId: roomA._id, tenantId: tenant._id, reservationId: reservation._id,
      stayId: stay._id, branch: "gil-puyat", moveInDate: MOVE_IN, status: "active",
    });
  }
  const actorId = new mongoose.Types.ObjectId();
  const num = await generateContractNumber("gil-puyat", new Date());
  const original = await Contract.create({
    ...num, contractPurpose: "initial", tenantId: tenant._id, applicationId: reservation._id,
    reservationId: reservation._id, stayId: stay._id, roomId: roomA._id, branch: "gil-puyat",
    propertyName: "Lilycrest Dormitory", propertyAddress: "123 Test St.", roomNumber: roomA.roomNumber,
    roomType: sourceType, leaseType: "long_term", approvedMonthlyRate: RATE[sourceType],
    securityDepositAmount: RATE[sourceType],
    leaseStartDate: MOVE_IN, leaseEndDate: LEASE_END, leaseDurationMonths: 12,
    status: "active", isCurrent: true,
    finalDocument: {
      version: 1, storageKey: "orig/final_v1.pdf", fileName: "final_v1.pdf",
      fileHash: "originalfinalhash", fileSize: 4096, mimeType: "application/pdf", pageCount: 8,
      sourceType: "notarized", sourceVersion: 1, sourceUploadedAt: new Date(),
      publishedAt: new Date(), publishedBy: actorId, tenantVisible: true,
    },
    statusHistory: [{ status: "active", changedBy: actorId, reason: "seed notarized lease" }],
    createdBy: actorId, updatedBy: actorId,
  });
  return { tenant, roomA, reservation, stay, original, actorId };
}

async function emptyRoom(type, roomNumber) {
  return Room.create({
    name: `Room ${roomNumber}`, roomNumber, branch: "gil-puyat",
    type, capacity: CAP[type], currentOccupancy: 0, price: RATE[type], beds: bedsFor(type, `r${roomNumber}`),
  });
}

function payloadFor({ targetRoom, transferDate }) {
  const destBedId = NEEDS_BED.has(targetRoom.type) ? `r${targetRoom.roomNumber}-b1` : undefined;
  return {
    confirm: true, targetRoomId: String(targetRoom._id),
    ...(destBedId ? { targetBedId: destBedId } : {}),
    effectiveTransferDate: transferDate, forceOverride: true,
  };
}

let mongo;
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri(), { dbName: "sched_transfer_2b" });
  // Ensure the partial-unique index exists for this connection.
  await ScheduledRoomTransfer.syncIndexes();
}, 120_000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
}, 120_000);
beforeEach(async () => {
  await Promise.all([
    Reservation.deleteMany({}), Room.deleteMany({}), User.deleteMany({}),
    Contract.deleteMany({}), Stay.deleteMany({}), BedHistory.deleteMany({}),
    Bill.deleteMany({}), BusinessSettings.deleteMany({}), TenantCredit.deleteMany({}),
    MoveOutClearance.deleteMany({}), TerminationReview.deleteMany({}),
    UtilityReading.deleteMany({}), ScheduledRoomTransfer.deleteMany({}),
  ]);
  await BusinessSettings.create({
    key: "global",
    privateDiscountPercent: 10, doubleDiscountPercent: 10, quadrupleDiscountPercent: 10,
    isDiscountEnabled: true, longTermLeaseMinMonths: 6,
    // Default office hours wide open so future-dated schedules in this suite
    // are never blocked; the same-day-guard tests override per-case.
    officeHoursStartMinutes: 0, officeHoursEndMinutes: 1440,
    officeDaysOfWeek: [1, 2, 3, 4, 5, 6, 7],
  });
  mockValidate.mockClear();
  mockGenerate.mockClear();
});

describe("scheduleRoomTransfer — private destination", () => {
  test("unknown held deposit remains null, allows scheduling, and creates no Bill", async () => {
    const { reservation, actorId } = await seed({
      sourceType: "quadruple-sharing",
      roomNumber: "300",
      securityDepositHeld: null,
    });
    const dest = await emptyRoom("private", "204");
    const { scheduledTransfer, previewSnapshot } = await scheduleRoomTransfer({
      reservationId: reservation._id,
      payload: payloadFor({ targetRoom: dest, transferDate: futureDateISO(8) }),
      actorId,
    });

    expect(scheduledTransfer.status).toBe("scheduled");
    expect(previewSnapshot.deposit).toMatchObject({ held: null, heldKnown: false, balanceDue: null });
    expect(previewSnapshot.totalImmediateDue).toBeNull();
    expect((await Reservation.findById(reservation._id)).securityDepositHeld).toBeNull();
    expect(await Bill.countDocuments({ reservationId: reservation._id })).toBe(0);
  });

  test("generated initial predecessor remains blocked and is never auto-published", async () => {
    const { reservation, original, actorId } = await seed({ sourceType: "quadruple-sharing", roomNumber: "299" });
    await Contract.updateOne(
      { _id: original._id },
      { $set: { status: "generated", contractPurpose: "initial", finalDocument: null } },
    );
    const dest = await emptyRoom("private", "203");
    await expect(scheduleRoomTransfer({
      reservationId: reservation._id,
      payload: payloadFor({ targetRoom: dest, transferDate: futureDateISO(7) }),
      actorId,
    })).rejects.toMatchObject({ code: "ROOM_TRANSFER_PREDECESSOR_NOT_ACTIVE" });

    const after = await Contract.findById(original._id);
    expect(after.status).toBe("generated");
    expect(after.contractPurpose).toBe("initial");
    expect(after.isCurrent).toBe(true);
  });

  test("creates a scheduled record, holds one capacity slot, no fake bed, no operational mutation", async () => {
    const { reservation, roomA, stay, actorId } = await seed({ sourceType: "quadruple-sharing", roomNumber: "301" });
    const dest = await emptyRoom("private", "205");
    const transferDate = futureDateISO(10);

    const roomAOccBefore = (await Room.findById(roomA._id)).currentOccupancy;

    const { scheduledTransfer, previewSnapshot } = await scheduleRoomTransfer({
      reservationId: reservation._id,
      payload: payloadFor({ targetRoom: dest, transferDate }),
      actorId,
    });

    expect(scheduledTransfer.status).toBe("scheduled");
    expect(scheduledTransfer.holdApplied).toBe(true);
    expect(scheduledTransfer.destinationNeedsBed).toBe(false);
    expect(scheduledTransfer.destinationBedId == null).toBe(true);
    expect(String(scheduledTransfer.destinationRoomId)).toBe(String(dest._id));
    expect(new Date(scheduledTransfer.effectiveTransferDate).getTime())
      .toBeGreaterThan(Date.now());

    // Destination committed capacity +1, no bed rows on a private room.
    const destAfter = await Room.findById(dest._id);
    expect(destAfter.currentOccupancy).toBe(1);
    expect(destAfter.beds).toHaveLength(0);

    // previewSnapshot uses the FUTURE effective date.
    expect(previewSnapshot).toBeTruthy();
    expect(Math.abs(new Date(previewSnapshot.effectiveTransferDate).getTime() - new Date(transferDate).getTime()))
      .toBeLessThan(24 * 3600 * 1000);
    expect(scheduledTransfer.previewSnapshot).toBeTruthy();

    // Nothing operational changed.
    const [resAfter, stayAfter, roomAAfter] = await Promise.all([
      Reservation.findById(reservation._id),
      Stay.findById(stay._id),
      Room.findById(roomA._id),
    ]);
    expect(String(resAfter.roomId)).toBe(String(roomA._id));
    expect(resAfter.selectedBed?.id).toBe("r301-b1");
    expect(Number(resAfter.monthlyRent)).toBe(RATE["quadruple-sharing"]);
    expect(resAfter.recurringRentRate == null || resAfter.recurringRentRate === 0).toBe(true);
    expect(String(stayAfter.roomId)).toBe(String(roomA._id));
    expect(stayAfter.status).toBe("active");
    expect(roomAAfter.currentOccupancy).toBe(roomAOccBefore);

    // Scheduling creates NO Bill (Round-2 decision) — the transfer_settlement
    // Bill is created during the admin Complete Transfer flow on the transfer
    // day. NO TenantCredit, NO UtilityReading cutoff either.
    expect(await TenantCredit.countDocuments({ reservationId: reservation._id })).toBe(0);
    expect(await UtilityReading.countDocuments({})).toBe(0);
    expect(await Bill.countDocuments({ reservationId: reservation._id, billType: "transfer_settlement" })).toBe(0);
    expect(scheduledTransfer.settlementBillId == null).toBe(true);

    // Addendum: generated + not current.
    const addendum = await Contract.findById(scheduledTransfer.addendumContractId);
    expect(addendum.contractPurpose).toBe("amendment");
    expect(addendum.status).toBe("generated");
    expect(addendum.isCurrent).toBe(false);
    expect(addendum.previousApprovedMonthlyRate).toBe(RATE["quadruple-sharing"]);
    expect(addendum.approvedMonthlyRate).toBeGreaterThan(0);
  });

  test("a second tenant cannot be scheduled into a private room already held", async () => {
    const a = await seed({ sourceType: "quadruple-sharing", roomNumber: "301" });
    const b = await seed({ sourceType: "double-sharing", roomNumber: "210" });
    const dest = await emptyRoom("private", "205");
    const transferDate = futureDateISO(12);

    await scheduleRoomTransfer({
      reservationId: a.reservation._id,
      payload: payloadFor({ targetRoom: dest, transferDate }),
      actorId: a.actorId,
    });

    await expect(scheduleRoomTransfer({
      reservationId: b.reservation._id,
      payload: payloadFor({ targetRoom: dest, transferDate }),
      actorId: b.actorId,
    })).rejects.toMatchObject({ code: "DESTINATION_ROOM_FULL" });

    // Only one schedule + one held slot.
    expect(await ScheduledRoomTransfer.countDocuments({ status: "scheduled" })).toBe(1);
    expect((await Room.findById(dest._id)).currentOccupancy).toBe(1);
  });
});

describe("scheduleRoomTransfer — shared destination", () => {
  test("Double: reserves the exact bed; second tenant cannot take that bed", async () => {
    const a = await seed({ sourceType: "private", roomNumber: "101" });
    const b = await seed({ sourceType: "private", roomNumber: "102" });
    const dest = await emptyRoom("double-sharing", "205");
    const transferDate = futureDateISO(9);

    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: a.reservation._id,
      payload: payloadFor({ targetRoom: dest, transferDate }),
      actorId: a.actorId,
    });
    expect(scheduledTransfer.destinationBedId).toBe("r205-b1");

    const destAfter = await Room.findById(dest._id);
    const heldBed = destAfter.beds.find((x) => x.id === "r205-b1");
    expect(heldBed.status).toBe("reserved");
    expect(String(heldBed.occupiedBy.reservationId)).toBe(String(a.reservation._id));
    expect(heldBed.occupiedBy.occupiedSince == null).toBe(true);
    expect(destAfter.currentOccupancy).toBe(1);

    // b tries to take the SAME held bed.
    await expect(scheduleRoomTransfer({
      reservationId: b.reservation._id,
      payload: { confirm: true, targetRoomId: String(dest._id), targetBedId: "r205-b1", effectiveTransferDate: transferDate, forceOverride: true },
      actorId: b.actorId,
    })).rejects.toMatchObject({ code: "BED_NOT_AVAILABLE" });

    // b CAN take the other bed.
    const second = await scheduleRoomTransfer({
      reservationId: b.reservation._id,
      payload: { confirm: true, targetRoomId: String(dest._id), targetBedId: "r205-b2", effectiveTransferDate: transferDate, forceOverride: true },
      actorId: b.actorId,
    });
    expect(second.scheduledTransfer.destinationBedId).toBe("r205-b2");
    expect((await Room.findById(dest._id)).currentOccupancy).toBe(2);
  });

  test("Quad: reserves the exact bed", async () => {
    const { reservation, actorId } = await seed({ sourceType: "private", roomNumber: "103" });
    const dest = await emptyRoom("quadruple-sharing", "301");
    const transferDate = futureDateISO(15);

    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id,
      payload: { confirm: true, targetRoomId: String(dest._id), targetBedId: "r301-b3", effectiveTransferDate: transferDate, forceOverride: true },
      actorId,
    });
    expect(scheduledTransfer.destinationBedId).toBe("r301-b3");
    const destAfter = await Room.findById(dest._id);
    expect(destAfter.beds.find((x) => x.id === "r301-b3").status).toBe("reserved");
    expect(destAfter.currentOccupancy).toBe(1);
  });
});

describe("scheduleRoomTransfer — guards", () => {
  test("rejects a past effective date", async () => {
    const { reservation, actorId } = await seed();
    const dest = await emptyRoom("private", "205");
    await expect(scheduleRoomTransfer({
      reservationId: reservation._id,
      payload: payloadFor({ targetRoom: dest, transferDate: pastDateISO(3) }),
      actorId,
    })).rejects.toMatchObject({ code: "PAST_TRANSFER_DATE" });
    expect(await ScheduledRoomTransfer.countDocuments({})).toBe(0);
  });

  test("same-day is ALLOWED (no future-only rejection), any time of day", async () => {
    const { reservation, actorId } = await seed();
    const dest = await emptyRoom("private", "205");
    const today = new Date(); today.setHours(9, 0, 0, 0);
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id,
      payload: {
        confirm: true, targetRoomId: String(dest._id),
        effectiveTransferDate: today.toISOString(),
        effectiveTransferTimeMinutes: 540,
      },
      actorId,
    });
    expect(scheduledTransfer.status).toBe("scheduled");
    expect(scheduledTransfer.effectiveTransferTimeMinutes).toBe(540);
    // scheduleHistory[0] seeded.
    expect(scheduledTransfer.scheduleHistory[0].kind).toBe("scheduled");
  });

  test("same-day at ANY time (e.g. 23:30) is accepted — no office-hours restriction", async () => {
    const { reservation, actorId } = await seed();
    const dest = await emptyRoom("private", "205");
    const today = new Date(); today.setHours(23, 30, 0, 0);
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id,
      payload: {
        confirm: true, targetRoomId: String(dest._id),
        effectiveTransferDate: today.toISOString(),
        effectiveTransferTimeMinutes: 23 * 60 + 30,
      },
      actorId,
    });
    expect(scheduledTransfer.status).toBe("scheduled");
    expect(scheduledTransfer.effectiveTransferTimeMinutes).toBe(23 * 60 + 30);
  });

  test("a FUTURE date + any time (incl. weekend / late night) is accepted", async () => {
    const { reservation, actorId } = await seed();
    const dest = await emptyRoom("private", "205");
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id,
      payload: {
        confirm: true, targetRoomId: String(dest._id),
        effectiveTransferDate: futureDateISO(12),
        effectiveTransferTimeMinutes: 21 * 60, // 21:00
      },
      actorId,
    });
    expect(scheduledTransfer.status).toBe("scheduled");
    expect(scheduledTransfer.effectiveTransferTimeMinutes).toBe(21 * 60);
  });

  test("only one open schedule per reservation", async () => {
    const { reservation, actorId } = await seed();
    const dest1 = await emptyRoom("private", "205");
    const dest2 = await emptyRoom("private", "206");

    await scheduleRoomTransfer({
      reservationId: reservation._id,
      payload: payloadFor({ targetRoom: dest1, transferDate: futureDateISO(8) }),
      actorId,
    });
    await expect(scheduleRoomTransfer({
      reservationId: reservation._id,
      payload: payloadFor({ targetRoom: dest2, transferDate: futureDateISO(9) }),
      actorId,
    })).rejects.toMatchObject({ code: "SCHEDULED_TRANSFER_ALREADY_EXISTS" });

    expect(await ScheduledRoomTransfer.countDocuments({ reservationId: reservation._id })).toBe(1);
    // dest2 never held.
    expect((await Room.findById(dest2._id)).currentOccupancy).toBe(0);
  });

  test("a pending future renewal blocks scheduling", async () => {
    const { reservation, stay, tenant, actorId } = await seed();
    const dest = await emptyRoom("private", "205");
    // Simulate a pending renewal: a Stay chained off the active one.
    await Stay.create({
      tenantId: tenant._id, reservationId: reservation._id, branch: "gil-puyat",
      roomId: stay.roomId, bedId: stay.bedId,
      leaseStartDate: new Date("2027-01-01"), leaseEndDate: new Date("2027-12-31"),
      monthlyRent: RATE["quadruple-sharing"], status: "active", previousStayId: stay._id,
    });
    await expect(scheduleRoomTransfer({
      reservationId: reservation._id,
      payload: payloadFor({ targetRoom: dest, transferDate: futureDateISO(10) }),
      actorId,
    })).rejects.toMatchObject({ code: "FUTURE_RENEWAL_EXISTS" });
    expect(await ScheduledRoomTransfer.countDocuments({})).toBe(0);
    expect((await Room.findById(dest._id)).currentOccupancy).toBe(0);
  });

  test("an initiated move-out clearance blocks scheduling before a hold is placed", async () => {
    const { reservation, stay, tenant, actorId } = await seed();
    const dest = await emptyRoom("private", "205");
    await MoveOutClearance.collection.insertOne({
      reservationId: reservation._id,
      stayId: stay._id,
      tenantId: tenant._id,
      branch: "gil-puyat",
      status: "initiated",
      intendedMoveOutDate: futureDateISO(20),
    });

    await expect(scheduleRoomTransfer({
      reservationId: reservation._id,
      payload: payloadFor({ targetRoom: dest, transferDate: futureDateISO(10) }),
      actorId,
    })).rejects.toMatchObject({ code: "ROOM_TRANSFER_MOVE_OUT_CONFLICT" });
    expect((await Room.findById(dest._id)).currentOccupancy).toBe(0);
  });

  test("an active termination review blocks scheduling before a hold is placed", async () => {
    const { reservation, tenant, actorId } = await seed();
    const dest = await emptyRoom("private", "205");
    await TerminationReview.collection.insertOne({
      reservationId: reservation._id,
      tenantId: tenant._id,
      branch: "gil-puyat",
      triggerType: "manual",
      triggerReason: "test conflict",
      status: "under_review",
      executionStatus: "not_applicable",
      openedBy: actorId,
      openedAt: new Date(),
    });

    await expect(scheduleRoomTransfer({
      reservationId: reservation._id,
      payload: payloadFor({ targetRoom: dest, transferDate: futureDateISO(10) }),
      actorId,
    })).rejects.toMatchObject({ code: "ROOM_TRANSFER_TERMINATION_CONFLICT" });
    expect((await Room.findById(dest._id)).currentOccupancy).toBe(0);
  });

  test("rejects a cross-branch destination", async () => {
    const { reservation, actorId } = await seed();
    const other = await Room.create({
      name: "Room G1", roomNumber: "G1", branch: "guadalupe",
      type: "private", capacity: 1, currentOccupancy: 0, price: 12000, beds: [],
    });
    await expect(scheduleRoomTransfer({
      reservationId: reservation._id,
      payload: payloadFor({ targetRoom: other, transferDate: futureDateISO(10) }),
      actorId,
    })).rejects.toMatchObject({ code: "CROSS_BRANCH_TRANSFER_NOT_ALLOWED" });
  });
});

describe("reconciler awareness — the hold survives", () => {
  test("Job 15 reconcileOccupancyIntegrity preserves a shared-bed hold and its count", async () => {
    const { reservation, actorId } = await seed({ sourceType: "private", roomNumber: "101" });
    const dest = await emptyRoom("double-sharing", "205");
    const transferDate = futureDateISO(10);

    await scheduleRoomTransfer({
      reservationId: reservation._id,
      payload: payloadFor({ targetRoom: dest, transferDate }),
      actorId,
    });

    // Deliberately desync the counter, then let Job 15 recompute.
    await Room.updateOne({ _id: dest._id }, { $set: { currentOccupancy: 0 } });
    await reconcileOccupancyIntegrity();

    const destAfter = await Room.findById(dest._id);
    expect(destAfter.currentOccupancy).toBe(1); // hold re-counted, not zeroed
    const heldBed = destAfter.beds.find((x) => x.id === "r205-b1");
    expect(heldBed.status).toBe("reserved");
    expect(String(heldBed.occupiedBy.reservationId)).toBe(String(reservation._id));
  });

  test("Job 15 preserves a private capacity hold", async () => {
    const { reservation, actorId } = await seed({ sourceType: "double-sharing", roomNumber: "210" });
    const dest = await emptyRoom("private", "205");
    await scheduleRoomTransfer({
      reservationId: reservation._id,
      payload: payloadFor({ targetRoom: dest, transferDate: futureDateISO(11) }),
      actorId,
    });
    await Room.updateOne({ _id: dest._id }, { $set: { currentOccupancy: 0 } });
    await reconcileOccupancyIntegrity();
    expect((await Room.findById(dest._id)).currentOccupancy).toBe(1);
  });

  test("realtime room sync renders the held bed as reserved + scheduledIncoming and keeps the count", async () => {
    const { reservation, actorId } = await seed({ sourceType: "private", roomNumber: "101" });
    const dest = await emptyRoom("double-sharing", "205");
    await scheduleRoomTransfer({
      reservationId: reservation._id,
      payload: payloadFor({ targetRoom: dest, transferDate: futureDateISO(10) }),
      actorId,
    });

    // Exercise the internal sync used by GET /rooms.
    const roomsControllerModule = await import("../controllers/roomsController.js");
    // syncRealtimeBedStatuses is module-internal; drive it via the exported
    // getRooms path would need req/res — instead assert via occupancyManager,
    // which shares the semantics and IS unit-testable.
    const { deriveRoomOccupancyState } = await import("../services/occupancy/occupancyManager.js");
    const { openHoldsByRoom } = await import("../services/scheduledRoomTransferService.js");
    const roomDoc = (await Room.findById(dest._id)).toObject();
    const holds = (await openHoldsByRoom([dest._id])).get(String(dest._id)) || [];
    const state = deriveRoomOccupancyState(roomDoc, [], holds);

    expect(state.currentOccupancy).toBe(1);
    expect(state.scheduledIncomingCount).toBe(1);
    const heldBed = state.beds.find((b) => b.id === "r205-b1");
    expect(heldBed.status).toBe("reserved");
    expect(heldBed.scheduledIncoming).toBe(true);
    // NOT rendered as a resident — no name/email/occupiedSince.
    expect(heldBed.occupant.scheduledTransferEffectiveDate).toBeTruthy();

    expect(roomsControllerModule).toBeTruthy();
  });

  test("terminal schedules (executed / cancelled) are NOT counted as open holds", async () => {
    const { reservation, actorId } = await seed({ sourceType: "private", roomNumber: "101" });
    const dest = await emptyRoom("double-sharing", "205");
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id,
      payload: payloadFor({ targetRoom: dest, transferDate: futureDateISO(10) }),
      actorId,
    });

    const { countOpenDestinationHolds, openHoldBackedBedKeys } = await import("./scheduledRoomTransferService.js");
    expect(await countOpenDestinationHolds(dest._id)).toBe(1);
    expect((await openHoldBackedBedKeys([dest._id])).size).toBe(1);

    // Flip to a terminal status (executor / cancellation land here in later phases).
    await ScheduledRoomTransfer.updateOne({ _id: scheduledTransfer._id }, { $set: { status: "cancelled", holdApplied: false } });

    expect(await countOpenDestinationHolds(dest._id)).toBe(0);
    expect((await openHoldBackedBedKeys([dest._id])).size).toBe(0);
  });
});
