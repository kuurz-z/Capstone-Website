import { describe, expect, test } from "@jest/globals";
import {
  buildLegacyDescription,
  buildStableMaintenanceRequestId,
  buildStableUserId,
  mapLegacyMaintenanceDocument,
} from "./maintenanceMigration.js";

describe("maintenanceMigration", () => {
  test("builds stable public ids from legacy seeds", () => {
    const userId = buildStableUserId("507f1f77bcf86cd799439011");
    const requestId = buildStableMaintenanceRequestId("legacy-maint-123");

    expect(userId).toMatch(/^user_[a-zA-Z0-9]{12}$/);
    expect(buildStableUserId("507f1f77bcf86cd799439011")).toBe(userId);
    expect(requestId).toMatch(/^maint_[a-zA-Z0-9]{12}$/);
    expect(buildStableMaintenanceRequestId("legacy-maint-123")).toBe(requestId);
  });

  test("merges title and description without duplicating matching prefixes", () => {
    expect(buildLegacyDescription("Leaking faucet", "Leaking faucet in the bathroom")).toBe(
      "Leaking faucet in the bathroom",
    );
    expect(buildLegacyDescription("Leaking faucet", "Sink is dripping")).toBe(
      "Leaking faucet\n\nSink is dripping",
    );
  });

  test("maps legacy maintenance fields into the canonical contract", () => {
    const mapped = mapLegacyMaintenanceDocument(
      {
        _id: "507f1f77bcf86cd799439011",
        category: "hardware",
        title: "Broken cabinet",
        description: "Door hinge is loose.",
        urgency: "medium",
        status: "on-hold",
        completionNote: "Waiting for replacement parts",
        assignedTo: "legacy-user-id",
        createdAt: "2026-04-08T10:30:00.000Z",
        updatedAt: "2026-04-09T09:15:00.000Z",
      },
      {
        user_id: "user_95f39d5b4ea4",
        assigned_to: "Juan (Maintenance)",
        branch: "gil-puyat",
      },
    );

    expect(mapped.request_id).toMatch(/^maint_[a-zA-Z0-9]{12}$/);
    expect(mapped.user_id).toBe("user_95f39d5b4ea4");
    expect(mapped.request_type).toBe("maintenance");
    expect(mapped.urgency).toBe("normal");
    expect(mapped.status).toBe("in_progress");
    expect(mapped.assigned_to).toBe("Juan (Maintenance)");
    expect(mapped.description).toBe("Broken cabinet\n\nDoor hinge is loose.");
    expect(mapped.branch).toBe("gil-puyat");
    expect(mapped.notes).toContain("Waiting for replacement parts");
    expect(mapped.notes).toContain('Migrated from legacy on-hold maintenance status.');
    expect(mapped.notes).toContain('Migrated from legacy maintenance category "hardware".');
    expect(mapped.notes).toContain('Migrated from legacy urgency "medium".');
    expect(mapped.created_at).toBe("2026-04-08T10:30:00.000Z");
    expect(mapped.updated_at).toBe("2026-04-09T09:15:00.000Z");
  });
});
