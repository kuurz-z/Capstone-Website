import dotenv from "dotenv";
import dayjs from "dayjs";
import mongoose from "mongoose";

import { Reservation } from "../models/index.js";
import { ensureCurrentCycleRentBill } from "../utils/rentGenerator.js";
import {
  CURRENT_RESIDENT_STATUS_QUERY,
  readMoveInDate,
} from "../utils/lifecycleNaming.js";

dotenv.config();

const write = process.argv.includes("--write");

function formatDate(dateLike) {
  return dateLike ? dayjs(dateLike).format("YYYY-MM-DD") : "n/a";
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured");
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    ...(process.env.DB_NAME ? { dbName: process.env.DB_NAME } : {}),
  });

  const reservations = await Reservation.find({
    status: { $in: CURRENT_RESIDENT_STATUS_QUERY },
    isArchived: false,
  })
    .populate("userId", "firstName lastName email")
    .populate("roomId", "name roomNumber branch price monthlyPrice type");

  const summary = {
    scanned: reservations.length,
    created: 0,
    previewed: 0,
    existing: 0,
    skipped: 0,
    errors: 0,
  };

  console.log(
    `[backfill-anniversary-rent] Mode: ${write ? "WRITE" : "DRY-RUN"}`,
  );

  for (const reservation of reservations) {
    const tenantName =
      `${reservation.userId?.firstName || ""} ${reservation.userId?.lastName || ""}`.trim() ||
      reservation.userId?.email ||
      String(reservation._id);
    const roomLabel =
      reservation.roomId?.name || reservation.roomId?.roomNumber || "Unknown room";
    const moveInDate = readMoveInDate(reservation);

    try {
      const result = await ensureCurrentCycleRentBill({
        reservation,
        referenceDate: new Date(),
        dryRun: !write,
        notifyTenant: false,
        requireCycleStartMatch: false,
      });

      if (result.status === "created") {
        summary.created += 1;
        console.log(
          `[created] ${tenantName} | ${roomLabel} | cycle ${formatDate(
            result.cycle?.billingCycleStart,
          )} -> ${formatDate(result.cycle?.billingCycleEnd)}`,
        );
        continue;
      }

      if (result.status === "preview") {
        summary.previewed += 1;
        console.log(
          `[preview] ${tenantName} | ${roomLabel} | move-in ${formatDate(
            moveInDate,
          )} | cycle ${formatDate(result.cycle?.billingCycleStart)} -> ${formatDate(
            result.cycle?.billingCycleEnd,
          )}`,
        );
        continue;
      }

      if (result.reason === "already_exists") {
        summary.existing += 1;
        console.log(
          `[exists] ${tenantName} | ${roomLabel} | cycle ${formatDate(
            result.cycle?.billingCycleStart,
          )}`,
        );
        continue;
      }

      summary.skipped += 1;
      console.log(
        `[skipped] ${tenantName} | ${roomLabel} | reason ${result.reason || "unknown"}`,
      );
    } catch (error) {
      summary.errors += 1;
      console.error(
        `[error] ${tenantName} | ${roomLabel} | ${error.message || String(error)}`,
      );
    }
  }

  console.log("");
  console.log(`[backfill-anniversary-rent] Reservations scanned: ${summary.scanned}`);
  console.log(`[backfill-anniversary-rent] Bills created: ${summary.created}`);
  console.log(`[backfill-anniversary-rent] Bills previewed: ${summary.previewed}`);
  console.log(`[backfill-anniversary-rent] Existing cycle bills: ${summary.existing}`);
  console.log(`[backfill-anniversary-rent] Skipped: ${summary.skipped}`);
  console.log(`[backfill-anniversary-rent] Errors: ${summary.errors}`);

  if (!write) {
    console.log(
      "[backfill-anniversary-rent] Dry run complete. Re-run with --write to create the missing current-cycle bills.",
    );
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(
    "[backfill-anniversary-rent] ERROR:",
    error.message || String(error),
  );
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
