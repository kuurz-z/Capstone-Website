import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import fs from "node:fs";
import mongoose from "mongoose";

const objectId = () => new mongoose.Types.ObjectId();
const chain = (value) => {
  const query = {
    select: jest.fn(() => query),
    lean: jest.fn(() => Promise.resolve(value)),
    sort: jest.fn(() => query),
    populate: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};

const Reservation = { findOne: jest.fn() };
const Room = { find: jest.fn(), findById: jest.fn(), findOne: jest.fn() };
const ScheduledRoomTransfer = { find: jest.fn(), findById: jest.fn(), findOne: jest.fn() };
const TenantTransferRequest = {
  create: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
};
const MoveOutClearance = { exists: jest.fn() };
const TerminationReview = { exists: jest.fn() };
const User = { findById: jest.fn() };
const resolveCurrentStayForTenant = jest.fn();
const resolveAuthoritativeCurrentContract = jest.fn();
const roomTransferLifecycleOnce = jest.fn(async () => null);
const notifyBranchAdmins = jest.fn(async () => []);
const serializeScheduledRoomTransfer = jest.fn(async (record) => ({
  status: record.status === "executed" ? "completed" : record.status === "cancelled" ? "cancelled" : "scheduled",
  transferBalance: { hasBill: false, paymentState: "none", amountDue: 0, amountPaid: 0, remaining: 0, billId: null },
  actionRequiredReason: null,
  actionRequiredMessage: null,
  utilitiesNote: "Utilities remain backend-authoritative.",
  addendum: null,
}));

jest.unstable_mockModule("../models/MoveOutClearance.js", () => ({ default: MoveOutClearance }));
jest.unstable_mockModule("../models/Reservation.js", () => ({ default: Reservation }));
jest.unstable_mockModule("../models/Room.js", () => ({ default: Room }));
jest.unstable_mockModule("../models/ScheduledRoomTransfer.js", () => ({
  default: ScheduledRoomTransfer,
  OPEN_SCHEDULED_ROOM_TRANSFER_STATUSES: ["scheduled", "blocked", "processing"],
}));
jest.unstable_mockModule("../models/TenantTransferRequest.js", () => ({ default: TenantTransferRequest }));
jest.unstable_mockModule("../models/TerminationReview.js", () => ({ default: TerminationReview }));
jest.unstable_mockModule("../models/User.js", () => ({ default: User }));
jest.unstable_mockModule("../utils/tenantActionService.js", () => ({
  isValidTransferPredecessor: (contract) => Boolean(
    contract && (
      ["active", "published", "expiring_soon"].includes(contract.status) ||
      contract.status === "generated" && contract.isCurrent === true &&
        ["amendment", "replacement"].includes(contract.contractPurpose)
    )
  ),
}));
jest.unstable_mockModule("./tenantContractSelectionService.js", () => ({
  resolveAuthoritativeCurrentContract,
  resolveCurrentStayForTenant,
}));
jest.unstable_mockModule("./notifications/notificationService.js", () => ({
  notify: { roomTransferLifecycleOnce },
  notifyBranchAdmins,
}));
jest.unstable_mockModule("./scheduledRoomTransferView.js", () => ({ serializeScheduledRoomTransfer }));

const service = await import("./tenantTransferRequestService.js");

const tenantId = objectId();
const reservationId = objectId();
const roomId = objectId();
const stayId = objectId();

function arrangeActiveStay() {
  User.findById.mockReturnValue(chain({
    _id: tenantId, role: "tenant", tenantStatus: "active", firstName: "Tina", lastName: "Tenant", email: "tina@example.com",
  }));
  resolveCurrentStayForTenant.mockResolvedValue({
    _id: stayId, tenantId, reservationId, roomId, bedId: "bed-a", bedCode: "A-L", bunkBlock: "A", branch: "guadalupe",
  });
  Reservation.findOne.mockReturnValue(chain({ _id: reservationId, userId: tenantId, status: "moveIn" }));
  Room.findById.mockReturnValue(chain({
    _id: roomId, name: "Room 201", roomNumber: "201", type: "double-sharing", branch: "guadalupe",
    beds: [{ id: "bed-a", position: "lower", bunkBlock: "A", code: "A-L" }],
  }));
  const request = {
    _id: objectId(), tenantId, reservationId, stayId, branch: "guadalupe", status: "pending",
    preferredRoomType: "private", reason: "Need a quieter room", note: "",
    currentRoomSnapshot: { roomId, name: "Room 201", roomNumber: "201", type: "double-sharing", branch: "guadalupe" },
    currentBedSnapshot: { bedId: "bed-a", position: "lower", bunkBlock: "A", code: "A-L" },
    submittedAt: new Date("2026-08-31T02:00:00Z"),
  };
  TenantTransferRequest.create.mockResolvedValue(request);
  resolveAuthoritativeCurrentContract.mockResolvedValue({
    _id: objectId(), status: "active", isCurrent: true, leaseEndDate: new Date("2027-08-31T00:00:00Z"),
  });
  return request;
}

beforeEach(() => {
  jest.clearAllMocks();
  ScheduledRoomTransfer.findOne.mockReturnValue(chain(null));
  ScheduledRoomTransfer.find.mockReturnValue(chain([]));
  ScheduledRoomTransfer.findById.mockReturnValue(chain(null));
  TenantTransferRequest.findOne.mockReturnValue(chain(null));
  Room.findOne.mockReturnValue(chain(null));
  MoveOutClearance.exists.mockResolvedValue(null);
  TerminationReview.exists.mockResolvedValue(null);
});

describe("tenant room transfer request boundary", () => {
  test("one canonical label vocabulary drives Web and Mobile", () => {
    expect(["pending", "scheduled", "ready_for_transfer", "awaiting_settlement", "action_required", "completed", "declined", "cancelled"].map((status) => (
      service.tenantTransferStatusLabel(status)
    ))).toEqual(["Pending Review", "Scheduled", "Ready for Transfer", "Settlement Required", "Action Required", "Completed", "Declined", "Cancelled"]);
  });

  test("submission code cannot create holds, schedules, bills, addenda, utilities, or occupancy mutations", () => {
    const source = fs.readFileSync(new URL("./tenantTransferRequestService.js", import.meta.url), "utf8");
    const createBody = source.slice(
      source.indexOf("export async function createTenantTransferRequest"),
      source.indexOf("export async function cancelTenantTransferRequest"),
    );
    for (const forbidden of [
      "Bill.", "UtilityReading.", "destinationHold", "holdApplied",
      "currentOccupancy", "applyScheduledTransferHold", "scheduleRoomTransfer(",
    ]) expect(createBody).not.toContain(forbidden);
  });

  test("active tenant with a canonical current Stay creates intent only and sends deduplicated notifications", async () => {
    const created = arrangeActiveStay();
    const result = await service.createTenantTransferRequest({
      tenantId,
      payload: { preferredRoomType: "private", reason: "Need a quieter room" },
    });

    expect(result).toMatchObject({ id: String(created._id), status: "pending", statusLabel: "Pending Review", canCancel: true });
    expect(TenantTransferRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      tenantId, reservationId, stayId, preferredRoomType: "private", reason: "Need a quieter room",
    }));
    expect(ScheduledRoomTransfer.findOne).not.toHaveBeenCalled();
    expect(ScheduledRoomTransfer.findById).not.toHaveBeenCalled();
    expect(roomTransferLifecycleOnce).toHaveBeenCalledWith(
      tenantId,
      "Room Transfer Request Received",
      expect.any(String),
      `tenant_transfer_request_received:${created._id}`,
      expect.any(Object),
    );
    expect(notifyBranchAdmins).toHaveBeenCalledWith(
      "guadalupe", "general", "New Room Transfer Request", expect.any(String),
      expect.objectContaining({ dedupeKey: `tenant_transfer_request_admin:${created._id}` }),
    );
  });

  test("non-active tenant and missing canonical Stay are rejected", async () => {
    User.findById.mockReturnValue(chain({ _id: tenantId, role: "tenant", tenantStatus: "inactive" }));
    await expect(service.createTenantTransferRequest({ tenantId, payload: { preferredRoomType: "private", reason: "Reason" } }))
      .rejects.toMatchObject({ code: "ACTIVE_TENANT_REQUIRED", statusCode: 403 });

    User.findById.mockReturnValue(chain({ _id: tenantId, role: "tenant", tenantStatus: "active" }));
    resolveCurrentStayForTenant.mockResolvedValue(null);
    await expect(service.createTenantTransferRequest({ tenantId, payload: { preferredRoomType: "private", reason: "Reason" } }))
      .rejects.toMatchObject({ code: "ACTIVE_STAY_REQUIRED", statusCode: 409 });
  });

  test("database uniqueness conflict blocks a duplicate open request", async () => {
    arrangeActiveStay();
    TenantTransferRequest.create.mockRejectedValue(Object.assign(new Error("duplicate"), { code: 11000 }));
    await expect(service.createTenantTransferRequest({ tenantId, payload: { preferredRoomType: "private", reason: "Reason" } }))
      .rejects.toMatchObject({ code: "OPEN_TRANSFER_REQUEST_EXISTS", statusCode: 409 });
  });

  test("tenant-safe preferences are same-branch, canonical, and contain no raw room internals", async () => {
    const otherRoomId = objectId();
    resolveCurrentStayForTenant.mockReturnValue(chain({
      _id: stayId, roomId, branch: "guadalupe", status: "active",
    }));
    Room.find.mockReturnValue(chain([{
      _id: otherRoomId,
      name: "Room 305",
      roomNumber: "305",
      type: "private",
      branch: "guadalupe",
      beds: [{ occupiedBy: { reservationId } }],
      lockOwnerId: objectId(),
    }]));
    const preferences = await service.getTenantRoomTransferPreferences(tenantId);
    expect(Room.find).toHaveBeenCalledWith(expect.objectContaining({
      branch: "guadalupe",
      _id: { $ne: roomId },
    }));
    expect(preferences).toEqual([{
      roomId: String(otherRoomId),
      name: "Room 305",
      roomNumber: "305",
      roomType: "private",
      branch: "guadalupe",
      preferenceSelectable: true,
    }]);
    expect(JSON.stringify(preferences)).not.toMatch(/occupiedBy|reservationId|lockOwner|beds/);
  });

  test("request creation rejects known lifecycle conflicts and an invalid predecessor", async () => {
    arrangeActiveStay();
    ScheduledRoomTransfer.find.mockReturnValueOnce(chain([{
      _id: objectId(), reservationId, tenantId, status: "scheduled", scheduledAt: new Date(),
    }]));
    await expect(service.createTenantTransferRequest({ tenantId, payload: { preferredRoomType: "private", reason: "Reason" } }))
      .rejects.toMatchObject({ code: "SCHEDULED_TRANSFER_ALREADY_EXISTS" });

    arrangeActiveStay();
    MoveOutClearance.exists.mockResolvedValueOnce({ _id: objectId() });
    await expect(service.createTenantTransferRequest({ tenantId, payload: { preferredRoomType: "private", reason: "Reason" } }))
      .rejects.toMatchObject({ code: "ROOM_TRANSFER_MOVE_OUT_CONFLICT" });

    arrangeActiveStay();
    TerminationReview.exists.mockResolvedValueOnce({ _id: objectId() });
    await expect(service.createTenantTransferRequest({ tenantId, payload: { preferredRoomType: "private", reason: "Reason" } }))
      .rejects.toMatchObject({ code: "ROOM_TRANSFER_TERMINATION_CONFLICT" });

    arrangeActiveStay();
    resolveAuthoritativeCurrentContract.mockResolvedValueOnce({ status: "draft", isCurrent: true });
    await expect(service.createTenantTransferRequest({ tenantId, payload: { preferredRoomType: "private", reason: "Reason" } }))
      .rejects.toMatchObject({ code: "ROOM_TRANSFER_PREDECESSOR_NOT_ACTIVE" });
  });

  test("preferred transfer date cannot exceed the canonical current lease end", async () => {
    arrangeActiveStay();
    await expect(service.createTenantTransferRequest({
      tenantId,
      payload: {
        preferredRoomType: "private",
        preferredTransferDate: "2027-09-01",
        reason: "Reason",
      },
    })).rejects.toMatchObject({ code: "PREFERRED_TRANSFER_DATE_AFTER_LEASE_END" });
  });

  test("tenant cancellation is ownership-scoped and pending-only", async () => {
    const pending = arrangeActiveStay();
    TenantTransferRequest.findOneAndUpdate.mockResolvedValue(pending);
    await service.cancelTenantTransferRequest({ requestId: pending._id, tenantId });
    expect(TenantTransferRequest.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: pending._id, tenantId, status: "pending", scheduledRoomTransferId: null }),
      expect.any(Object), expect.any(Object),
    );

    TenantTransferRequest.findOneAndUpdate.mockResolvedValue(null);
    TenantTransferRequest.findOne.mockReturnValue(chain({ ...pending, status: "scheduled", scheduledRoomTransferId: objectId() }));
    await expect(service.cancelTenantTransferRequest({ requestId: pending._id, tenantId }))
      .rejects.toMatchObject({ code: "SCHEDULED_TRANSFER_CANNOT_BE_TENANT_CANCELLED", statusCode: 409 });

    TenantTransferRequest.findOne.mockReturnValue(chain(null));
    await expect(service.cancelTenantTransferRequest({ requestId: pending._id, tenantId: objectId() }))
      .rejects.toMatchObject({ code: "TRANSFER_REQUEST_NOT_FOUND", statusCode: 404 });
  });

  test("Admin decline and schedule linking transition the shared request", async () => {
    const pending = arrangeActiveStay();
    TenantTransferRequest.findOneAndUpdate.mockResolvedValueOnce({ ...pending, status: "declined", declineReason: "No suitable vacancy" });
    const declined = await service.declineTenantTransferRequest({ requestId: pending._id, actorId: objectId(), declineReason: "No suitable vacancy" });
    expect(declined).toMatchObject({ status: "declined", statusLabel: "Declined", declineReason: "No suitable vacancy" });

    const scheduledId = objectId();
    TenantTransferRequest.findOneAndUpdate.mockResolvedValueOnce({ ...pending, status: "scheduled", scheduledRoomTransferId: scheduledId });
    await service.linkScheduledTransferToRequest({
      reservationId,
      scheduledTransfer: { _id: scheduledId, tenantId },
      requestId: pending._id,
      actorId: objectId(),
      schedulingToken: "claim-token",
    });
    expect(TenantTransferRequest.findOneAndUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ reservationId, status: "scheduling", schedulingToken: "claim-token", scheduledRoomTransferId: null, _id: pending._id }),
      expect.objectContaining({ $set: expect.objectContaining({ status: "scheduled", scheduledRoomTransferId: scheduledId }) }),
      expect.any(Object),
    );
  });

  test("branch Admin decline is scoped to the authenticated branch", async () => {
    const pending = arrangeActiveStay();
    TenantTransferRequest.findOneAndUpdate.mockResolvedValue(null);
    await expect(service.declineTenantTransferRequest({
      requestId: pending._id,
      actorId: objectId(),
      actorRole: "branch_admin",
      actorBranch: "guadalupe",
    })).rejects.toMatchObject({ code: "TRANSFER_REQUEST_NOT_FOUND", statusCode: 404 });
    expect(TenantTransferRequest.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ branch: "guadalupe" });
  });

  test("a failed Admin schedule releases its request claim back to pending", async () => {
    const requestId = objectId();
    TenantTransferRequest.findOneAndUpdate.mockResolvedValue({
      _id: requestId, reservationId, tenantId, status: "pending",
    });
    await service.releaseTenantTransferSchedulingClaim({
      requestId,
      reservationId,
      schedulingToken: "claim-failed",
    });
    expect(TenantTransferRequest.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "scheduling", schedulingToken: "claim-failed" }),
      expect.objectContaining({ $set: expect.objectContaining({ status: "pending" }) }),
      expect.any(Object),
    );
  });

  test("successful schedule plus first link failure reconciles from operational truth", async () => {
    const requestId = objectId();
    const scheduledId = objectId();
    const scheduled = {
      _id: scheduledId,
      reservationId,
      tenantId,
      status: "scheduled",
      scheduledAt: new Date(),
    };
    TenantTransferRequest.findOneAndUpdate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        _id: requestId,
        reservationId,
        tenantId,
        status: "scheduled",
        scheduledRoomTransferId: scheduledId,
      });
    await expect(service.linkScheduledTransferToRequest({
      reservationId,
      scheduledTransfer: scheduled,
      requestId,
      schedulingToken: "claim-success",
    })).resolves.toMatchObject({ status: "scheduled" });
  });

  test("stale scheduling claims recover, while terminal operational truth closes stale rows", async () => {
    const stale = {
      _id: objectId(), tenantId, reservationId, stayId, status: "scheduling",
      schedulingStartedAt: new Date(Date.now() - service.SCHEDULING_CLAIM_TTL_MS - 1000),
      submittedAt: new Date(Date.now() - 10_000), preferredRoomType: "private", reason: "Reason",
    };
    TenantTransferRequest.findOne.mockReturnValueOnce(chain(stale));
    TenantTransferRequest.findOneAndUpdate.mockResolvedValueOnce({ ...stale, status: "pending", schedulingStartedAt: null });
    const recovered = await service.getTenantTransferLifecycle(tenantId);
    expect(recovered.status).toBe("pending");

    const terminal = {
      _id: objectId(), tenantId, reservationId, status: "executed",
      scheduledAt: new Date(Date.now() - 5_000), executedAt: new Date(),
    };
    TenantTransferRequest.findOne.mockReturnValueOnce(chain({ ...stale, status: "scheduled" }));
    ScheduledRoomTransfer.find.mockReturnValueOnce(chain([terminal]));
    TenantTransferRequest.findOneAndUpdate.mockResolvedValueOnce({
      ...stale, status: "completed", scheduledRoomTransferId: terminal._id,
    });
    const completed = await service.getTenantTransferLifecycle(tenantId);
    expect(completed.status).toBe("completed");
  });

  test("a newer Admin-only operational schedule wins over an old linked terminal lifecycle", () => {
    const oldScheduleId = objectId();
    const newScheduleId = objectId();
    const request = {
      _id: objectId(), reservationId, status: "completed",
      scheduledRoomTransferId: oldScheduleId, submittedAt: new Date("2026-01-01T00:00:00Z"),
    };
    const selected = service.selectCanonicalTenantTransferLifecycle({
      request,
      scheduledTransfers: [
        { _id: oldScheduleId, reservationId, status: "executed", scheduledAt: new Date("2026-01-02T00:00:00Z"), executedAt: new Date("2026-01-03T00:00:00Z") },
        { _id: newScheduleId, reservationId, status: "scheduled", scheduledAt: new Date("2026-08-31T00:00:00Z") },
      ],
    });
    expect(String(selected.scheduledTransfer._id)).toBe(String(newScheduleId));
  });

  test("Admin-only schedule fallback, reschedule and completion use the same tenant-safe lifecycle", async () => {
    const scheduledId = objectId();
    const schedule = {
      _id: scheduledId, reservationId, tenantId, status: "scheduled", effectiveTransferDate: new Date("2026-09-15T00:00:00Z"),
      effectiveTransferTimeMinutes: 600, destinationRoomId: { _id: objectId(), name: "Room 305", roomNumber: "305", type: "private", branch: "guadalupe" },
      internalReadinessSnapshot: { mustNeverLeak: true }, estimatedTransferBalance: 9999,
    };
    TenantTransferRequest.findOne.mockReturnValue(chain(null));
    ScheduledRoomTransfer.find.mockReturnValue(chain([schedule]));
    const lifecycle = await service.getTenantTransferLifecycle(tenantId);
    expect(lifecycle).toMatchObject({ status: "scheduled", statusLabel: "Scheduled", request: null });
    expect(lifecycle.scheduledRoomTransfer).not.toHaveProperty("internalReadinessSnapshot");
    expect(lifecycle.scheduledRoomTransfer).not.toHaveProperty("estimatedTransferBalance");

    serializeScheduledRoomTransfer.mockResolvedValueOnce({
      status: "awaiting_settlement",
      transferBalance: { hasBill: true, paymentState: "partial", amountDue: 1000, amountPaid: 400, remaining: 600, billId: "bill-1" },
      actionRequiredReason: "TRANSFER_BALANCE_UNPAID",
      actionRequiredMessage: null,
      utilitiesNote: "Utilities remain backend-authoritative.",
      addendum: null,
    });
    ScheduledRoomTransfer.find.mockReturnValueOnce(chain([schedule]));
    const settlementLifecycle = await service.getTenantTransferLifecycle(tenantId);
    expect(settlementLifecycle).toMatchObject({ status: "awaiting_settlement", statusLabel: "Settlement Required" });
    expect(settlementLifecycle.scheduledRoomTransfer).toMatchObject({
      settlement: { required: true, status: "partial", remaining: 600, billId: "bill-1" },
      tenantGuidance: expect.stringContaining("Open Billing"),
    });

    TenantTransferRequest.findOneAndUpdate.mockResolvedValue({ _id: objectId(), tenantId, reservationId, status: "scheduled" });
    await service.syncRequestFromScheduledTransfer({ ...schedule, scheduleHistory: [{ changedAt: new Date() }] }, { event: "rescheduled" });
    expect(roomTransferLifecycleOnce).toHaveBeenCalledWith(tenantId, "Room Transfer Rescheduled", expect.any(String), `room_transfer_rescheduled:${scheduledId}:1`, expect.any(Object));

    await service.syncRequestFromScheduledTransfer({ ...schedule, status: "executed", executedAt: new Date() });
    expect(TenantTransferRequest.findOneAndUpdate).toHaveBeenLastCalledWith(
      expect.any(Object), expect.objectContaining({ $set: expect.objectContaining({ status: "completed" }) }), expect.any(Object),
    );
    expect(roomTransferLifecycleOnce).toHaveBeenCalledWith(tenantId, "Room Transfer Completed", expect.any(String), `room_transfer_completed:${scheduledId}`, expect.any(Object));
  });
});
