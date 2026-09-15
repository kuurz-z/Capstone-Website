/**
 * reconcile_room_204_moveout.mjs
 * ============================================================================
 * One-time database repair and reconciliation script for:
 * - Room: GP - Room 204 (Gil Puyat)
 * - Tenant: Leander Ponce (jhajhaisonce@gmail.com)
 *
 * Actions:
 * 1. Finds Room GP - Room 204 and User Leander Ponce.
 * 2. Permanently deletes invalid draft bills for Room 204 and/or Leander Ponce.
 * 3. Permanently deletes invalid utility period(s) for Room 204 starting on or after Sep 14, 2026 (e.g. Sep 15 – Oct 15).
 * 4. Resets all beds in GP - Room 204 to 'available', clears occupiedBy/lockedBy/lockExpiresAt.
 * 5. Sets room.currentOccupancy = 0, runs updateAvailability(), and saves.
 * 6. Logs full pre- and post-state verification.
 * ============================================================================
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

import { Room, User, Bill, UtilityPeriod, BillingPeriod } from "../models/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

const line = (char = "=") => char.repeat(72);
const ok   = (msg) => console.log(`  ✔  ${msg}`);
const info = (msg) => console.log(`  ℹ  ${msg}`);
const warn = (msg) => console.log(`  ⚠  ${msg}`);

async function main() {
  console.log(line());
  console.log("RECONCILIATION SCRIPT: GP - Room 204 & Leander Ponce Move-Out");
  console.log(line());

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not defined in environment.");
  }

  const connOptions = process.env.DB_NAME ? { dbName: process.env.DB_NAME } : {};
  await mongoose.connect(process.env.MONGODB_URI, connOptions);
  ok(`Connected to MongoDB (${mongoose.connection.name})`);

  // 1. Locate Room GP - Room 204
  const room = await Room.findOne({
    isArchived: { $ne: true },
    $or: [
      { name: "GP - Room 204" },
      { roomNumber: "204", branch: "gil-puyat" },
      { name: /Room 204/i, branch: "gil-puyat" }
    ]
  });

  if (!room) {
    throw new Error("Could not find Room GP - Room 204 in database.");
  }

  info(`Found Room: "${room.name}" (_id: ${room._id}, branch: ${room.branch}, type: ${room.type}, capacity: ${room.capacity})`);
  info(`Current Occupancy: ${room.currentOccupancy}, Available: ${room.available}, Beds count: ${room.beds?.length || 0}`);

  // 2. Locate User Leander Ponce
  const user = await User.findOne({
    isArchived: { $ne: true },
    $or: [
      { email: "jhajhaisonce@gmail.com" },
      { firstName: "Leander", lastName: "Ponce" }
    ]
  });

  if (user) {
    info(`Found User: ${user.firstName} ${user.lastName} (${user.email}, _id: ${user._id}, role: ${user.role})`);
  } else {
    warn("User Leander Ponce not found by primary identifiers; proceeding with room-level reconciliation.");
  }

  // 3. Find and Delete Draft Bills
  const billFilter = {
    $and: [
      {
        $or: [
          { roomId: room._id },
          ...(user ? [{ userId: user._id }] : [])
        ]
      },
      {
        $or: [
          { status: "draft" },
          { publicationState: "draft" }
        ]
      }
    ]
  };

  const draftBills = await Bill.find(billFilter).lean();
  info(`Found ${draftBills.length} draft bill(s) to delete:`);
  for (const b of draftBills) {
    console.log(`    - Bill ID: ${b._id}, Month: ${b.billingMonth?.toISOString?.() || b.billingMonth}, Total: ₱${b.totalAmount}, Status: ${b.status}, Publication: ${b.publicationState}`);
  }

  const deleteBillsResult = await Bill.deleteMany(billFilter);
  ok(`Permanently deleted ${deleteBillsResult.deletedCount} draft bill(s).`);

  // 4. Find and Delete Invalid Utility Periods (starting on or after Sep 14, 2026)
  const cutOffDate = new Date("2026-09-14T00:00:00.000Z");
  const utilityPeriodFilter = {
    roomId: room._id,
    startDate: { $gte: cutOffDate }
  };

  const invalidPeriods = await UtilityPeriod.find(utilityPeriodFilter).lean();
  info(`Found ${invalidPeriods.length} UtilityPeriod record(s) on or after ${cutOffDate.toISOString()}:`);
  for (const p of invalidPeriods) {
    console.log(`    - UtilityPeriod ID: ${p._id}, Type: ${p.utilityType}, Start: ${p.startDate?.toISOString?.()}, End: ${p.endDate?.toISOString?.()}, Status: ${p.status}`);
  }

  const deletePeriodsResult = await UtilityPeriod.deleteMany(utilityPeriodFilter);
  ok(`Permanently deleted ${deletePeriodsResult.deletedCount} UtilityPeriod record(s).`);

  // Check deprecated BillingPeriod just in case
  const legacyPeriods = await BillingPeriod.find(utilityPeriodFilter).lean();
  if (legacyPeriods.length > 0) {
    info(`Found ${legacyPeriods.length} legacy BillingPeriod record(s) to delete.`);
    const deleteLegacyResult = await BillingPeriod.deleteMany(utilityPeriodFilter);
    ok(`Deleted ${deleteLegacyResult.deletedCount} legacy BillingPeriod record(s).`);
  }

  // 5. Reset All Beds in GP - Room 204 to 'available'
  console.log(line("-"));
  info("Resetting all beds in GP - Room 204 to 'available'...");
  let bedsResetCount = 0;
  if (Array.isArray(room.beds)) {
    for (const bed of room.beds) {
      const prevStatus = bed.status;
      const prevOccupiedBy = bed.occupiedBy?.userId ? String(bed.occupiedBy.userId) : "none";
      bed.status = "available";
      bed.lockedBy = null;
      bed.lockExpiresAt = null;
      bed.occupiedBy = {
        userId: null,
        reservationId: null,
        occupiedSince: null
      };
      bedsResetCount++;
      console.log(`    - Bed ${bed.id || bed.code || bed._id} (position: ${bed.position}): ${prevStatus} (occupiedBy: ${prevOccupiedBy}) -> available`);
    }
  }

  room.currentOccupancy = 0;
  room.updateAvailability(); // room.available = (0 < capacity) && !isArchived => true
  await room.save();
  ok(`Room GP - Room 204 saved successfully! Beds reset: ${bedsResetCount}, currentOccupancy: ${room.currentOccupancy}, available: ${room.available}`);

  // 6. Post-Verification Check
  console.log(line("-"));
  info("POST-RECONCILIATION VERIFICATION:");
  const reloadedRoom = await Room.findById(room._id).lean();
  const availableBeds = reloadedRoom.beds.filter(b => b.status === "available").length;
  const totalBeds = reloadedRoom.beds.length;

  console.log(`    - Room Name: ${reloadedRoom.name}`);
  console.log(`    - Occupancy: ${reloadedRoom.currentOccupancy} / ${reloadedRoom.capacity}`);
  console.log(`    - Available Flag: ${reloadedRoom.available}`);
  console.log(`    - Bed Status Breakdown: ${availableBeds} of ${totalBeds} open (all status === 'available')`);

  const remainingDraftBills = await Bill.countDocuments(billFilter);
  console.log(`    - Remaining Draft Bills for Room 204 / Leander Ponce: ${remainingDraftBills}`);

  const remainingInvalidPeriods = await UtilityPeriod.countDocuments(utilityPeriodFilter);
  console.log(`    - Remaining Invalid Utility Periods: ${remainingInvalidPeriods}`);

  console.log(line());
  if (
    reloadedRoom.currentOccupancy === 0 &&
    reloadedRoom.available === true &&
    availableBeds === totalBeds &&
    remainingDraftBills === 0 &&
    remainingInvalidPeriods === 0
  ) {
    ok("ALL RECONCILIATION GOALS VERIFIED SUCCESSFULLY! GP - Room 204 is clean and 4 of 4 open.");
  } else {
    warn("Reconciliation finished with discrepancies. Review logs above.");
  }
  console.log(line());

  await mongoose.disconnect();
  ok("Database connection closed.");
}

main().catch(async (err) => {
  console.error("❌ Reconciliation failed with error:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
