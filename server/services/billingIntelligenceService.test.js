import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

const {
  buildBillingIntelligenceSnapshot,
  generateBillingIntelligence,
} = await import("./billingIntelligenceService.js");

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

const baseSnapshot = {
  utilityType: "electricity",
  room: { name: "Room 201", branch: "gil-puyat", type: "quadruple-sharing" },
  period: {
    id: "period-1",
    status: "closed",
    startDate: "2026-04-15",
    endDate: "2026-05-15",
    startReading: 100,
    endReading: 160,
    ratePerUnit: 15,
    computedTotalUsage: 60,
    computedTotalCost: 900,
    verified: true,
    revised: false,
    billingState: "ready_to_send",
    billingLabel: "Ready to Send",
  },
  validation: {
    state: "ok",
    canSendBill: true,
    reviewRequired: false,
    issues: [],
  },
  anomaly: {
    riskLevel: "none",
    score: 0,
    confidence: "medium",
    reasons: [],
    metrics: {
      totalKwh: 60,
      occupiedTenantDays: 120,
      kwhPerTenantDay: 0.5,
    },
  },
  forecast: null,
  tenantSummary: {
    count: 2,
    totalUsage: 60,
    totalBillAmount: 900,
    usagePerTenantDay: 0.5,
    allocationRules: ["segment-based"],
  },
  previousPeriodComparison: null,
};

describe("billingIntelligenceService", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  test("uses Gemini when configured and normalizes structured billing insight", async () => {
    process.env.AI_INSIGHTS_PROVIDER = "gemini";
    process.env.GOOGLE_AI_API_KEY = "google-ai-test-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash-lite";
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    headline: "Electricity cycle is ready for admin review.",
                    summary:
                      "Validation is clear and the period can be reviewed before sending.",
                    riskLevel: "low",
                    keyFindings: ["No deterministic validation block is present."],
                    recommendedActions: ["Confirm readings before sending bills."],
                    riskDrivers: ["Validation and anomaly checks are clear."],
                    reviewChecklist: ["Confirm source readings before publishing."],
                    disputePreventionNote:
                      "Reviewing readings before publishing makes tenant questions easier to answer.",
                    tenantExplanationDraft:
                      "This electricity charge is based on recorded readings and room allocation rules.",
                    confidence: "medium",
                  }),
                },
              ],
            },
          },
        ],
      }),
    }));

    const result = await generateBillingIntelligence(baseSnapshot);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("gemini-2.5-flash-lite:generateContent"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.insight).toMatchObject({
      provider: "gemini",
      usedFallback: false,
      riskLevel: "low",
      confidence: "medium",
      riskDrivers: ["Validation and anomaly checks are clear."],
      reviewChecklist: ["Confirm source readings before publishing."],
      disputePreventionNote:
        "Reviewing readings before publishing makes tenant questions easier to answer.",
      tenantExplanationDraft:
        "This electricity charge is based on recorded readings and room allocation rules.",
    });
  });

  test("normalizes Gemini output when optional v2 fields are missing", async () => {
    process.env.AI_INSIGHTS_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-key";
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    headline: "Electricity cycle has no major issue.",
                    summary: "The period has enough data for a basic review.",
                    riskLevel: "low",
                    keyFindings: ["No deterministic validation block is present."],
                    recommendedActions: ["Confirm readings before sending bills."],
                    confidence: "medium",
                  }),
                },
              ],
            },
          },
        ],
      }),
    }));

    const result = await generateBillingIntelligence(baseSnapshot);

    expect(result.insight.provider).toBe("gemini");
    expect(result.insight.riskDrivers).toEqual([
      "No deterministic validation block is present.",
    ]);
    expect(result.insight.reviewChecklist).toEqual([
      "Confirm readings before sending bills.",
    ]);
    expect(result.insight.disputePreventionNote).toEqual(expect.any(String));
    expect(result.insight.tenantExplanationDraft).toEqual(expect.any(String));
  });

  test("falls back when Gemini is configured but missing a key", async () => {
    process.env.AI_INSIGHTS_PROVIDER = "gemini";
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
    global.fetch = jest.fn();

    const result = await generateBillingIntelligence(baseSnapshot);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.insight.provider).toBe("heuristic-fallback");
    expect(result.insight.usedFallback).toBe(true);
    expect(result.fallbackReason).toContain("GOOGLE_AI_API_KEY");
    expect(result.insight.reviewChecklist.length).toBeGreaterThan(0);
    expect(result.insight.disputePreventionNote).toEqual(expect.any(String));
  });

  test("falls back when Gemini returns invalid JSON", async () => {
    process.env.AI_INSIGHTS_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-key";
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "not json" }] } }],
      }),
    }));

    const result = await generateBillingIntelligence(baseSnapshot);

    expect(result.insight.provider).toBe("heuristic-fallback");
    expect(result.insight.usedFallback).toBe(true);
    expect(result.insight.headline).toEqual(expect.any(String));
    expect(result.insight.riskDrivers.length).toBeGreaterThan(0);
    expect(result.insight.tenantExplanationDraft).toEqual(expect.any(String));
  });

  test("builds a compact snapshot without tenant email or sensitive fields", () => {
    const snapshot = buildBillingIntelligenceSnapshot({
      room: {
        name: "Room 201",
        branch: "gil-puyat",
        type: "quadruple-sharing",
      },
      period: {
        _id: "period-1",
        utilityType: "electricity",
        status: "closed",
        startDate: "2026-04-01",
        endDate: "2026-04-30",
        startReading: 100,
        endReading: 120,
        ratePerUnit: 15,
        computedTotalUsage: 20,
        computedTotalCost: 300,
        privateNotes: "Do not send private notes",
        paymentProofUrl: "https://example.com/proof.jpg",
        uploadedFiles: [{ url: "https://example.com/private.pdf" }],
        tenantSummaries: [
          {
            tenantName: "Sensitive Name",
            tenantEmail: "tenant@example.com",
            totalUsage: 12,
            billAmount: 180,
            coveredDays: 30,
            allocationRule: "segment-based",
            privateNotes: "Sensitive tenant note",
          },
        ],
      },
      periods: [
        {
          _id: "period-0",
          utilityType: "electricity",
          status: "closed",
          startDate: "2026-03-01",
          endDate: "2026-03-31",
          startReading: 80,
          endReading: 90,
          ratePerUnit: 15,
          computedTotalUsage: 10,
          computedTotalCost: 150,
          tenantSummaries: [{ totalUsage: 10, billAmount: 150, coveredDays: 30 }],
        },
        {
          _id: "period-1",
          utilityType: "electricity",
          status: "closed",
          startDate: "2026-04-01",
          endDate: "2026-04-30",
          computedTotalUsage: 20,
          computedTotalCost: 300,
          tenantSummaries: [{ totalUsage: 12, billAmount: 180, coveredDays: 30 }],
        },
      ],
      electricityReview: {
        validationState: "warning",
        canSendBill: true,
        reviewRequired: true,
        dataQualityIssues: [
          {
            code: "missing_move_in_reading",
            severity: "warning",
            message: "Missing move-in electricity reading.",
            tenantEmail: "tenant@example.com",
            privateNotes: "Sensitive validation note",
          },
        ],
        anomalyReview: {
          riskLevel: "low",
          score: 10,
          confidence: "low",
          reasons: [],
          metrics: {},
        },
        forecast: null,
      },
      billingState: "ready_to_send",
      billingLabel: "Ready to Send",
    });

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("tenant@example.com");
    expect(serialized).not.toContain("Sensitive Name");
    expect(serialized).not.toContain("Do not send private notes");
    expect(serialized).not.toContain("proof.jpg");
    expect(serialized).not.toContain("private.pdf");
    expect(snapshot.tenantSummary).toMatchObject({
      count: 1,
      totalUsage: 12,
      totalBillAmount: 180,
    });
    expect(snapshot.previousPeriodComparison).toMatchObject({
      previousPeriodId: "period-0",
      currentTotalKwh: 20,
      previousTotalKwh: 10,
      usageDeltaPercent: 100,
    });
  });

  test("heuristic fallback gives blocked periods dispute-focused review fields", async () => {
    process.env.AI_INSIGHTS_PROVIDER = "heuristic";
    const result = await generateBillingIntelligence({
      ...baseSnapshot,
      period: {
        ...baseSnapshot.period,
        billingState: "blocked",
        billingLabel: "Blocked",
      },
      validation: {
        state: "blocked",
        canSendBill: false,
        reviewRequired: true,
        issues: [
          {
            code: "negative_usage",
            severity: "blocked",
            message: "End reading is lower than start reading.",
          },
        ],
      },
      anomaly: {
        ...baseSnapshot.anomaly,
        riskLevel: "high",
        confidence: "high",
        reasons: [
          {
            code: "usage_spike",
            severity: "warning",
            message: "Usage is unusually high.",
          },
        ],
      },
    });

    expect(result.insight.riskLevel).toBe("blocked");
    expect(result.insight.riskDrivers).toEqual(
      expect.arrayContaining(["Deterministic validation is blocking this period."]),
    );
    expect(result.insight.reviewChecklist.join(" ")).toContain(
      "deterministic validation issue",
    );
    expect(result.insight.disputePreventionNote).toContain(
      "resolve the deterministic billing issues",
    );
  });

  test("heuristic fallback treats open-period forecast as advisory", async () => {
    process.env.AI_INSIGHTS_PROVIDER = "heuristic";
    const result = await generateBillingIntelligence({
      ...baseSnapshot,
      period: {
        ...baseSnapshot.period,
        status: "open",
        billingState: "open",
        billingLabel: "Open",
        endReading: null,
      },
      forecast: {
        projectedKwh: 80,
        projectedCharge: 1200,
        projectedEndReading: 180,
        confidence: "low",
        basedOn: "current open-period pace",
        drivers: ["partial reading"],
      },
    });

    expect(result.insight.keyFindings.join(" ")).toContain(
      "Open-period forecast",
    );
    expect(result.insight.recommendedActions.join(" ")).toContain(
      "early warning only",
    );
    expect(["low", "medium"]).toContain(result.insight.confidence);
  });
});
