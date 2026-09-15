import { describe, expect, test } from "@jest/globals";
import {
  getTenantRuleBasedFallback,
  detectTenantWidgetIntent,
  determineTenantSuggestedActions,
  getSystemPrompt,
} from "./tenantChatbotService.js";

describe("tenant chatbot canonical fallback responses", () => {
  test("billing response reports the canonical status, remaining balance, and utility release state", () => {
    const response = getTenantRuleBasedFallback("What is my current bill?", {
      tenantName: "Ava Guest",
      branch: "Gil Puyat",
      roomNumber: "GP-202",
      currentBill: {
        status: "unpaid",
        statusLabel: "Unpaid",
        rentAmount: 5400,
        electricityAmount: 1800,
        waterAmount: 0,
        applianceAmount: 0,
        penaltyAmount: 0,
        totalAmount: 7200,
        remainingAmount: 7200,
        dueDate: new Date("2026-08-23T00:00:00Z"),
        utilityReleased: true,
      },
    });

    expect(response).toMatch(/Status.*Unpaid/is);
    expect(response).toMatch(/Remaining Balance.*7,200/is);
    expect(response).toMatch(/Utility Schedule.*Released/is);
  });

  test("missing context never fabricates room 304, Bed 1, a due date, or an active contract", () => {
    const billing = getTenantRuleBasedFallback("bill", {
      branch: "Lilycrest Residence",
      roomNumber: null,
      currentBill: null,
    });
    const contract = getTenantRuleBasedFallback("contract", {
      branch: "Lilycrest Residence",
      roomNumber: null,
      contract: null,
      tenancy: { isCurrentResident: false },
    });

    expect(billing).toMatch(/No canonical current-cycle statement/i);
    expect(contract).toMatch(/No tenant-visible canonical Contract/i);
    expect(`${billing}\n${contract}`).not.toMatch(/Room 304|Bed 1|15th of the month|active resident status/i);
  });

  test("known active occupancy answers branch and room without asking for stale move-in facts", () => {
    const response = getTenantRuleBasedFallback("What is my room and move-in status?", {
      branch: "Gil Puyat",
      roomNumber: "GP-202",
      bedPosition: "A-L",
      tenancy: {
        status: "active",
        isCurrentResident: true,
        occupancyStartedAt: new Date("2026-08-13T00:00:00Z"),
        scheduledMoveInDate: new Date("2026-09-01T00:00:00Z"),
      },
    });

    expect(response).toMatch(/Gil Puyat/i);
    expect(response).toMatch(/GP-202/i);
    expect(response).toMatch(/A-L/i);
    expect(response).toMatch(/already moved in|active resident|occupancy.*active/i);
    expect(response).not.toMatch(/when is your move-in|what branch|what room|waiting to move in/i);
    expect(response).not.toMatch(/September 1, 2026/i);
  });
});

describe("tenant chatbot widget intent detection and gating", () => {
  test("applicant context always suppresses monthly billing, lease timeline, and maintenance widgets", () => {
    const applicantContext = {
      isApplicant: true,
      tenantName: "Jane Applicant",
      reservation: { status: "pending" },
    };

    expect(detectTenantWidgetIntent("What is my bill?", applicantContext)).toBeNull();
    expect(detectTenantWidgetIntent("Show my current bill breakdown", applicantContext)).toBeNull();
    expect(detectTenantWidgetIntent("Check my active maintenance ticket", applicantContext)).toBeNull();
    expect(detectTenantWidgetIntent("When does my lease contract expire?", applicantContext)).toBeNull();
  });

  test("generic messages and general policy questions do not trigger billing or maintenance widgets", () => {
    const tenantContext = {
      isApplicant: false,
      tenantName: "John Resident",
      roomNumber: "101",
    };

    expect(detectTenantWidgetIntent("Hello, how are you?", tenantContext)).toBeNull();
    expect(detectTenantWidgetIntent("What time does the main gate close at night?", tenantContext)).toBeNull();
    expect(detectTenantWidgetIntent("Is high-speed wifi available on the second floor?", tenantContext)).toBeNull();
    expect(detectTenantWidgetIntent("Tell me about the onboarding process.", tenantContext)).toBeNull();
  });

  test("explicit billing queries from active tenants trigger billing_breakdown", () => {
    const tenantContext = {
      isApplicant: false,
      tenantName: "John Resident",
      roomNumber: "101",
      currentBill: { totalAmount: 5000 },
    };

    expect(detectTenantWidgetIntent("Can you show my current monthly bill breakdown?", tenantContext)).toBe("billing_breakdown");
    expect(detectTenantWidgetIntent("What is my electricity share this month?", tenantContext)).toBe("billing_breakdown");
    expect(detectTenantWidgetIntent("When is my payment due date?", tenantContext)).toBe("billing_breakdown");
    expect(detectTenantWidgetIntent("What is my unpaid bill balance?", tenantContext)).toBe("billing_breakdown");
  });

  test("determineTenantSuggestedActions returns tenant actions for active tenant even if reservation exists", () => {
    const tenantContext = {
      isApplicant: false,
      userRole: "tenant",
      tenantName: "Maria Santos",
      reservation: { status: "moveIn" },
      contract: null,
      tenancy: { isCurrentResident: true, status: "active" },
    };

    const actions = determineTenantSuggestedActions("Help me with dorm info", "", tenantContext);
    expect(actions).toEqual([
      { label: "My Bills", url: "/applicant/billing" },
      { label: "My Contract", url: "/applicant/contracts" },
      { label: "Maintenance Portal", url: "/applicant/maintenance" },
      { label: "House Rules", prompt: "What are the building curfew hours and visitor policies?" },
    ]);
  });

  test("penalty inquiries from active tenants trigger billing_breakdown", () => {
    const tenantContext = {
      isApplicant: false,
      tenantName: "John Resident",
      roomNumber: "101",
      currentBill: { totalAmount: 5000 },
    };

    expect(detectTenantWidgetIntent("how much is my penalty fee?", tenantContext)).toBe("billing_breakdown");
    expect(detectTenantWidgetIntent("meron ba akong multa?", tenantContext)).toBe("billing_breakdown");
    expect(detectTenantWidgetIntent("pero sa penalty siya", tenantContext)).toBe("billing_breakdown");
    expect(detectTenantWidgetIntent("do I have any late fee?", tenantContext)).toBe("billing_breakdown");
    expect(detectTenantWidgetIntent("check my surcharge", tenantContext)).toBe("billing_breakdown");
    expect(detectTenantWidgetIntent("late payment penalty inquiry", tenantContext)).toBe("billing_breakdown");
  });
});

describe("tenant chatbot system prompt grounding", () => {
  test("active tenant prompt includes outstanding balance and penalty fees breakdown", () => {
    const contextSnapshot = {
      isApplicant: false,
      branch: "Gil Puyat",
      roomNumber: "GP-202",
      bedPosition: "A-L",
      tenantName: "Ava Guest",
      billingSummary: {
        totalOutstandingBalance: 50000,
        unpaidStatementsCount: 1,
        hasPendingBalance: true,
        totalPenaltyDue: 50000,
      },
      unpaidBills: [
        {
          billingPeriod: "March 2026 - Late Penalty",
          billType: "penalty",
          remainingAmount: 50000,
          penaltyAmount: 50000,
          status: "unpaid",
        },
      ],
    };

    const prompt = getSystemPrompt(contextSnapshot);

    expect(prompt).toContain("OUTSTANDING BALANCE & PENALTY FEES:");
    expect(prompt).toContain("Total Outstanding Balance: ₱50,000.00 (1 unpaid statements)");
    expect(prompt).toContain("Total Penalty Charges Due: ₱50,000.00");
    expect(prompt).toContain("Type: PENALTY, Amount Due: ₱50,000, Penalty: ₱50,000, Status: UNPAID");
    expect(prompt).toContain("BILLING & PENALTY INSTRUCTION RULES:");
    expect(prompt).toMatch(/NEVER tell a tenant their bill is paid or that they have 0 penalty if Total Outstanding Balance > 0 or Total Penalty Charges Due > 0/);
  });

  test("active tenant prompt formats zero outstanding balance and penalty fees when none exist", () => {
    const contextSnapshot = {
      isApplicant: false,
      branch: "Gil Puyat",
      roomNumber: "GP-202",
      billingSummary: {
        totalOutstandingBalance: 0,
        unpaidStatementsCount: 0,
        hasPendingBalance: false,
        totalPenaltyDue: 0,
      },
      unpaidBills: [],
    };

    const prompt = getSystemPrompt(contextSnapshot);

    expect(prompt).toContain("Total Outstanding Balance: ₱0.00 (0 unpaid statements)");
    expect(prompt).toContain("Total Penalty Charges Due: ₱0.00");
    expect(prompt).toContain("* No unpaid statements");
  });
});

