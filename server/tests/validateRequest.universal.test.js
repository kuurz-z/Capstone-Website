import { describe, it, expect, jest } from "@jest/globals";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  updateUserSchema,
  createRoomSchema,
  updateRoomSchema,
  createViolationSchema,
  updateViolationSchema,
} from "../validation/zodSchemas.js";

describe("Universal Zod Validation Suite", () => {
  describe("updateUserSchema", () => {
    it("validates valid user update data including middleName, civilStatus, nationality, occupation, and emergencyRelationship", () => {
      const result = updateUserSchema.safeParse({
        firstName: "John",
        middleName: "Protacio",
        lastName: "Doe",
        email: "john.doe@example.com",
        phone: "09171234567",
        gender: "male",
        civilStatus: "single",
        nationality: "Filipino",
        occupation: "Engineer",
        emergencyContact: "Jane Doe",
        emergencyRelationship: "parent",
        emergencyPhone: "09181234567",
      });
      expect(result.success).toBe(true);
      expect(result.data.middleName).toBe("Protacio");
      expect(result.data.civilStatus).toBe("single");
      expect(result.data.nationality).toBe("Filipino");
      expect(result.data.occupation).toBe("Engineer");
      expect(result.data.emergencyRelationship).toBe("parent");
    });

    it("rejects invalid email", () => {
      const result = updateUserSchema.safeParse({
        email: "not-an-email",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("createRoomSchema & updateRoomSchema", () => {
    it("validates valid room creation with all fields", () => {
      const result = createRoomSchema.safeParse({
        name: "Quad Sharing Room",
        roomNumber: "101",
        branch: "gil-puyat",
        type: "quadruple-sharing",
        capacity: 4,
        price: 4500,
        floor: 1,
        description: "Spacious quad sharing room on the first floor",
        amenities: ["Air Conditioning", "WiFi", "Study Desk"],
        policies: ["No smoking", "Quiet hours after 10 PM"],
        intendedTenant: "Students / Young Professionals",
        images: ["https://example.com/room101.jpg"],
        isPopular: true,
        beds: [
          { id: "bed-1", position: "upper", status: "available" },
          { id: "bed-2", position: "lower", status: "available" },
          { id: "bed-3", position: "upper", status: "available" },
          { id: "bed-4", position: "lower", status: "maintenance" },
        ],
      });
      expect(result.success).toBe(true);
      expect(result.data.name).toBe("Quad Sharing Room");
      expect(result.data.price).toBe(4500);
      expect(result.data.beds).toHaveLength(4);
      expect(result.data.isPopular).toBe(true);
      expect(result.data.amenities).toEqual(["Air Conditioning", "WiFi", "Study Desk"]);
    });

    it("transforms baseRate into price and sets default values", () => {
      const result = createRoomSchema.safeParse({
        name: "Private Deluxe Room",
        roomNumber: "201",
        branch: "guadalupe",
        type: "private",
        capacity: 1,
        baseRate: 8500,
      });
      expect(result.success).toBe(true);
      expect(result.data.price).toBe(8500);
      expect(result.data.floor).toBe(1);
      expect(result.data.description).toBe("");
      expect(result.data.amenities).toEqual([]);
      expect(result.data.policies).toEqual([]);
      expect(result.data.images).toEqual([]);
      expect(result.data.isPopular).toBe(false);
    });

    it("rejects room creation when neither price nor baseRate is provided", () => {
      const result = createRoomSchema.safeParse({
        name: "Standard Quad Room",
        roomNumber: "101",
        branch: "gil-puyat",
        type: "quadruple-sharing",
        capacity: 4,
      });
      expect(result.success).toBe(false);
      const issues = result.error.issues;
      expect(issues.some((issue) => issue.path.includes("price"))).toBe(true);
    });

    it("accepts room creation when room name contains numbers (e.g. Room 101)", () => {
      const result = createRoomSchema.safeParse({
        name: "Room 101",
        roomNumber: "101",
        branch: "gil-puyat",
        type: "private",
        capacity: 1,
        price: 5000,
      });
      expect(result.success).toBe(true);
      expect(result.data.name).toBe("Room 101");
    });

    it("rejects room creation when room name contains invalid special symbols", () => {
      const result = createRoomSchema.safeParse({
        name: "Room @101!",
        roomNumber: "101",
        branch: "gil-puyat",
        type: "private",
        capacity: 1,
        price: 5000,
      });
      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes("Room name must contain letters, numbers, hyphens, and spaces only"),
        ),
      ).toBe(true);
    });

    it("accepts alphanumeric room numbers (e.g. 202-A, G1) and rejects invalid special symbols or excessive length", () => {
      const validAlpha = createRoomSchema.safeParse({
        name: "Deluxe Suite",
        roomNumber: "202-A",
        branch: "gil-puyat",
        type: "private",
        capacity: 1,
        price: 5000,
      });
      expect(validAlpha.success).toBe(true);
      expect(validAlpha.data.roomNumber).toBe("202-A");

      const validBranchCode = createRoomSchema.safeParse({
        name: "Ground Floor Room",
        roomNumber: "G1",
        branch: "guadalupe",
        type: "private",
        capacity: 1,
        price: 5000,
      });
      expect(validBranchCode.success).toBe(true);
      expect(validBranchCode.data.roomNumber).toBe("G1");

      const invalidSymbols = createRoomSchema.safeParse({
        name: "Deluxe Suite",
        roomNumber: "202@A!",
        branch: "gil-puyat",
        type: "private",
        capacity: 1,
        price: 5000,
      });
      expect(invalidSymbols.success).toBe(false);
      expect(
        invalidSymbols.error.issues.some((issue) =>
          issue.message.includes("Room number must contain letters, numbers, and hyphens only"),
        ),
      ).toBe(true);

      const tooLong = createRoomSchema.safeParse({
        name: "Deluxe Suite",
        roomNumber: "ROOM-NUMBER-EXCEEDING-20-CHARS",
        branch: "gil-puyat",
        type: "private",
        capacity: 1,
        price: 5000,
      });
      expect(tooLong.success).toBe(false);
      expect(
        tooLong.error.issues.some((issue) =>
          issue.message.includes("Room number cannot exceed 20 characters"),
        ),
      ).toBe(true);
    });

    it("rejects invalid room capacity, invalid branch, or missing required fields", () => {
      const result = createRoomSchema.safeParse({
        roomNumber: "101",
        branch: "invalid-branch",
        type: "private",
        capacity: -1,
        price: 5000,
      });
      expect(result.success).toBe(false);

      const missingNameResult = createRoomSchema.safeParse({
        name: "",
        roomNumber: "102",
        branch: "gil-puyat",
        type: "double-sharing",
        capacity: 2,
        price: 6000,
      });
      expect(missingNameResult.success).toBe(false);
    });

    it("validates partial room updates and transforms baseRate to price", () => {
      const result = updateRoomSchema.safeParse({
        baseRate: 5000,
      });
      expect(result.success).toBe(true);
      expect(result.data.price).toBe(5000);

      const nameUpdateResult = updateRoomSchema.safeParse({
        name: "Updated Room Name",
        description: "New updated description",
      });
      expect(nameUpdateResult.success).toBe(true);
      expect(nameUpdateResult.data.name).toBe("Updated Room Name");
      expect(nameUpdateResult.data.description).toBe("New updated description");
      expect(nameUpdateResult.data.price).toBeUndefined();
    });
  });

  describe("createViolationSchema", () => {
    it("validates valid violation payload with defaults", () => {
      const result = createViolationSchema.safeParse({
        tenantId: "tenant-123",
        violationType: "noise",
        description: "Loud party past quiet hours after midnight",
      });
      expect(result.success).toBe(true);
      expect(result.data.severity).toBe("minor");
      expect(result.data.penaltyAmount).toBe(0);
      expect(result.data.evidenceNotes).toBe("Loud party past quiet hours after midnight");
    });

    it("validates violation payload using evidenceNotes and locationOfIncident from modal", () => {
      const result = createViolationSchema.safeParse({
        tenantId: "67890abcdef1234567890abc",
        reservationId: "67890abcdef1234567890abd",
        branch: "gil-puyat",
        roomId: "room-203",
        roomName: "Room 203",
        violationType: "smoking_inside",
        dateOfIncident: "2026-08-26",
        timeOfIncident: "10:00 PM",
        locationOfIncident: "Room GP - Room 203",
        evidenceNotes: "Found cigarette butts and ash near balcony exit",
        penaltyApplied: 100,
        penaltyReason: "Deep cleaning fee",
        chargeToBill: true,
        evidenceUrl: null,
        evidenceUrls: [],
      });
      expect(result.success).toBe(true);
      expect(result.data.evidenceNotes).toBe("Found cigarette butts and ash near balcony exit");
      expect(result.data.description).toBe("Found cigarette butts and ash near balcony exit");
      expect(result.data.locationOfIncident).toBe("Room GP - Room 203");
      expect(result.data.location).toBe("Room GP - Room 203");
      expect(result.data.penaltyApplied).toBe(100);
      expect(result.data.penaltyAmount).toBe(100);
    });

    it("rejects missing tenantId or short description/evidenceNotes", () => {
      const result = createViolationSchema.safeParse({
        violationType: "noise",
        description: "bad",
      });
      expect(result.success).toBe(false);

      const result2 = createViolationSchema.safeParse({
        tenantId: "tenant-123",
        violationType: "noise",
        evidenceNotes: "hi",
      });
      expect(result2.success).toBe(false);
    });
  });

  describe("updateViolationSchema", () => {
    it("validates valid in-office violation update payload", () => {
      const result = updateViolationSchema.safeParse({
        dateOfIncident: "2026-08-20",
        locationOfIncident: "Room 302",
        evidenceNotes: "Tenant presented authorized appliance permit during office consultation.",
        penaltyApplied: 0,
      });
      expect(result.success).toBe(true);
    });

    it("validates update with penalty and penaltyReason", () => {
      const result = updateViolationSchema.safeParse({
        penaltyApplied: 500,
        penaltyReason: "Cleaning and deodorizing fee",
      });
      expect(result.success).toBe(true);
    });

    it("rejects penaltyApplied > 0 without penaltyReason", () => {
      const result = updateViolationSchema.safeParse({
        penaltyApplied: 500,
        penaltyReason: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects custom violation type without customViolationDescription", () => {
      const result = updateViolationSchema.safeParse({
        violationType: "custom",
        customViolationDescription: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("validateRequest middleware integration with new schemas", () => {
    it("passes through valid room request to next() and transforms payload", async () => {
      const req = {
        body: {
          name: "Double Sharing Room",
          roomNumber: "201",
          branch: "guadalupe",
          type: "double-sharing",
          capacity: 2,
          baseRate: 5500,
        },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await validateRequest({ body: createRoomSchema })(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(req.body.price).toBe(5500);
      expect(req.body.floor).toBe(1);
    });

    it("blocks invalid room request with 400 VALIDATION_ERROR", async () => {
      const req = {
        body: {
          name: "",
          roomNumber: "",
          branch: "unknown",
        },
        id: "req-room-err",
      };
      const json = jest.fn();
      const res = { status: jest.fn().mockReturnValue({ json }), req };
      const next = jest.fn();

      await validateRequest({ body: createRoomSchema })(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
