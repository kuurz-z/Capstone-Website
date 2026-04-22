/**
 * ============================================================================
 * REPAIR BILLING CYCLES AND FIRST-BILL RESERVATION CREDIT
 * ============================================================================
 *
 * Normalizes existing bills to the anniversary-billing model introduced in the
 * billing policy helpers.
 *
 * Default mode is DRY RUN. No writes happen unless `--write` is provided.
 *
 * Usage:
 *   node scripts/repair_billing_cycles.mjs
 *   node scripts/repair_billing_cycles.mjs --write
 *   node scripts/repair_billing_cycles.mjs --bill=<billId>
 *   node scripts/repair_billing_cycles.mjs --reservation=<reservationId>
 *   node scripts/repair_billing_cycles.mjs --branch=<gil-puyat|guadalupe>
 * ============================================================================
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import { Bill, Reservation } from "../models/index.js";
import {
  buildRentBillingCycle,
  roundMoney,
  sumBillCharges,
  syncBillAmounts,
} from "../utils/billingPolicy.js";
import { readMoveInDate } from "../utils/lifecycleNaming.js";

dotenv.config();

const args = process.argv.slice(2);
const isWrite = args.includes("--write");
const billArg = args.find((arg) => arg.startsWith("--bill="));
const reservationArg = args.find((arg) => arg.startsWith("--reservation="));
const branchArg = args.find((arg) => arg.startsWith("--branch="));
const billId = billArg ? billArg.split("=")[1] : null;
const reservationId = reservationArg ? reservationArg.split("=")[1] : null;
const branch = branchArg ? branchArg.split("=")[1] : null;

const fmtMoney = (value) => `PHP ${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function sameDate(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return new Date(a).getTime() === new Date(b).getTime();
}

function sameObjectId(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return String(a) === String(b);
}

function collectBillChanges(original, bill) {
  const changes = [];
  const numericFields = ["grossAmount", "reservationCreditApplied", "totalAmount", "paidAmount", "remainingAmount"];
  const dateFields = ["billingMonth", "billingCycleStart", "billingCycleEnd", "dueDate", "paymentDate"];

  for (const field of numericFields) {
    if (roundMoney(original[field] || 0) !== roundMoney(bill[field] || 0)) {
      changes.push(`${field}: ${original[field] ?? 0} -> ${bill[field] ?? 0}`);
    }
  }

  for (const field of dateFields) {
    if (!sameDate(original[field], bill[field])) {
      changes.push(`${field}: ${original[field] ? new Date(original[field]).toISOString() : "null"} -> ${bill[field] ? new Date(bill[field]).toISOString() : "null"}`);
    }
  }

  if (original.status !== bill.status) {
    changes.push(`status: ${original.status} -> ${bill.status}`);
  }

  if (!!original.isFirstCycleBill !== !!bill.isFirstCycleBill) {
    changes.push(`isFirstCycleBill: ${!!original.isFirstCycleBill} -> ${!!bill.isFirstCycleBill}`);
  }

  return changes;
}

function collectReservationChanges(original, reservation) {
  const changes = [];

  if (!sameDate(original.reservationCreditConsumedAt, reservation.reservationCreditConsumedAt)) {
    changes.push(
      `reservationCreditConsumedAt: ${original.reservationCreditConsumedAt ? new Date(original.reservationCreditConsumedAt).toISOString() : "null"} -> ${reservation.reservationCreditConsumedAt ? new Date(reservation.reservationCreditConsumedAt).toISOString() : "null"}`,
    );
  }

  if (!sameObjectId(original.reservationCreditAppliedBillId, reservation.reservationCreditAppliedBillId)) {
    changes.push(
      `reservationCreditAppliedBillId: ${original.reservationCreditAppliedBillId || "null"} -> ${reservation.reservationCreditAppliedBillId || "null"}`,
    );
  }

  return changes;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set.");
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.DB_NAME || "lilycrest",
  });

  console.log(`Connected to MongoDB database "${mongoose.connection.name}"`);
  console.log(isWrite ? "Mode: WRITE" : "Mode: DRY RUN");

  const billFilter = { isArchived: false };
  if (billId) {
    billFilter._id = billId;
  }
  if (reservationId) {
    billFilter.reservationId = reservationId;
  }
  if (branch) {
    billFilter.branch = branch;
  }

  const bills = await Bill.find(billFilter)
    .sort({ reservationId: 1, billingMonth: 1, createdAt: 1 })
    .exec();

  const reservationIds = [
    ...new Set(
      bills
        .map((bill) => bill.reservationId)
        .filter(Boolean)
        .map((id) => String(id)),
    ),
  ];

  const reservationFilter = {
    _id: { $in: reservationIds },
  };
  const reservations = await Reservation.find(reservationFilter).exec();
  const reservationMap = new Map(reservations.map((reservation) => [String(reservation._id), reservation]));

  const billGroups = new Map();
  for (const bill of bills) {
    const key = bill.reservationId ? String(bill.reservationId) : `standalone:${bill._id}`;
    const list = billGroups.get(key) || [];
    list.push(bill);
    billGroups.set(key, list);
  }

  let changedBills = 0;
  let changedReservations = 0;
  let orphanBillCount = 0;
  const changeSamples = [];

  for (const [groupKey, groupBills] of billGroups.entries()) {
    if (groupKey.startsWith("standalone:")) {
      const bill = groupBills[0];
      const original = {
        grossAmount: bill.grossAmount,
        reservationCreditApplied: bill.reservationCreditApplied,
        totalAmount: bill.totalAmount,
        paidAmount: bill.paidAmount,
        remainingAmount: bill.remainingAmount,
        billingMonth: bill.billingMonth,
        billingCycleStart: bill.billingCycleStart,
        billingCycleEnd: bill.billingCycleEnd,
        dueDate: bill.dueDate,
        paymentDate: bill.paymentDate,
        status: bill.status,
        isFirstCycleBill: bill.isFirstCycleBill,
      };
      const originalPaymentDate = bill.paymentDate;
      syncBillAmounts(bill);
      if (!originalPaymentDate && original.status === "paid" && bill.status === "paid") {
        bill.paymentDate = null;
      }
      const billChanges = collectBillChanges(original, bill);
      if (billChanges.length > 0) {
        changedBills += 1;
        if (changeSamples.length < 15) {
          changeSamples.push(`Bill ${bill._id}: ${billChanges.join(", ")}`);
        }
        if (isWrite) {
          await bill.save();
        }
      }
      continue;
    }

    const reservation = reservationMap.get(groupKey);
    if (!reservation) {
      orphanBillCount += groupBills.length;
      for (const bill of groupBills) {
        const original = {
          grossAmount: bill.grossAmount,
          reservationCreditApplied: bill.reservationCreditApplied,
          totalAmount: bill.totalAmount,
          paidAmount: bill.paidAmount,
          remainingAmount: bill.remainingAmount,
          billingMonth: bill.billingMonth,
          billingCycleStart: bill.billingCycleStart,
          billingCycleEnd: bill.billingCycleEnd,
          dueDate: bill.dueDate,
          paymentDate: bill.paymentDate,
          status: bill.status,
          isFirstCycleBill: bill.isFirstCycleBill,
        };
        const originalPaymentDate = bill.paymentDate;
        bill.reservationCreditApplied = 0;
        bill.isFirstCycleBill = false;
        syncBillAmounts(bill);
        if (!originalPaymentDate && original.status === "paid" && bill.status === "paid") {
          bill.paymentDate = null;
        }
        const billChanges = collectBillChanges(original, bill);
        if (billChanges.length > 0) {
          changedBills += 1;
          if (changeSamples.length < 15) {
            changeSamples.push(`Orphan bill ${bill._id}: ${billChanges.join(", ")}`);
          }
          if (isWrite) {
            await bill.save();
          }
        }
      }
      continue;
    }

    const sortedBills = [...groupBills].sort((a, b) => {
      const timeA = new Date(a.billingMonth || a.createdAt).getTime();
      const timeB = new Date(b.billingMonth || b.createdAt).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    const reservationOriginal = {
      reservationCreditConsumedAt: reservation.reservationCreditConsumedAt,
      reservationCreditAppliedBillId: reservation.reservationCreditAppliedBillId,
    };

    const baseReservationCredit =
      reservation.paymentStatus === "paid"
        ? roundMoney(reservation.reservationFeeAmount || 0)
        : 0;
    const moveInDate = readMoveInDate(reservation);

    let creditedBill = null;
    let rentCycleIndex = 0;

    for (const bill of sortedBills) {
      const hasRentCharge = roundMoney(bill.charges?.rent || 0) > 0;
      const original = {
        grossAmount: bill.grossAmount,
        reservationCreditApplied: bill.reservationCreditApplied,
        totalAmount: bill.totalAmount,
        paidAmount: bill.paidAmount,
        remainingAmount: bill.remainingAmount,
        billingMonth: bill.billingMonth,
        billingCycleStart: bill.billingCycleStart,
        billingCycleEnd: bill.billingCycleEnd,
        dueDate: bill.dueDate,
        paymentDate: bill.paymentDate,
        status: bill.status,
        isFirstCycleBill: bill.isFirstCycleBill,
      };

      const originalPaymentDate = bill.paymentDate;
      const expectedGrossAmount = sumBillCharges(bill.charges);
      const expectedCredit =
        hasRentCharge && rentCycleIndex === 0
          ? Math.min(baseReservationCredit, expectedGrossAmount)
          : 0;

      if (hasRentCharge && moveInDate) {
        const cycle = buildRentBillingCycle(moveInDate, rentCycleIndex);
        bill.billingMonth = cycle.billingMonth;
        bill.billingCycleStart = cycle.billingCycleStart;
        bill.billingCycleEnd = cycle.billingCycleEnd;
        bill.dueDate = cycle.dueDate;
        bill.isFirstCycleBill = rentCycleIndex === 0;
        rentCycleIndex += 1;
      } else if (!hasRentCharge) {
        bill.isFirstCycleBill = false;
      }

      bill.reservationCreditApplied = expectedCredit;

      syncBillAmounts(bill);

      if (!originalPaymentDate && original.status === "paid" && bill.status === "paid") {
        bill.paymentDate = null;
      }

      if (hasRentCharge && expectedCredit > 0) {
        creditedBill = bill;
      }

      const billChanges = collectBillChanges(original, bill);
      if (billChanges.length > 0) {
        changedBills += 1;
        if (changeSamples.length < 15) {
          changeSamples.push(`Bill ${bill._id}: ${billChanges.join(", ")}`);
        }
        if (isWrite) {
          await bill.save();
        }
      }
    }

    reservation.reservationCreditAppliedBillId = creditedBill?._id || null;
    reservation.reservationCreditConsumedAt = creditedBill
      ? reservation.reservationCreditConsumedAt || creditedBill.sentAt || creditedBill.createdAt || new Date()
      : null;

    const reservationChanges = collectReservationChanges(reservationOriginal, reservation);
    if (reservationChanges.length > 0) {
      changedReservations += 1;
      if (changeSamples.length < 15) {
        changeSamples.push(`Reservation ${reservation._id}: ${reservationChanges.join(", ")}`);
      }
      if (isWrite) {
        await reservation.save();
      }
    }
  }

  console.log("");
  console.log(`Bills scanned: ${bills.length}`);
  console.log(`Bills changed: ${changedBills}`);
  console.log(`Reservations changed: ${changedReservations}`);
  console.log(`Bills with missing reservation records: ${orphanBillCount}`);

  if (changeSamples.length > 0) {
    console.log("");
    console.log("Sample changes:");
    for (const sample of changeSamples) {
      console.log(`- ${sample}`);
    }
  } else {
    console.log("");
    console.log("No billing repairs were needed.");
  }

  if (!isWrite) {
    console.log("");
    console.log(`Dry run complete. Re-run with "--write" to persist ${changedBills} bill change(s) and ${changedReservations} reservation change(s).`);
  }
}

main()
  .catch((error) => {
    console.error("Billing repair failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
