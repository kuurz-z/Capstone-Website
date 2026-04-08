import dotenv from "dotenv";
import mongoose from "mongoose";
import { UtilityPeriod } from "../models/index.js";

dotenv.config();

const args = process.argv.slice(2);
const isWrite = args.includes("--write");
const branchArg = args.find((arg) => arg.startsWith("--branch="));
const branch = branchArg ? branchArg.split("=")[1] : null;

function normalizeSegments(segments = []) {
  const filtered = segments.filter(
    (segment) => Number(segment?.unitsConsumed || 0) > 0,
  );

  return filtered.map((segment, index) => ({
    ...segment,
    segmentIndex: index,
  }));
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured");
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    ...(process.env.DB_NAME ? { dbName: process.env.DB_NAME } : {}),
  });

  const query = {
    utilityType: "electricity",
    isArchived: false,
    segments: { $elemMatch: { unitsConsumed: 0 } },
  };

  if (branch) {
    query.branch = branch;
  }

  const periods = await UtilityPeriod.find(query)
    .select("_id branch roomId startDate endDate segments")
    .lean();

  const updates = periods
    .map((period) => {
      const before = period.segments || [];
      const after = normalizeSegments(before);
      const removedCount = before.length - after.length;

      return {
        periodId: String(period._id),
        branch: period.branch,
        roomId: String(period.roomId),
        startDate: period.startDate,
        endDate: period.endDate,
        beforeCount: before.length,
        afterCount: after.length,
        removedCount,
        segments: after,
      };
    })
    .filter((entry) => entry.removedCount > 0);

  if (isWrite && updates.length > 0) {
    const stamp = new Date();
    for (const update of updates) {
      await UtilityPeriod.updateOne(
        { _id: update.periodId },
        {
          $set: {
            segments: update.segments,
            revised: true,
            revisedAt: stamp,
            revisionNote:
              "Removed zero-consumption electricity segments during historical cleanup.",
          },
        },
      );
    }
  }

  const totalRemoved = updates.reduce(
    (sum, entry) => sum + entry.removedCount,
    0,
  );

  console.log(
    JSON.stringify(
      {
        mode: isWrite ? "write" : "dry-run",
        branch,
        affectedPeriods: updates.length,
        totalSegmentsRemoved: totalRemoved,
        sample: updates.slice(0, 20).map((entry) => ({
          periodId: entry.periodId,
          branch: entry.branch,
          roomId: entry.roomId,
          beforeCount: entry.beforeCount,
          afterCount: entry.afterCount,
          removedCount: entry.removedCount,
        })),
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(
    "[cleanup-zero-consumption-segments] ERROR:",
    error.message || String(error),
  );
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
