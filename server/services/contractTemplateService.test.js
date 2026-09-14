import { describe, expect, test } from "@jest/globals";
import {
  OFFICIAL_CONTRACT_TEMPLATE_REGISTRY,
  OFFICIAL_CONTRACT_TEMPLATES,
  createTemplateRegistry,
} from "../config/contractTemplateRegistry.js";
import {
  checkOfficialTemplateIntegrity,
  getOfficialTemplateConfig,
  normalizeLeaseType,
  resolveContractTemplate,
  validateLeaseDuration,
  validateOfficialPricing,
} from "./contractTemplateService.js";

const dates = (months) => ({
  leaseStartDate: new Date("2026-01-01T00:00:00.000Z"),
  leaseEndDate: new Date(Date.UTC(2026, months, 1)),
  leaseDurationMonths: months,
  leaseType: months < 6 ? "short-term" : "long-term",
});

describe("official Contract template registry", () => {
  test("registers exactly six unique official template IDs", () => {
    expect(OFFICIAL_CONTRACT_TEMPLATES).toHaveLength(6);
    expect([...OFFICIAL_CONTRACT_TEMPLATE_REGISTRY.keys()]).toEqual([
      "private-short-term",
      "private-long-term",
      "double-sharing-short-term",
      "double-sharing-long-term",
      "quadruple-sharing-short-term",
      "quadruple-sharing-long-term",
    ]);
  });

  test("rejects a duplicate template ID", () => {
    expect(() => createTemplateRegistry([
      OFFICIAL_CONTRACT_TEMPLATES[0],
      OFFICIAL_CONTRACT_TEMPLATES[0],
    ])).toThrow(expect.objectContaining({ code: "DUPLICATE_CONTRACT_TEMPLATE_ID" }));
  });

  test("detects a missing master template", async () => {
    const missing = {
      ...OFFICIAL_CONTRACT_TEMPLATES[0],
      sourceFilePath: "missing/official-template.pdf",
    };
    const result = await checkOfficialTemplateIntegrity([missing]);
    expect(result.valid).toBe(false);
    expect(result.results[0].code).toBe("CONTRACT_TEMPLATE_FILE_MISSING");
  });

  test("does not select an inactive template", () => {
    const inactive = { ...OFFICIAL_CONTRACT_TEMPLATES[0], active: false };
    const registry = createTemplateRegistry([inactive]);
    expect(() => getOfficialTemplateConfig(inactive.templateId, registry)).toThrow(
      expect.objectContaining({ code: "CONTRACT_TEMPLATE_INACTIVE" }),
    );
  });

  test("all official template files pass PDF and checksum integrity", async () => {
    const result = await checkOfficialTemplateIntegrity();
    expect(result.valid).toBe(true);
    expect(result.results).toHaveLength(6);
  });
});

describe("lease normalization and duration validation", () => {
  test.each([
    ["short-term", "short-term"],
    ["short_term", "short-term"],
    ["short term", "short-term"],
    ["short", "short-term"],
    ["monthly", "short-term"],
    ["1-5 months", "short-term"],
    ["long-term", "long-term"],
    ["long_term", "long-term"],
    ["long term", "long-term"],
    ["long", "long-term"],
    ["6 months", "long-term"],
    ["6+ months", "long-term"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeLeaseType(input)).toBe(expected);
  });

  test.each([1, 5, 6, 12])("accepts a consistent %i-month lease", (months) => {
    expect(validateLeaseDuration(dates(months))).toEqual({
      leaseType: months < 6 ? "short-term" : "long-term",
      durationMonths: months,
    });
  });

  test("rejects short-term classification at six months", () => {
    expect(() => validateLeaseDuration({ ...dates(6), leaseType: "short-term" }))
      .toThrow(expect.objectContaining({ code: "LEASE_TYPE_DURATION_MISMATCH" }));
  });

  test("rejects long-term classification at five months", () => {
    expect(() => validateLeaseDuration({ ...dates(5), leaseType: "long-term" }))
      .toThrow(expect.objectContaining({ code: "LEASE_TYPE_DURATION_MISMATCH" }));
  });

  test("rejects missing and reversed dates", () => {
    expect(() => validateLeaseDuration({ leaseType: "short-term", leaseDurationMonths: 1 }))
      .toThrow(expect.objectContaining({ code: "LEASE_DATES_REQUIRED" }));
    expect(() => validateLeaseDuration({
      leaseType: "short-term",
      leaseDurationMonths: 1,
      leaseStartDate: new Date("2026-02-01"),
      leaseEndDate: new Date("2026-01-01"),
    })).toThrow(expect.objectContaining({ code: "LEASE_DATE_RANGE_INVALID" }));
  });

  test("rejects stored duration conflicting with dates", () => {
    expect(() => validateLeaseDuration({ ...dates(5), leaseDurationMonths: 4 }))
      .toThrow(expect.objectContaining({ code: "LEASE_DURATION_CONFLICT" }));
  });

  // Promotional pricing thresholds do not change official legal template bounds.
  describe("legal duration independent of pricing threshold", () => {
    test("a 6-month lease is legally long-term with a 10-month pricing threshold", () => {
      expect(validateLeaseDuration({ ...dates(6), leaseType: "long-term", longTermLeaseMinMonths: 10 }))
        .toEqual({ leaseType: "long-term", durationMonths: 6 });
    });

    test("rejects a 6-month lease misclassified as short-term regardless of pricing", () => {
      expect(() => validateLeaseDuration({ ...dates(6), leaseType: "short-term", longTermLeaseMinMonths: 10 }))
        .toThrow(expect.objectContaining({ code: "LEASE_TYPE_DURATION_MISMATCH" }));
    });

    test("a 10-month lease is long-term when the configured threshold is 10", () => {
      expect(validateLeaseDuration({ ...dates(10), leaseType: "long-term", longTermLeaseMinMonths: 10 }))
        .toEqual({ leaseType: "long-term", durationMonths: 10 });
    });

    test("falls back to the default 6-month threshold when none is provided", () => {
      expect(validateLeaseDuration({ ...dates(6), leaseType: "long-term" }))
        .toEqual({ leaseType: "long-term", durationMonths: 6 });
    });
  });
});

describe("official template selection", () => {
  test.each([
    ["gil-puyat", "private", 1, "private-short-term"],
    ["gil-puyat", "private", 6, "private-long-term"],
    ["gil-puyat", "double-sharing", 1, "double-sharing-short-term"],
    ["gil-puyat", "double-sharing", 6, "double-sharing-long-term"],
    ["gil-puyat", "quadruple-sharing", 1, "quadruple-sharing-short-term"],
    ["gil-puyat", "quadruple-sharing", 6, "quadruple-sharing-long-term"],
    ["guadalupe", "quadruple-sharing", 1, "quadruple-sharing-short-term"],
    ["guadalupe", "quadruple-sharing", 6, "quadruple-sharing-long-term"],
  ])("selects %s %s %i-month template", (branch, roomType, months, expected) => {
    expect(resolveContractTemplate({ branch, roomType, ...dates(months) }).templateId).toBe(expected);
  });

  test("selects the long-term legal template for a 6-month lease with pricing threshold 10", () => {
    const template = resolveContractTemplate({
      branch: "gil-puyat",
      roomType: "private",
      ...dates(6),
      leaseType: "long-term",
      longTermLeaseMinMonths: 10,
    });
    expect(template.templateId).toBe("private-long-term");
  });

  test.each(["private", "double-sharing"])("rejects Guadalupe %s templates", (roomType) => {
    expect(() => resolveContractTemplate({
      branch: "guadalupe", roomType, ...dates(1),
    })).toThrow(expect.objectContaining({ code: "ROOM_TYPE_NOT_ALLOWED_FOR_BRANCH" }));
  });

  test("rejects a frontend template override mismatch", () => {
    expect(() => resolveContractTemplate({
      branch: "gil-puyat",
      roomType: "private",
      ...dates(1),
      requestedTemplateId: "double-sharing-short-term",
    })).toThrow(expect.objectContaining({ code: "CONTRACT_TEMPLATE_MISMATCH" }));
  });
});

describe("official pricing validation", () => {
  const template = OFFICIAL_CONTRACT_TEMPLATE_REGISTRY.get("private-short-term");
  const exact = {
    regularMonthlyRate: 16000,
    discountPercentage: 10,
    discountAmount: 1600,
    approvedMonthlyRate: 14400,
    advanceRentAmount: 14400,
    securityDepositAmount: 14400,
    reservationFeeAmount: 2000,
    reservationFeeCreditAmount: 2000,
    pricingApprovedBy: "admin-1",
    pricingApprovedAt: new Date("2026-01-01"),
  };

  test("exact official pricing passes", () => {
    expect(validateOfficialPricing(template, exact)).toEqual(expect.objectContaining({
      valid: true,
      code: "PRICING_VALID",
    }));
  });

  test("missing approved rate fails", () => {
    expect(validateOfficialPricing(template, { ...exact, approvedMonthlyRate: null }).code)
      .toBe("APPROVED_PRICING_MISSING");
  });

  test.each([
    ["regularMonthlyRate", 1, "APPROVED_PRICING_CONFLICT"],
    ["advanceRentAmount", 1, "PRICING_VALID"],
    ["securityDepositAmount", 1, "PRICING_VALID"],
    ["reservationFeeAmount", 1, "PRICING_VALID"],
  ])("validates approved %s independently of template defaults", (field, value, code) => {
    expect(validateOfficialPricing(template, { ...exact, [field]: value }).code).toBe(code);
  });

  test("special approved rate requires review", () => {
    expect(validateOfficialPricing(template, { ...exact, approvedMonthlyRate: 14000 }))
      .toEqual(expect.objectContaining({
        valid: false,
        code: "APPROVED_PRICING_CONFLICT",
      }));
  });

  test("zero percent discount is valid when the approved rate is unchanged", () => {
    expect(validateOfficialPricing(template, {
      ...exact,
      discountPercentage: 0,
      discountAmount: 0,
      approvedMonthlyRate: 16000,
    })).toEqual(expect.objectContaining({ valid: true, code: "PRICING_VALID" }));
  });
});
