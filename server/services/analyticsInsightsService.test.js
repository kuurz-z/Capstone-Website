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

const hubReportData = {
  filters: { range: "30d", billingRange: "3m", forecastMonths: 3 },
  reports: {
    occupancy: {
      kpis: {
        occupancyRate: 83,
        totalCapacity: 24,
        occupiedBeds: 20,
        availableBeds: 4,
        unavailableBeds: 1,
      },
      series: {
        occupancyTrend: [
          { label: "Apr 27", totalRate: 78 },
          { label: "May 3", totalRate: 83 },
        ],
      },
      tables: {
        roomTypes: [
          {
            roomTypeLabel: "Private",
            occupancyRate: 100,
            occupiedBeds: 4,
            capacity: 4,
          },
        ],
        inventory: {
          rows: [
            {
              roomNumber: "Room 705",
              branch: "gil-puyat",
              occupancyRate: 100,
              availableBeds: 0,
              unavailableBeds: 1,
            },
          ],
        },
      },
    },
    billing: billingReportData,
    operations: {
      kpis: {
        reservations: 6,
        inquiries: 3,
        maintenanceRequests: 5,
        avgResolutionHours: 18,
        slaComplianceRate: 76,
      },
      series: {
        reservationsByPeriod: [{ label: "May 3", count: 6 }],
        maintenanceByType: [{ label: "Plumbing", count: 3 }],
      },
      tables: {
        maintenanceIssues: {
          rows: [
            {
              typeLabel: "Plumbing",
              urgency: "high",
              status: "open",
              branch: "gil-puyat",
              slaState: "delayed",
            },
          ],
        },
        peakInquiryWindows: [{ label: "10:00-12:00", count: 2 }],
      },
    },
    audit: {
      kpis: {
        failedLogins: 12,
        suspiciousIpCount: 2,
        highSeverityActions: 1,
        accessOverrides: 1,
        criticalEvents: 1,
      },
      series: {
        branchSummary: [
          {
            label: "Gil Puyat",
            highSeverityCount: 1,
            accessOverrideCount: 1,
            totalEvents: 5,
          },
        ],
      },
      tables: {
        suspiciousIps: [{ ipAddress: "127.0.0.1", attempts: 8, targetedEmails: ["masked"] }],
        recentSecurityEvents: {
          rows: [{ branch: "gil-puyat", action: "role_update", severity: "high" }],
        },
      },
    },
  },
  forecast: {
    sufficientHistory: true,
    historyMonthsAvailable: 5,
    requiredHistoryMonths: 4,
    projected: [
      {
        label: "Jun 2026",
        projectedOccupancyRate: 87,
        baselineRate: 83,
        seasonalMultiplier: 1.05,
      },
    ],
    insights: {
      headline: "Gil Puyat occupancy is projected to rise next month.",
      recommendations: ["Prepare available rooms before June demand rises."],
    },
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

  test("normalizes Gemini hub responses with risks and forecast highlights", async () => {
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
                    headline: "The AI hub found collection and maintenance risk.",
                    summary: "Occupancy is strong, but overdue balances and delayed maintenance need attention.",
                    keyFindings: ["Occupancy is 83%."],
                    riskAlerts: ["PHP 9,000 is overdue."],
                    forecastHighlights: ["Jun 2026 is projected at 87% occupancy."],
                    recommendedActions: ["Follow up overdue balances first."],
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
      reportType: "hub",
      scope,
      filters: hubReportData.filters,
      reportData: hubReportData,
    });

    expect(result.snapshotMeta).toMatchObject({
      reportType: "hub",
      provider: "gemini",
      usedFallback: false,
    });
    expect(result.insight).toMatchObject({
      riskAlerts: ["PHP 9,000 is overdue."],
      forecastHighlights: ["Jun 2026 is projected at 87% occupancy."],
      confidence: "medium",
    });
  });

  test("builds heuristic hub insight when Gemini is unavailable", async () => {
    process.env.AI_INSIGHTS_PROVIDER = "gemini";
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;

    const result = await generateAnalyticsInsight({
      reportType: "hub",
      scope,
      filters: hubReportData.filters,
      reportData: hubReportData,
      question: "What needs attention?",
    });

    expect(result.snapshotMeta).toMatchObject({
      reportType: "hub",
      provider: "heuristic-fallback",
      usedFallback: true,
    });
    expect(result.insight.riskAlerts.length).toBeGreaterThan(0);
    expect(result.insight.forecastHighlights.length).toBeGreaterThan(0);
    expect(result.insight.summary).toContain("You asked");
  });
});
