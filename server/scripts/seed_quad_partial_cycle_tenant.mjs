/**
 * Seed a quad-room partial-cycle billing scenario.
 *
 * What it does:
 * - Finds a real non-full quadruple-sharing room.
 * - Seeds staggered checked-in tenants inside the same billing cycle.
 * - Ensures an open electricity BillingPeriod exists for the room.
 * - Records move-in MeterReading entries for the seeded tenants.
 *
 * Safe to re-run:
 * - Reuses seeded users by email.
 * - Reuses reservations by user + room + check-in date.
 * - Reuses move-in readings if they already exist.
 *
 * Usage:
 *   node scripts/seed_quad_partial_cycle_tenant.mjs
 *   node scripts/seed_quad_partial_cycle_tenant.mjs <existing-room-name-or-number>
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

import { BillingPeriod, MeterReading, Reservation, Room, User } from "../models/index.js";

dotenv.config();

const ROOM_NAME_ARG = process.argv[2] || null;
const BILLING_RATE = 16.5;
const BILLING_START_READING = 1200;
const BILLING_CYCLE_START = new Date("2026-03-15T00:00:00.000Z");
const SEED_ADMIN_BRANCH = "gil-puyat";

const BASELINE_TENANT = {
  email: "seed.quad.baseline@example.com",
  username: "seed_quad_baseline",
  firstName: "Baseline",
  lastName: "Tenant",
  moveInDate: new Date("2026-03-15T09:00:00.000Z"),
};

const PARTIAL_CYCLE_TENANT = {
  email: "seed.quad.partial@example.com",
  username: "seed_quad_partial",
  firstName: "Partial",
  lastName: "Cycle",
  moveInDate: new Date("2026-03-25T09:00:00.000Z"),
};

const LATE_CYCLE_TENANT = {
  email: "seed.quad.late@example.com",
  username: "seed_quad_late",
  firstName: "Late",
  lastName: "Mover",
  moveInDate: new Date("2026-03-28T09:00:00.000Z"),
};

const END_CYCLE_TENANT = {
  email: "seed.quad.endcycle@example.com",
  username: "seed_quad_endcycle",
  firstName: "Endcycle",
  lastName: "Tenant",
  moveInDate: new Date("2026-03-31T09:00:00.000Z"),
};

const line = (char = "=") => char.repeat(72);
const ok = (message) => console.log(`  OK  ${message}`);
const info = (message) => console.log(`  INFO ${message}`);
const skip = (message) => console.log(`  SKIP ${message}`);
const fail = (message) => console.log(`  ERR  ${message}`);

function getMongoConnectOptions() {
  return process.env.DB_NAME ? { dbName: process.env.DB_NAME } : {};
}

function buildFirebaseUid(email) {
  return `seed-${email.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
}

function pickAvailableBed(room) {
  return room.beds.find((bed) => bed.status === "available") || null;
}

async function getAdminUser() {
  let adminUser = await User.findOne({
    role: { $in: ["branch_admin", "owner"] },
    isArchived: { $ne: true },
  });

  if (adminUser) return adminUser;

  adminUser = await User.findOne({ email: "seed.billing.admin@example.com" });
  if (adminUser) {
    adminUser.role = "owner";
    adminUser.branch = SEED_ADMIN_BRANCH;
    adminUser.isEmailVerified = true;
    await adminUser.save();
    ok("Promoted existing seed.billing.admin@example.com to owner");
    return adminUser;
  }

  adminUser = await User.create({
    firebaseUid: buildFirebaseUid("seed.billing.admin@example.com"),
    email: "seed.billing.admin@example.com",
    username: "seed_billing_admin",
    firstName: "Seed",
    lastName: "Admin",
    branch: SEED_ADMIN_BRANCH,
    role: "owner",
    tenantStatus: "applicant",
    isEmailVerified: true,
  });

  ok("Created fallback owner account seed.billing.admin@example.com");
  return adminUser;
}

async function ensureSeedUser(room, tenantDef) {
  let user = await User.findOne({ email: tenantDef.email });
  if (user) {
    let changed = false;
    if (user.role !== "tenant") {
      user.role = "tenant";
      changed = true;
    }
    if (user.tenantStatus !== "active") {
      user.tenantStatus = "active";
      changed = true;
    }
    if (user.branch !== room.branch) {
      user.branch = room.branch;
      changed = true;
    }
    if (changed) {
      await user.save();
      ok(`Updated existing user ${tenantDef.email} for tenant scenario`);
    } else {
      skip(`Reusing existing user ${tenantDef.email}`);
    }
    return user;
  }

  user = await User.create({
    firebaseUid: buildFirebaseUid(tenantDef.email),
    email: tenantDef.email,
    username: tenantDef.username,
    firstName: tenantDef.firstName,
    lastName: tenantDef.lastName,
    branch: room.branch,
    role: "tenant",
    tenantStatus: "active",
    isEmailVerified: true,
  });

  ok(`Created tenant user ${tenantDef.email}`);
  return user;
}

async function ensureReservation({ room, user, moveInDate }) {
  let reservation = await Reservation.findOne({
    userId: user._id,
    roomId: room._id,
    checkInDate: moveInDate,
    isArchived: { $ne: true },
  });

  if (reservation) {
    if (reservation.status !== "checked-in") {
      reservation.status = "checked-in";
      reservation.paymentStatus = "paid";
      await reservation.save();
      ok(`Updated reservation to checked-in for ${user.email}`);
    } else {
      skip(`Reusing existing checked-in reservation for ${user.email}`);
    }
    return reservation;
  }

  reservation = await Reservation.create({
    userId: user._id,
    roomId: room._id,
    preferredRoomType: room.type,
    preferredRoomNumber: room.name || room.roomNumber,
    billingEmail: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    checkInDate: moveInDate,
    targetMoveInDate: moveInDate,
    finalMoveInDate: moveInDate,
    leaseDuration: 6,
    totalPrice: room.monthlyPrice ?? room.price ?? 0,
    monthlyRent: room.monthlyPrice ?? room.price ?? 0,
    reservationFeeAmount: 2000,
    status: "checked-in",
    paymentStatus: "paid",
    roomConfirmed: true,
    agreedToPrivacy: true,
    agreedToCertification: true,
  });

  ok(`Created checked-in reservation for ${user.email}`);
  return reservation;
}

async function attachReservationToRoom(roomId, reservationId, userId) {
  const room = await Room.findById(roomId);
  const reservation = await Reservation.findById(reservationId);
  if (!room || !reservation) throw new Error("Room or reservation missing during bed assignment");

  if (reservation.selectedBed?.id) {
    const alreadyAssigned = room.beds.find((bed) => bed.id === reservation.selectedBed.id);
    if (alreadyAssigned?.status === "occupied") {
      skip(`Reservation ${reservationId} already assigned to bed ${reservation.selectedBed.id}`);
      return;
    }
  }

  const bed = pickAvailableBed(room);
  if (!bed) {
    throw new Error(`No available bed left in room ${room.name}`);
  }

  reservation.selectedBed = { id: bed.id, position: bed.position || null };
  await reservation.save();

  room.occupyBed(bed.id, userId, reservation._id);
  room.increaseOccupancy();
  room.updateAvailability();
  await room.save();

  ok(`Assigned bed ${bed.id} in ${room.name} to ${reservation.billingEmail || reservation._id}`);
}

async function ensureOpenBillingPeriod(room) {
  let period = await BillingPeriod.findOne({
    roomId: room._id,
    status: "open",
    isArchived: false,
  });

  if (period) {
    skip(`Reusing open billing period ${period._id} for ${room.name}`);
    return period;
  }

  period = await BillingPeriod.create({
    roomId: room._id,
    branch: room.branch,
    startDate: BILLING_CYCLE_START,
    startReading: BILLING_START_READING,
    ratePerKwh: BILLING_RATE,
    status: "open",
  });

  ok(`Created open billing period for ${room.name} at PHP ${BILLING_RATE}/kWh`);
  return period;
}

async function ensureMoveInReading({ room, reservation, user, moveInDate, billingPeriod, recordedBy, fallbackReading }) {
  const existing = await MeterReading.findOne({
    roomId: room._id,
    tenantId: user._id,
    billingPeriodId: billingPeriod._id,
    eventType: "move-in",
    isArchived: false,
  });

  if (existing) {
    skip(`Reusing move-in reading for ${user.email}`);
    return existing;
  }

  const latestReading = await MeterReading.findOne({
    roomId: room._id,
    isArchived: false,
  }).sort({ date: -1, createdAt: -1 });

  const moveInReadingValue = Math.max(
    latestReading?.reading ?? fallbackReading,
    fallbackReading,
  );

  const activeTenantIds = await Reservation.find({
    roomId: room._id,
    status: "checked-in",
    isArchived: { $ne: true },
  }).distinct("userId");

  const reading = await MeterReading.create({
    roomId: room._id,
    branch: room.branch,
    reading: moveInReadingValue,
    date: moveInDate,
    eventType: "move-in",
    tenantId: user._id,
    activeTenantIds,
    recordedBy: recordedBy._id,
    billingPeriodId: billingPeriod._id,
  });

  ok(`Created move-in reading ${moveInReadingValue} kWh for ${user.email}`);
  return reading;
}

async function chooseRoom() {
  const baseFilter = {
    type: "quadruple-sharing",
    isArchived: { $ne: true },
    $expr: { $lt: ["$currentOccupancy", "$capacity"] },
  };

  if (ROOM_NAME_ARG) {
    return Room.findOne({
      ...baseFilter,
      $or: [{ name: ROOM_NAME_ARG }, { roomNumber: ROOM_NAME_ARG }],
    });
  }

  const occupiedQuad = await Room.findOne({
    ...baseFilter,
    currentOccupancy: { $gt: 0 },
  }).sort({ currentOccupancy: -1, name: 1 });

  if (occupiedQuad) return occupiedQuad;
  return Room.findOne(baseFilter).sort({ name: 1 });
}

async function main() {
  console.log(`\n${line()}`);
  console.log("  Seed Quad Partial-Cycle Billing Scenario");
  console.log(line());

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured");
  }

  await mongoose.connect(process.env.MONGODB_URI, getMongoConnectOptions());
  info("Connected to MongoDB");

  const room = await chooseRoom();
  if (!room) {
    throw new Error(
      ROOM_NAME_ARG
        ? `Room "${ROOM_NAME_ARG}" was not found as an existing non-full quadruple-sharing room`
        : "No existing non-full quadruple-sharing room was found",
    );
  }
  info(`Using room ${room.name} (${room.branch}) with occupancy ${room.currentOccupancy}/${room.capacity}`);

  const adminUser = await getAdminUser();
  if (!adminUser) {
    throw new Error("No branch_admin or owner user found for meter-reading attribution");
  }
  info(`Using admin ${adminUser.email} as recordedBy`);

  const billingPeriod = await ensureOpenBillingPeriod(room);

  const seededTenants = [
    BASELINE_TENANT,
    PARTIAL_CYCLE_TENANT,
    LATE_CYCLE_TENANT,
    END_CYCLE_TENANT,
  ];
  for (const tenantDef of seededTenants) {
    const user = await ensureSeedUser(room, tenantDef);
    const reservation = await ensureReservation({
      room,
      user,
      moveInDate: tenantDef.moveInDate,
    });

    await attachReservationToRoom(room._id, reservation._id, user._id);
    await ensureMoveInReading({
      room,
      reservation,
      user,
      moveInDate: tenantDef.moveInDate,
      billingPeriod,
      recordedBy: adminUser,
      fallbackReading: billingPeriod.startReading,
    });
  }

  const finalRoom = await Room.findById(room._id).lean();
  const finalReservations = await Reservation.find({
    roomId: room._id,
    status: "checked-in",
    isArchived: { $ne: true },
  })
    .populate("userId", "firstName lastName email")
    .sort({ checkInDate: 1 })
    .lean();

  console.log(`\n${line("-")}`);
  console.log(`  Room: ${finalRoom.name}`);
  console.log(`  Billing cycle start: ${BILLING_CYCLE_START.toISOString().slice(0, 10)}`);
  console.log(`  Open rate: PHP ${BILLING_RATE}/kWh`);
  console.log(`  Occupancy: ${finalRoom.currentOccupancy}/${finalRoom.capacity}`);
  console.log("  Checked-in tenants:");
  for (const reservation of finalReservations) {
    const fullName = `${reservation.userId?.firstName || ""} ${reservation.userId?.lastName || ""}`.trim();
    console.log(
      `    - ${fullName} <${reservation.userId?.email}> | move-in ${new Date(reservation.checkInDate).toISOString().slice(0, 10)} | bed ${reservation.selectedBed?.id || "N/A"}`,
    );
  }
  console.log(line());

  await mongoose.disconnect();
  info("Disconnected");
}

main().catch(async (error) => {
  fail(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
