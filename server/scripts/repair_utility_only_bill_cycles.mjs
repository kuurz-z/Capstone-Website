import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import Bill from "../models/Bill.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, "../.env") });

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const shouldWrite = process.argv.includes("--write");

if (!MONGODB_URI) {
  console.error("No MONGODB_URI found in environment");
  process.exit(1);
}

const isUtilityOnlyBill = (bill) =>
  Number(bill?.charges?.rent || 0) <= 0 &&
  (Number(bill?.charges?.electricity || 0) > 0 ||
    Number(bill?.charges?.water || 0) > 0);

const sameDate = (left, right) =>
  left &&
  right &&
  new Date(left).getTime() === new Date(right).getTime();

async function main() {
  await mongoose.connect(MONGODB_URI);

  const bills = await Bill.find({
    isArchived: false,
    utilityCycleStart: { $ne: null },
    utilityCycleEnd: { $ne: null },
  })
    .select(
      "_id billingMonth billingCycleStart billingCycleEnd utilityCycleStart utilityCycleEnd charges status",
    )
    .lean();

  const targets = bills.filter(
    (bill) =>
      isUtilityOnlyBill(bill) &&
      (!sameDate(bill.billingMonth, bill.utilityCycleStart) ||
        !sameDate(bill.billingCycleStart, bill.utilityCycleStart) ||
        !sameDate(bill.billingCycleEnd, bill.utilityCycleEnd)),
  );

  console.log(
    `${shouldWrite ? "Repairing" : "Dry run for"} ${targets.length} utility-only bill cycle mismatch(es).`,
  );

  let updated = 0;

  for (const bill of targets) {
    console.log(
      `${bill._id} | ${bill.status} | ${bill.billingMonth?.toISOString?.() || bill.billingMonth} -> ${bill.utilityCycleStart?.toISOString?.() || bill.utilityCycleStart}`,
    );

    if (!shouldWrite) continue;

    const result = await Bill.updateOne(
      { _id: bill._id },
      {
        $set: {
          billingMonth: bill.utilityCycleStart,
          billingCycleStart: bill.utilityCycleStart,
          billingCycleEnd: bill.utilityCycleEnd,
        },
      },
    );

    if (result.modifiedCount > 0) {
      updated += 1;
    }
  }

  console.log(
    shouldWrite
      ? `Updated ${updated} utility-only bill(s).`
      : "Dry run complete. Re-run with --write to persist changes.",
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Repair failed:", error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect failure during shutdown
  }
  process.exit(1);
});
