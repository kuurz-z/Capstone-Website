/**
 * ============================================================================
 * REPAIR GP - ROOM 201 UTILITY CONTINUITY
 * ============================================================================
 *
 * Resolves the broken utility continuity state for GP - Room 201:
 * 1. Archives orphaned unarchived utility readings left behind from previously
 *    archived cycles so they do not conflict with fresh cycle baselines.
 * 2. Initializes an open electricity UtilityPeriod for GP - Room 201 starting
 *    October 1, 2026 at the physical baseline reading of 1,600 kWh.
 *
 * Usage:
 *   node scripts/repair_gp_room_201_utility_continuity.mjs
 * ============================================================================
 */

import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);
const { Room, User, UtilityReading } = await import("../models/index.js");
const { createOpenUtilityPeriodWithBoundary } = await import("../services/billing/utilityPeriodLifecycleService.js");

const roomId = new mongoose.Types.ObjectId("69d9e9b139100a9aa9ba3b84");
const room = await Room.findById(roomId);

if (!room) {
  console.error("Room GP - Room 201 not found.");
  process.exit(1);
}

const adminUser =
  (await User.findOne({ email: process.env.ADMIN_EMAIL || "superadmin@lilycrest.com" })) ||
  (await User.findOne({ role: { $in: ["admin", "superAdmin", "superadmin", "owner"] } }));

if (!adminUser) {
  console.error("Admin user not found for actor attribution.");
  process.exit(1);
}

console.log(`Repairing utility continuity for ${room.name} (${room.branch})...`);
console.log(`Actor: ${adminUser.email} (${adminUser._id})`);

const session = await mongoose.startSession();
try {
  await session.withTransaction(async () => {
    // 1. Archive legacy unarchived readings for Room 201
    const archiveResult = await UtilityReading.updateMany(
      { roomId, isArchived: false },
      { $set: { isArchived: true } },
      { session },
    );
    console.log(`Archived ${archiveResult.modifiedCount} legacy readings.`);

    // 2. Open new electricity period at baseline 1,600 kWh
    const period = await createOpenUtilityPeriodWithBoundary({
      utilityType: "electricity",
      room,
      startDate: new Date("2026-10-01T00:00:00.000+08:00"),
      startReading: 1600,
      ratePerUnit: 16,
      actorId: adminUser._id,
      session,
    });

    console.log("Successfully created active open UtilityPeriod:");
    console.log({
      id: period._id,
      utilityType: period.utilityType,
      status: period.status,
      startDate: period.startDate,
      startReading: period.startReading,
      ratePerUnit: period.ratePerUnit,
    });
  });

  console.log("\n>>> Room 201 utility continuity repaired successfully! <<<");
} catch (error) {
  console.error("Failed to repair utility continuity:", error);
  process.exit(1);
} finally {
  await session.endSession();
  await mongoose.disconnect();
}
