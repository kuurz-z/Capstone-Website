import { describe, expect, it } from "@jest/globals";
import {
  describeScheduledTransferActionRequired,
  deriveScheduledTransferUserStatus,
  SCHEDULED_TRANSFER_STATUS_LABELS,
  SCHEDULED_TRANSFER_USER_STATUSES,
} from "./scheduledRoomTransferView.js";

describe("describeScheduledTransferActionRequired", () => {
  it("returns null when no reason", () => {
    expect(describeScheduledTransferActionRequired(null)).toBeNull();
    expect(describeScheduledTransferActionRequired("")).toBeNull();
  });

  it("maps each canonical action reason to a friendly message, never echoing the raw code", () => {
    for (const code of [
      "TRANSFER_BALANCE_UNPAID",
      "ADDITIONAL_BALANCE_DUE",
      "FINANCIAL_ADJUSTMENT_REQUIRED",
      "PAYMENT_ALREADY_RECEIVED",
      "PAID_TRANSFER_CANNOT_COMPLETE",
      "OPERATIONAL_VALIDATION_FAILED",
      "EXECUTION_FAILED",
    ]) {
      const msg = describeScheduledTransferActionRequired(code);
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(10);
      expect(msg).not.toContain(code);
    }
  });

  it("manual financial paths consistently point to the Administration Office on the 2nd Floor", () => {
    for (const code of [
      "FINANCIAL_ADJUSTMENT_REQUIRED",
      "PAYMENT_ALREADY_RECEIVED",
      "PAID_TRANSFER_CANNOT_COMPLETE",
    ]) {
      const msg = describeScheduledTransferActionRequired(code);
      expect(msg).toMatch(/Administration Office/i);
      expect(msg).toMatch(/2nd Floor/i);
    }
  });

  it("strips a suffix after ':' (EXECUTION_FAILED: <detail>) before mapping", () => {
    expect(describeScheduledTransferActionRequired("EXECUTION_FAILED: BED_NOT_AVAILABLE")).toMatch(
      /could not be completed/i,
    );
  });

  it("falls back to a generic review message for an unknown reason", () => {
    expect(describeScheduledTransferActionRequired("SOMETHING_NEW")).toMatch(/needs review/i);
  });
});

describe("deriveScheduledTransferUserStatus — DERIVED from stored status + calendar date + settlement Bill", () => {
  // A moment well in the future / past, in Manila.
  const FUTURE = new Date("2999-01-01T00:00:00.000+08:00");
  const PAST = new Date("2000-01-01T00:00:00.000+08:00");
  const NOW = new Date("2026-08-30T12:00:00.000+08:00");
  const sched = (over) => ({
    status: "scheduled",
    effectiveTransferDate: over,
    effectiveTransferTimeMinutes: 0,
  });

  it("executed -> completed; cancelled -> cancelled (regardless of date/balance)", () => {
    expect(deriveScheduledTransferUserStatus({ status: "executed", effectiveTransferDate: PAST }, null, NOW)).toBe("completed");
    expect(deriveScheduledTransferUserStatus({ status: "cancelled", effectiveTransferDate: PAST }, null, NOW)).toBe("cancelled");
  });

  it("scheduled + calendar date not reached still shows a required payment", () => {
    expect(deriveScheduledTransferUserStatus(sched(FUTURE), { hasBill: true, paymentState: "unpaid" }, NOW)).toBe("awaiting_settlement");
    expect(deriveScheduledTransferUserStatus(sched(FUTURE), null, NOW)).toBe("scheduled");
  });

  it("scheduled for today is ready even before its guidance time", () => {
    const sameDay = {
      status: "scheduled",
      effectiveTransferDate: new Date("2026-08-30T00:00:00.000+08:00"),
      effectiveTransferTimeMinutes: 23 * 60 + 59,
    };
    expect(deriveScheduledTransferUserStatus(sameDay, null, NOW)).toBe("ready_for_transfer");
    expect(deriveScheduledTransferUserStatus(
      sameDay,
      { hasBill: true, paymentState: "unpaid" },
      NOW,
    )).toBe("awaiting_settlement");
  });

  it("scheduled + reached + no/settled balance -> ready_for_transfer", () => {
    expect(deriveScheduledTransferUserStatus(sched(PAST), { hasBill: false, paymentState: "none" }, NOW)).toBe("ready_for_transfer");
    expect(deriveScheduledTransferUserStatus(sched(PAST), { hasBill: true, paymentState: "paid" }, NOW)).toBe("ready_for_transfer");
  });

  it("scheduled + reached + unpaid/partial balance -> awaiting_settlement", () => {
    expect(deriveScheduledTransferUserStatus(sched(PAST), { hasBill: true, paymentState: "unpaid" }, NOW)).toBe("awaiting_settlement");
    expect(deriveScheduledTransferUserStatus(sched(PAST), { hasBill: true, paymentState: "partial" }, NOW)).toBe("awaiting_settlement");
  });

  it("action_required -> action_required, unless a Bill is now unpaid (then awaiting_settlement is clearer)", () => {
    const ar = { status: "action_required", effectiveTransferDate: PAST, effectiveTransferTimeMinutes: 0 };
    expect(deriveScheduledTransferUserStatus(ar, null, NOW)).toBe("action_required");
    expect(deriveScheduledTransferUserStatus(ar, { hasBill: true, paymentState: "unpaid" }, NOW)).toBe("awaiting_settlement");
  });

  it("every derived status is a known label key; never a raw scheduler enum leak", () => {
    const all = [
      deriveScheduledTransferUserStatus(sched(FUTURE), null, NOW),
      deriveScheduledTransferUserStatus(sched(PAST), { hasBill: true, paymentState: "unpaid" }, NOW),
      deriveScheduledTransferUserStatus(sched(PAST), null, NOW),
      deriveScheduledTransferUserStatus({ status: "executed", effectiveTransferDate: PAST }, null, NOW),
      deriveScheduledTransferUserStatus({ status: "cancelled", effectiveTransferDate: PAST }, null, NOW),
    ];
    for (const s of all) {
      expect(SCHEDULED_TRANSFER_USER_STATUSES).toContain(s);
      expect(Object.keys(SCHEDULED_TRANSFER_STATUS_LABELS)).toContain(s);
    }
  });
});
