import { describe, expect, test } from "@jest/globals";
import { buildElectricityReview } from "./electricityReviewRules.js";

const roomId = "room-1";

function period(overrides = {}) {
  return {
    _id: overrides._id || "period-current",
    utilityType: "electricity",
    roomId,
    status: "closed",
    startDate: "2026-01-01T00:00:00.000Z",
    endDate: "2026-01-31T00:00:00.000Z",
    startReading: 1000,
    endReading: 1120,
    ratePerUnit: 12,
    computedTotalUsage: 120,
    verified: true,
    tenantSummaries: [
      {
        tenantId: "tenant-1",
        tenantName: "Ana Santos",
        totalUsage: 120,
        coveredDays: 30,
        billAmount: 1440,
      },
    ],
    ...overrides,
  };
}

describe("buildElectricityReview", () => {
  test("uses tenant history to flag tenant-level consumption spikes", () => {
    const currentPeriod = period({
      endReading: 1240,
      computedTotalUsage: 240,
      tenantSummaries: [
        {
          tenantId: "tenant-1",
          tenantName: "Ana Santos",
          totalUsage: 240,
          coveredDays: 30,
          billAmount: 2880,
        },
      ],
    });
    const history = [
      period({
        _id: "period-old-1",
        startDate: "2025-11-01T00:00:00.000Z",
        endDate: "2025-11-30T00:00:00.000Z",
        startReading: 800,
        endReading: 890,
        computedTotalUsage: 90,
        tenantSummaries: [
          {
            tenantId: "tenant-1",
            tenantName: "Ana Santos",
            totalUsage: 90,
            coveredDays: 30,
            billAmount: 1080,
          },
        ],
      }),
      period({
        _id: "period-old-2",
        startDate: "2025-12-01T00:00:00.000Z",
        endDate: "2025-12-31T00:00:00.000Z",
        startReading: 890,
        endReading: 980,
        computedTotalUsage: 90,
        tenantSummaries: [
          {
            tenantId: "tenant-1",
            tenantName: "Ana Santos",
            totalUsage: 90,
            coveredDays: 30,
            billAmount: 1080,
          },
        ],
      }),
    ];

    const review = buildElectricityReview({
      period: currentPeriod,
      periods: [...history, currentPeriod],
    });

    expect(review.validationState).toBe("ok");
    expect(review.reviewRequired).toBe(true);
    expect(review.anomalyReview.riskLevel).toBe("high");
    expect(review.anomalyReview.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "tenant_spike", tenantId: "tenant-1" }),
      ]),
    );
  });

  test("lowers confidence for new tenants instead of forcing a spike", () => {
    const currentPeriod = period({
      tenantSummaries: [
        {
          tenantId: "tenant-new",
          tenantName: "New Tenant",
          totalUsage: 100,
          coveredDays: 30,
          billAmount: 1200,
        },
      ],
    });
    const history = [
      period({
        _id: "period-old",
        tenantSummaries: [
          {
            tenantId: "tenant-other",
            tenantName: "Other Tenant",
            totalUsage: 90,
            coveredDays: 30,
            billAmount: 1080,
          },
        ],
      }),
    ];

    const review = buildElectricityReview({
      period: currentPeriod,
      periods: [...history, currentPeriod],
    });

    expect(review.anomalyReview.confidence).toBe("low");
    expect(review.anomalyReview.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "new_tenant_low_confidence" }),
      ]),
    );
  });

  test("blocks mathematically unsafe reading decreases", () => {
    const review = buildElectricityReview({
      period: period({
        startReading: 1200,
        endReading: 1100,
      }),
    });

    expect(review.validationState).toBe("blocked");
    expect(review.canSendBill).toBe(false);
    expect(review.dataQualityIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "reading_decreased" }),
      ]),
    );
  });

  test("forecasts open periods from current run rate", () => {
    const openPeriod = period({
      _id: "period-open",
      status: "open",
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: null,
      startReading: 1000,
      endReading: null,
      computedTotalUsage: 0,
      tenantSummaries: [],
    });

    const review = buildElectricityReview({
      period: openPeriod,
      periods: [openPeriod],
      readings: [
        {
          reading: 1050,
          date: "2026-01-11T00:00:00.000Z",
        },
      ],
    });

    expect(review.forecast).toMatchObject({
      basedOn: "current_run_rate",
      confidence: "medium",
    });
    expect(review.forecast.projectedKwh).toBeGreaterThan(50);
    expect(review.forecast.projectedCharge).toBeGreaterThan(600);
  });
});

