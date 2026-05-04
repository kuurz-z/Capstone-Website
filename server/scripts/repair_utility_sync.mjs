import dotenv from "dotenv";
import mongoose from "mongoose";
import {
  MeterReading,
  Room,
  WaterBillingRecord,
} from "../models/index.js";
import { ensureOpenElectricityPeriodForRoom } from "../utils/electricityLifecycle.js";
import { getUtilityDiagnostics } from "../utils/utilityDiagnostics.js";

dotenv.config();

const args = process.argv.slice(2);
const isWrite = args.includes("--write");
const branchArg = args.find((arg) => arg.startsWith("--branch="));
const branch = branchArg ? branchArg.split("=")[1] : null;

function appendOrphanNote(notes = "") {
  const stamp = new Date().toISOString();
  const line = `[${stamp}] Archived by utility sync repair: orphan finalized water history with no overlapping reservations.`;
  return notes ? `${notes}\n${line}` : line;
}

async function repairElectricityRooms(diagnostics) {
  const repaired = [];

  for (const roomDiag of diagnostics.electricityRooms) {
    const needsPeriodRepair =
      roomDiag.issueCodes.includes("electricity_missing_period") ||
      roomDiag.issueCodes.includes("electricity_orphan_readings");
    const blocked = roomDiag.issueCodes.includes("electricity_missing_movein_anchor");

    if (!needsPeriodRepair || blocked || roomDiag.orphanReadingIds.length === 0) {
      continue;
    }

    const room = await Room.findById(roomDiag.roomId).lean();
    const orphanReadings = await MeterReading.find({
      _id: { $in: roomDiag.orphanReadingIds },
      isArchived: false,
    })
      .sort({ date: 1, createdAt: 1 })
      .lean();

    if (!room || orphanReadings.length === 0) continue;

    const anchor = orphanReadings[0];
    const preview = {
      roomId: roomDiag.roomId,
      roomName: roomDiag.roomName,
      orphanReadingCount: orphanReadings.length,
      anchorReadingId: anchor._id,
      anchorReading: anchor.reading,
      anchorDate: anchor.date,
      action: "attach_orphan_readings_to_open_period",
    };

    if (isWrite) {
      const bootstrap = await ensureOpenElectricityPeriodForRoom({
        room,
        anchorDate: anchor.date,
        anchorReading: anchor.reading,
      });

      await MeterReading.updateMany(
        {
          _id: { $in: roomDiag.orphanReadingIds },
          billingPeriodId: null,
        },
        {
          $set: { billingPeriodId: bootstrap.period._id },
        },
      );

      preview.periodId = bootstrap.period._id;
      preview.createdPeriod = bootstrap.created;
    }

    repaired.push(preview);
  }

  return repaired;
}

async function archiveOrphanWaterRecords(diagnostics) {
  const archived = [];

  for (const recordDiag of diagnostics.waterRecords) {
    if (!recordDiag.issueCodes.includes("water_orphan_finalized_record")) {
      continue;
    }

    const preview = {
      recordId: recordDiag.recordId,
      roomId: recordDiag.roomId,
      roomName: recordDiag.roomName,
      action: "archive_orphan_water_record",
    };

    if (isWrite) {
      await WaterBillingRecord.updateOne(
        { _id: recordDiag.recordId, isArchived: false },
        {
          $set: {
            isArchived: true,
            notes: appendOrphanNote(
              (
                await WaterBillingRecord.findById(recordDiag.recordId)
                  .select("notes")
                  .lean()
              )?.notes || "",
            ),
          },
        },
      );
    }

    archived.push(preview);
  }

  return archived;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.DB_NAME || "lilycrest-dormitory",
  });

  const diagnostics = await getUtilityDiagnostics({ branch });
  const electricityRepairs = await repairElectricityRooms(diagnostics);
  const archivedWater = await archiveOrphanWaterRecords(diagnostics);

  console.log(
    JSON.stringify(
      {
        mode: isWrite ? "write" : "dry-run",
        branch,
        electricityRepairs,
        archivedWater,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Utility sync repair failed:", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exitCode = 1;
});
