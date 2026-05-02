import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

const { generateAnalyticsInsight } = await import("./analyticsInsightsService.js");

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

const scope = {
  role: "owner",
  branch: "all",
  branchesIncluded: ["gil-puyat", "recto"],
};

const billingReportData = {
  filters: { range: "3m" },
  kpis: {
    billedAmount: 50000,
    collectedRevenue: 36000,
    outstandingBalance: 14000,
    overdueAmount: 9000,
    collectionRate: 72,
  },
  series: {
    revenueByMonth: [
      {
        label: "Feb 2026",
        billedAmount: 20000,
        collectedRevenue: 18000,
        outstandingBalance: 2000,
      },
      {
        label: "Mar 2026",
        billedAmount: 30000,
        collectedRevenue: 18000,
        outstandingBalance: 12000,
      },
    ],
    overdueAging: [{ label: "31-60 days", count: 3, amount: 6000 }],
  },
  tables: {
    unpaidBalances: [
      {
        roomName: "Room 201",
        branch: "gil-puyat",
        balance: 7000,
        daysOverdue: 45,
        status: "overdue",
      },
    ],
  },
};

describe("generateAnalyticsInsight", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  test("uses Gemini when configured and returns provider metadata", async () => {
    process.env.AI_INSIGHTS_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    headline: "Collections need owner attention this month.",
                    summary:
                      "The collection rate is below target while overdue balances are concentrated in visible unpaid rooms.",
                    keyFindings: [
                      "Collection rate is 72%.",
                      "Room 201 has the largest visible balance.",
                    ],
                    anomalies: ["Overdue balances remain material."],
                    recommendedActions: [
                      "Prioritize follow-up on the largest overdue balances.",
                    ],
                    confidence: "medium",
                  }),
                },
              ],
            },
          },
        ],
      }),
    }));

    const result = await generateAnalyticsInsight({
      reportType: "billing",
      scope,
      filters: billingReportData.filters,
      reportData: billingReportData,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("gemini-2.5-flash:generateContent"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.snapshotMeta).toMatchObject({
      provider: "gemini",
      usedFallback: false,
      model: "gemini-2.5-flash",
    });
    expect(result.insight).toMatchObject({
      headline: "Collections need owner attention this month.",
      confidence: "medium",
    });
  });

  test("falls back to heuristic when Gemini is not configured", async () => {
    process.env.AI_INSIGHTS_PROVIDER = "gemini";
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
    global.fetch = jest.fn();

    const result = await generateAnalyticsInsight({
      reportType: "billing",
      scope,
      filters: billingReportData.filters,
      reportData: billingReportData,
      question: "What should we do?",
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.snapshotMeta).toMatchObject({
      provider: "heuristic-fallback",
      usedFallback: true,
      model: null,
    });
    expect(result.snapshotMeta.fallbackReason).toContain("GOOGLE_AI_API_KEY");
    expect(result.insight.summary).toContain("You asked");
  });

  test("uses existing GOOGLE_AI_API_KEY when GEMINI_API_KEY is not set", async () => {
    process.env.AI_INSIGHTS_PROVIDER = "gemini";
    delete process.env.GEMINI_API_KEY;
    process.env.GOOGLE_AI_API_KEY = "google-ai-test-key";
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    headline: "The report has enough data for planning.",
                    summary:
                      "The branch summary can be reviewed with current billing and collection metrics.",
                    keyFindings: ["Existing Google AI key was accepted."],
                    anomalies: [],
                    recommendedActions: ["Review the report insight before taking action."],
                    confidence: "medium",
                  }),
                },
              ],
            },
          },
        ],
      }),
    }));

    const result = await generateAnalyticsInsight({
      reportType: "billing",
      scope,
      filters: billingReportData.filters,
      reportData: billingReportData,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("key=google-ai-test-key"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.snapshotMeta).toMatchObject({
      provider: "gemini",
      usedFallback: false,
    });
  });

  test("falls back to heuristic when Gemini returns invalid JSON", async () => {
    process.env.AI_INSIGHTS_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-key";
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: "not json" }],
            },
          },
        ],
      }),
    }));

    const result = await generateAnalyticsInsight({
      reportType: "billing",
      scope,
      filters: billingReportData.filters,
      reportData: billingReportData,
    });

    expect(result.snapshotMeta.provider).toBe("heuristic-fallback");
    expect(result.snapshotMeta.usedFallback).toBe(true);
    expect(result.snapshotMeta.fallbackReason).toBeTruthy();
    expect(result.insight.headline).toEqual(expect.any(String));
  });
});
