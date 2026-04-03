import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import BillingPeriod from "../models/BillingPeriod.js";
import BillingResult from "../models/BillingResult.js";
import MeterReading from "../models/MeterReading.js";
import WaterBillingRecord from "../models/WaterBillingRecord.js";
import UtilityPeriod from "../models/UtilityPeriod.js";
import UtilityReading from "../models/UtilityReading.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

async function migrateUtilities() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error("MONGODB_URI is missing from environment variables");
    }

    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // 1. Clear existing new collections (for idempotency during dev)
    console.log("🧹 Clearing existing UtilityPeriods and UtilityReadings...");
    await UtilityPeriod.deleteMany({});
    await UtilityReading.deleteMany({});

    // ---------------------------------------------------------
    // 2. Migrate Electricity Records
    // ---------------------------------------------------------
    console.log("\n⚡ Migrating Electricity Periods...");
    const billingPeriods = await BillingPeriod.find({}).lean();
    let ecCount = 0;

    for (const bPeriod of billingPeriods) {
      const bResult = await BillingResult.findOne({ billingPeriodId: bPeriod._id }).lean();

      let mappedSegments = [];
      let mappedSummaries = [];
      let computedTotalUsage = 0;
      let computedTotalCost = 0;

      if (bResult) {
        computedTotalUsage = bResult.totalRoomKwh || 0;
        computedTotalCost = bResult.totalRoomCost || 0;

        mappedSegments = (bResult.segments || []).map(seg => ({
          segmentIndex: seg.segmentIndex,
          periodLabel: seg.periodLabel,
          readingFrom: seg.readingFrom,
          readingTo: seg.readingTo,
          unitsConsumed: seg.kwhConsumed,
          totalCost: seg.totalCost,
          activeTenantCount: seg.activeTenantCount,
          sharePerTenantUnits: seg.sharePerTenantKwh,
          sharePerTenantCost: seg.sharePerTenantCost,
          startDate: seg.startDate,
          endDate: seg.endDate,
          activeTenantIds: seg.activeTenantIds,
          coveredTenantNames: seg.coveredTenantNames,
        }));

        mappedSummaries = (bResult.tenantSummaries || []).map(ts => ({
          tenantId: ts.tenantId,
          reservationId: null, // Legacy electricity didn't store reservationId directly here
          tenantName: ts.tenantName,
          totalUsage: ts.totalKwh,
          billAmount: ts.billAmount,
          billId: ts.billId,
        }));
      }

      await UtilityPeriod.create({
        _id: bPeriod._id,
        utilityType: "electricity",
        roomId: bPeriod.roomId,
        branch: bPeriod.branch,
        startDate: bPeriod.startDate,
        endDate: bPeriod.endDate,
        startReading: bPeriod.startReading,
        endReading: bPeriod.endReading,
        ratePerUnit: bPeriod.ratePerKwh,
        computedTotalUsage,
        computedTotalCost,
        verified: bResult ? bResult.verified : true,
        segments: mappedSegments,
        tenantSummaries: mappedSummaries,
        status: bPeriod.status,
        closedAt: bPeriod.closedAt,
        closedBy: bPeriod.closedBy,
        revised: bPeriod.revised,
        revisionNote: bPeriod.revisionNote,
        revisedAt: bPeriod.revisedAt,
        isArchived: bPeriod.isArchived,
        createdAt: bPeriod.createdAt,
        updatedAt: bPeriod.updatedAt,
      });
      ecCount++;
    }
    console.log(`✅ Migrated ${ecCount} Electricity Periods`);

    console.log("\n⚡ Migrating Electricity Readings...");
    const meterReadings = await MeterReading.find({}).lean();
    let erCount = 0;

    for (const mRead of meterReadings) {
      await UtilityReading.create({
        _id: mRead._id,
        utilityType: "electricity",
        roomId: mRead.roomId,
        branch: mRead.branch,
        reading: mRead.reading,
        date: mRead.date,
        eventType: mRead.eventType,
        tenantId: mRead.tenantId,
        activeTenantIds: mRead.activeTenantIds,
        recordedBy: mRead.recordedBy,
        utilityPeriodId: mRead.billingPeriodId,
        isArchived: mRead.isArchived,
        createdAt: mRead.createdAt,
        updatedAt: mRead.updatedAt,
      });
      erCount++;
    }
    console.log(`✅ Migrated ${erCount} Electricity Readings`);

    // ---------------------------------------------------------
    // 3. Migrate Water Records
    // ---------------------------------------------------------
    console.log("\n💧 Migrating Water Records...");
    const waterRecords = await WaterBillingRecord.find({}).lean();
    let wrCount = 0;

    for (const wRecord of waterRecords) {
      const mappedSummaries = (wRecord.tenantShares || []).map(ts => ({
        tenantId: ts.tenantId,
        reservationId: ts.reservationId,
        tenantName: ts.tenantName,
        totalUsage: ts.shareAmount, // Water usage tracking by tenant wasn't explicit, usually cost
        billAmount: ts.shareAmount,
        billId: ts.billId,
      }));

      // In Water, finalized == closed, draft == open
      const statusMap = wRecord.status === "finalized" ? "closed" : "open";

      await UtilityPeriod.create({
        _id: wRecord._id,
        utilityType: "water",
        roomId: wRecord.roomId,
        branch: wRecord.branch,
        startDate: wRecord.cycleStart,     // maps to startDate
        endDate: wRecord.cycleEnd,         // maps to endDate
        startReading: wRecord.previousReading, 
        endReading: wRecord.currentReading,
        ratePerUnit: wRecord.ratePerUnit,
        computedTotalUsage: wRecord.usage,
        computedTotalCost: wRecord.finalAmount, // Using finalAmount vs computedAmount to preserve overrides
        verified: true,
        segments: [], // Legacy water didn't use discrete segments
        tenantSummaries: mappedSummaries,
        status: statusMap,
        closedAt: wRecord.finalizedAt,
        closedBy: wRecord.finalizedBy,
        revised: wRecord.isOverridden,
        revisionNote: wRecord.overrideReason || wRecord.notes,
        revisedAt: wRecord.updatedAt,
        isArchived: wRecord.isArchived,
        createdAt: wRecord.createdAt,
        updatedAt: wRecord.updatedAt,
      });
      wrCount++;
    }
    console.log(`✅ Migrated ${wrCount} Water Periods`);

    console.log("\n🎉 MIGRATION COMPLETE! 🎉");
    console.log("Data is successfully transferred into UtilityPeriod and UtilityReading collections.");

  } catch (error) {
    console.error("❌ Migration failed:", error);
  } finally {
    process.exit(0);
  }
}

migrateUtilities();
