import { describe, expect, test } from "@jest/globals";
import { parseDateTime } from "./tenantActionService.js";
import { formatManilaDate, getManilaToday } from "./dateUtils.js";

describe("tenantActionService parseDateTime", () => {
  test("combines date and moveOutTime string in Manila timezone (PHT)", () => {
    const result = parseDateTime("2026-09-15", "10:00");
    expect(result).toBeInstanceOf(Date);
    // 10:00 AM PHT (UTC+8) is 02:00 UTC
    expect(result.toISOString()).toBe("2026-09-15T02:00:00.000Z");
    expect(formatManilaDate(result, "YYYY-MM-DD HH:mm")).toBe("2026-09-15 10:00");
  });

  test("supports payload object with actualVacateTime or moveOutTime", () => {
    const fromVacate = parseDateTime("2026-09-15", { actualVacateTime: "14:30" });
    expect(fromVacate.toISOString()).toBe("2026-09-15T06:30:00.000Z");
    expect(formatManilaDate(fromVacate, "YYYY-MM-DD HH:mm")).toBe("2026-09-15 14:30");

    const fromMoveOut = parseDateTime("2026-09-15", { moveOutTime: "08:15" });
    expect(fromMoveOut.toISOString()).toBe("2026-09-15T00:15:00.000Z");
    expect(formatManilaDate(fromMoveOut, "YYYY-MM-DD HH:mm")).toBe("2026-09-15 08:15");
  });

  test("handles date without time for future/past dates by normalizing to Manila start of day", () => {
    const futureDate = "2026-12-01";
    const result = parseDateTime(futureDate, "");
    expect(result).toBeInstanceOf(Date);
    // Midnight PHT on 2026-12-01 is 2026-11-30T16:00:00.000Z (NOT UTC midnight 2026-12-01T00:00:00.000Z)
    expect(result.toISOString()).toBe("2026-11-30T16:00:00.000Z");
    expect(formatManilaDate(result, "YYYY-MM-DD HH:mm")).toBe("2026-12-01 00:00");
  });

  test("handles today's date with no time by aligning with current instant", () => {
    const todayStr = formatManilaDate(new Date(), "YYYY-MM-DD");
    const before = Date.now();
    const result = parseDateTime(todayStr, "");
    const after = Date.now();
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.getTime()).toBeLessThanOrEqual(after);
  });

  test("supports payload object as first argument with moveOutDate and moveOutTime", () => {
    const payloadResult = parseDateTime({
      moveOutDate: "2026-09-15",
      moveOutTime: "16:45",
    });
    expect(payloadResult.toISOString()).toBe("2026-09-15T08:45:00.000Z");
    expect(formatManilaDate(payloadResult, "YYYY-MM-DD HH:mm")).toBe("2026-09-15 16:45");
  });

  test("returns null on invalid date or time formats", () => {
    expect(parseDateTime("invalid-date", "10:00")).toBeNull();
    expect(parseDateTime("2026-09-15", "invalid-time")).toBeNull();
  });
});
