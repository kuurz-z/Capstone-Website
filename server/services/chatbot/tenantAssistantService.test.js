import { jest } from "@jest/globals";
import {
  detectTenantWidgetIntent,
  determineTenantSuggestedActions,
  getTenantRuleBasedFallback,
  buildTenantSystemPrompt,
  getTenantStayContext,
} from "./tenantAssistantService.js";
import { User, Contract, Bill, MaintenanceRequest, Reservation } from "../../models/index.js";

describe("tenantAssistantService", () => {
  describe("detectTenantWidgetIntent", () => {
    it("should detect billing_breakdown widget with accurate fallback due dates", () => {
      const mockContext = {
        leaseCycleText: "5th of each month",
        bill: {
          status: "paid",
          totalAmount: 0,
          remainingAmount: 0,
          dueDate: "5th of each month",
        },
      };

      const widget = detectTenantWidgetIntent("when will be my next bill", mockContext);
      expect(widget).not.toBeNull();
      expect(widget.type).toBe("billing_breakdown");
      expect(widget.data.bill.dueDate).toBe("5th of each month");
    });

    it("should detect lease_timeline widget", () => {
      const widget = detectTenantWidgetIntent("how many days left on my contract?");
      expect(widget).not.toBeNull();
      expect(widget.type).toBe("lease_timeline");
    });

    it("should detect maintenance_summary widget", () => {
      const widget = detectTenantWidgetIntent("my aircon is leaking");
      expect(widget).not.toBeNull();
      expect(widget.type).toBe("maintenance_summary");
    });

    it("should detect billing_breakdown widget for penalty and late fee queries", () => {
      const queries = [
        "do I have any penalty?",
        "check penalties",
        "is there a late fee on my account?",
        "magkano multa ko?",
        "why is there a surcharge?",
      ];
      for (const q of queries) {
        const widget = detectTenantWidgetIntent(q);
        expect(widget).not.toBeNull();
        expect(widget.type).toBe("billing_breakdown");
      }
    });
  });

  describe("buildTenantSystemPrompt", () => {
    it("should ground system prompt on individual lease cycle and 15th submeter reading", () => {
      const mockContext = {
        user: { name: "Juan Dela Cruz", branch: "Guadalupe" },
        contract: {
          roomNumber: "304",
          bedLabel: "Bed 1",
          roomType: "Double Sharing",
          monthlyRent: 5500,
          leaseStartDate: "Aug 5, 2026",
          status: "active",
        },
        bill: {
          status: "paid",
          totalAmount: 0,
          remainingAmount: 0,
          dueDate: "5th of each month",
        },
        leaseCycleText: "5th of each month",
      };

      const prompt = buildTenantSystemPrompt(mockContext);
      expect(prompt).toContain("Base monthly rent due dates follow each tenant's individual move-in / lease start date");
      expect(prompt).toContain("Utility/electricity charges follow the monthly 15th submeter reading cycle");
      expect(prompt).not.toContain("due on the 15th of each month");
    });

    it("should include late fee / penalty in statement breakdown", () => {
      const mockContextWithPenalty = {
        user: { name: "Juan Dela Cruz" },
        contract: { roomNumber: "304" },
        bill: {
          status: "unpaid",
          totalAmount: 11250,
          remainingAmount: 11250,
          rentAmount: 5500,
          electricityAmount: 450,
          lateFee: 5000,
          dueDate: "Sep 5, 2026",
        },
      };

      const prompt = buildTenantSystemPrompt(mockContextWithPenalty);
      expect(prompt).toContain("- Late Fee / Penalty: ₱5,000.00");
    });
  });

  describe("getTenantRuleBasedFallback", () => {
    it("should explain next bill accurately when current bill is paid", () => {
      const mockContext = {
        user: { name: "Maria" },
        contract: { leaseStartDate: "Aug 10, 2026" },
        bill: { status: "paid", totalAmount: 0, remainingAmount: 0 },
        leaseCycleText: "10th of each month",
      };

      const reply = getTenantRuleBasedFallback("when will be my next bill", mockContext);
      expect(reply).toContain("already been paid");
      expect(reply).toContain("10th of each month");
      expect(reply).toContain("15th of each month");
    });

    it("should format outstanding amount when bill is unpaid", () => {
      const mockContext = {
        bill: {
          status: "pending",
          totalAmount: 5800,
          remainingAmount: 5800,
          dueDate: "Sep 10, 2026",
        },
      };

      const reply = getTenantRuleBasedFallback("how much is my bill", mockContext);
      expect(reply).toContain("₱5,800.00");
      expect(reply).toContain("Sep 10, 2026");
    });
  });

  describe("determineTenantSuggestedActions", () => {
    it("should provide relevant billing actions", () => {
      const actions = determineTenantSuggestedActions("check my bill", "Here is your statement");
      expect(actions.some((a) => a.url === "/applicant/billing")).toBe(true);
    });
  });

  describe("getTenantStayContext", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("should map canonical charges including penalty and appliances from charges subdocument", async () => {
      const mockUserId = "507f1f77bcf86cd799439011";
      jest.spyOn(User, "findById").mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: mockUserId,
          name: "Juan Dela Cruz",
          email: "juan@example.com",
          role: "tenant",
          branch: "Guadalupe",
        }),
      });
      jest.spyOn(Contract, "findOne").mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: "507f1f77bcf86cd799439022",
            roomNumber: "304",
            bedLabel: "Bed 1",
            monthlyRent: 5500,
            startDate: new Date("2026-08-05"),
            status: "active",
          }),
        }),
      });
      jest.spyOn(Reservation, "findOne").mockReturnValue({
        sort: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(null),
          }),
        }),
      });
      jest.spyOn(Bill, "findOne").mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: "507f1f77bcf86cd799439033",
            charges: {
              rent: 5500,
              electricity: 450,
              water: 0,
              penalty: 5000,
              applianceFees: 300,
            },
            totalAmount: 11250,
            remainingAmount: 11250,
            status: "unpaid",
          }),
        }),
      });
      jest.spyOn(MaintenanceRequest, "find").mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      const context = await getTenantStayContext(mockUserId);
      expect(context).not.toBeNull();
      expect(context.bill.lateFee).toBe(5000);
      expect(context.bill.rentAmount).toBe(5500);
      expect(context.bill.electricityAmount).toBe(450);
      expect(context.bill.applianceCharges).toBe(300);

      const prompt = buildTenantSystemPrompt(context);
      expect(prompt).toContain("- Late Fee / Penalty: ₱5,000.00");
    });
  });
});

