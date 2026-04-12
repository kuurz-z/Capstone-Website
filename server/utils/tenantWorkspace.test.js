import { describe, expect, test } from "@jest/globals";
import {
  buildBillingSummary,
  buildTenantWorkspaceEntry,
  computeLeaseEndDate,
} from "./tenantWorkspace.js";

describe("tenantWorkspace utilities", () => {
  test("computes lease end from move-in date and lease duration", () => {
    const result = computeLeaseEndDate({
      moveInDate: new Date("2026-01-15T00:00:00.000Z"),
      leaseDuration: 6,
    });

    expect(result?.toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });

  test("classifies pending manual verification as next action without changing payment status enum", () => {
    const entry = buildTenantWorkspaceEntry({
      reservation: {
        _id: "reservation-1",
        reservationCode: "RES-001",
        status: "moveIn",
        moveInDate: new Date("2026-01-01T00:00:00.000Z"),
        leaseDuration: 12,
        selectedBed: { id: "bed-a", position: "lower" },
        userId: {
          _id: "tenant-1",
          firstName: "Jamie",
          lastName: "Cruz",
          email: "jamie@example.com",
          phone: "09170000000",
        },
        roomId: {
          _id: "room-1",
          name: "GP-201",
          branch: "gil-puyat",
        },
        leaseExtensions: [],
      },
      bills: [
        {
          _id: "bill-1",
          reservationId: "reservation-1",
          status: "pending",
          isArchived: false,
          charges: { rent: 5000, electricity: 0, water: 0, penalty: 0, discount: 0 },
          totalAmount: 5000,
          paidAmount: 0,
          dueDate: new Date("2026-04-30T00:00:00.000Z"),
          paymentProof: {
            verificationStatus: "pending-verification",
          },
        },
      ],
      bedHistoryRecords: [],
      now: new Date("2026-04-11T00:00:00.000Z"),
    });

    expect(entry.paymentStatus).toBe("partial");
    expect(entry.nextAction).toBe("verify_payment");
    expect(entry.allowedActions.moveOut.enabled).toBe(false);
    expect(
      entry.warningFlags.some((warning) => warning.code === "pending_payment_verification"),
    ).toBe(true);
  });

  test("marks overdue balances as overdue billing summary", () => {
    const summary = buildBillingSummary(
      [
        {
          _id: "bill-2",
          status: "overdue",
          isArchived: false,
          charges: { rent: 4500, electricity: 0, water: 0, penalty: 300, discount: 0 },
          totalAmount: 4800,
          paidAmount: 0,
          dueDate: new Date("2026-03-10T00:00:00.000Z"),
        },
      ],
      new Date("2026-04-11T00:00:00.000Z"),
    );

    expect(summary.paymentStatus).toBe("overdue");
    expect(summary.currentBalance).toBe(4800);
    expect(summary.hasOverdue).toBe(true);
  });
});
