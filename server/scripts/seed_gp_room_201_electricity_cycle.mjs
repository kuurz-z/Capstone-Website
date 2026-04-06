/**
 * ============================================================================
 * SEED GP ROOM 201 ELECTRICITY LIFECYCLE
 * ============================================================================
 *
 * Seeds three tenants into GP Room 201 with staggered move-in / move-out
 * activity inside the Mar 15 to Apr 15 cycle.
 *
 * What it does:
 * - Reuses the existing room and its current occupant.
 * - Reuses or creates the three requested tenant users.
 * - Ensures an electricity utility period exists for the target cycle.
 * - Creates or updates reservations and meter readings for the seed tenants.
 * - Preserves the current room occupant already in bed 1.
 *
 * Usage:
 *   node scripts/seed_gp_room_201_electricity_cycle.mjs
 *   node scripts/seed_gp_room_201_electricity_cycle.mjs "GP - Room 201"
 *
 * ============================================================================
 */

import dotenv from "dotenv";
import mongoose from "mongoose";

import {
  Reservation,
  Room,
  UtilityPeriod,
  UtilityReading,
  User,
} from "../models/index.js";

dotenv.config();

const roomArg =
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) || "GP - Room 201";

const BILLING_START = new Date("2026-03-15T00:00:00.000Z");
const OPEN_READING = 1200;
const DEFAULT_RATE_PER_UNIT = 16.5;

const TENANTS = [
  {
    email: "pixdummy.5@gmail.com",
    firstName: "pix",
    lastName: "Guest",
    moveInDate: new Date("2026-03-15T08:30:00.000Z"),
    moveOutDate: null,
  },
  {
    email: "pixdummy.2@gmail.com",
    firstName: "Vince",
    lastName: "Bryan",
    moveInDate: new Date("2026-03-22T09:00:00.000Z"),
    moveOutDate: new Date("2026-04-03T17:00:00.000Z"),
  },
  {
    email: "pixdummy.10@gmail.com",
    firstName: "pixx",
    lastName: "Guest",
    moveInDate: new Date("2026-03-29T10:00:00.000Z"),
    moveOutDate: new Date("2026-04-05T16:00:00.000Z"),
  },
];

const line = (char = "=") => char.repeat(72);
const ok = (message) => console.log(`  OK   ${message}`);
const info = (message) => console.log(`  INFO ${message}`);
const skip = (message) => console.log(`  SKIP ${message}`);

function getMongoConnectOptions() {
  return process.env.DB_NAME ? { dbName: process.env.DB_NAME } : {};
}

function buildFirebaseUid(email) {
  return `seed-${email.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
}

function sameDate(left, right) {
  if (!left || !right) return false;
  return new Date(left).getTime() === new Date(right).getTime();
}

function formatDate(value) {
  return new Date(value).toISOString();
}

async function getAdminUser(branch) {
  const admin = await User.findOne({
    branch,
    role: { $in: ["branch_admin", "owner"] },
    isArchived: { $ne: true },
  }).sort({ role: -1, createdAt: 1 });

  if (admin) return admin;

  const fallbackEmail = "seed.billing.admin@example.com";
  let fallback = await User.findOne({ email: fallbackEmail });
  if (fallback) {
    fallback.role = "owner";
    fallback.branch = branch;
    fallback.tenantStatus = "none";
    fallback.isEmailVerified = true;
    await fallback.save();
    return fallback;
  }

  fallback = await User.create({
    firebaseUid: buildFirebaseUid(fallbackEmail),
    email: fallbackEmail,
    username: "seed_billing_admin",
    firstName: "Seed",
    lastName: "Admin",
    branch,
    role: "owner",
    tenantStatus: "none",
    isEmailVerified: true,
  });
  return fallback;
}

async function ensureSeedUser(room, tenantDef) {
  let user = await User.findOne({ email: tenantDef.email });

  if (!user) {
    user = await User.create({
      firebaseUid: buildFirebaseUid(tenantDef.email),
      email: tenantDef.email,
      username: tenantDef.email.split("@")[0].replace(/[^a-z0-9]+/gi, "_"),
      firstName: tenantDef.firstName,
      lastName: tenantDef.lastName,
      branch: room.branch,
      role: "tenant",
      tenantStatus: tenantDef.moveOutDate ? "inactive" : "active",
      isEmailVerified: true,
    });
    ok(`Created tenant user ${tenantDef.email}`);
    return user;
  }

  let changed = false;
  if (user.firstName !== tenantDef.firstName) {
    user.firstName = tenantDef.firstName;
    changed = true;
  }
  if (user.lastName !== tenantDef.lastName) {
    user.lastName = tenantDef.lastName;
    changed = true;
  }
  if (user.role !== "tenant") {
    user.role = "tenant";
    changed = true;
  }
  if (user.branch !== room.branch) {
    user.branch = room.branch;
    changed = true;
  }
  if (user.isEmailVerified !== true) {
    user.isEmailVerified = true;
    changed = true;
  }

  const desiredStatus = tenantDef.moveOutDate ? "inactive" : "active";
  if (user.tenantStatus !== desiredStatus) {
    user.tenantStatus = desiredStatus;
    changed = true;
  }

  if (changed) {
    await user.save();
    ok(`Updated tenant user ${tenantDef.email}`);
  } else {
    skip(`Reusing tenant user ${tenantDef.email}`);
  }

  return user;
}

function pickAvailableBeds(room, count) {
  return room.beds
    .filter((bed) => bed.status === "available")
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))
    .slice(0, count);
}

async function ensureReservation(room, user, tenantDef, bed) {
  const checkInDate = new Date(tenantDef.moveInDate);
  const checkOutDate = tenantDef.moveOutDate
    ? new Date(tenantDef.moveOutDate)
    : null;
  const targetStatus = checkOutDate ? "checked-out" : "checked-in";

  let reservation = await Reservation.findOne({
    userId: user._id,
    roomId: room._id,
    checkInDate,
    isArchived: { $ne: true },
  });

  if (!reservation) {
    reservation = new Reservation({
      userId: user._id,
      roomId: room._id,
      preferredRoomType: room.type,
      preferredRoomNumber: room.name || room.roomNumber,
      billingEmail: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      checkInDate,
      checkOutDate,
      targetMoveInDate: checkInDate,
      finalMoveInDate: checkInDate,
      leaseDuration: 1,
      totalPrice: room.monthlyPrice ?? room.price ?? 0,
      monthlyRent: room.monthlyPrice ?? room.price ?? 0,
      reservationFeeAmount: 2000,
      roomConfirmed: true,
      agreedToPrivacy: true,
      agreedToCertification: true,
      paymentStatus: "paid",
      selectedBed: bed
        ? { id: bed.id, position: bed.position || null }
        : undefined,
      status: targetStatus,
    });
    await reservation.save();
    ok(`Created reservation for ${user.email}`);
    return reservation;
  }

  let changed = false;
  if (!sameDate(reservation.checkInDate, checkInDate)) {
    reservation.checkInDate = checkInDate;
    changed = true;
  }
  if (!sameDate(reservation.checkOutDate, checkOutDate)) {
    reservation.checkOutDate = checkOutDate;
    changed = true;
  }
  if (reservation.status !== targetStatus) {
    reservation.status = targetStatus;
    changed = true;
  }
  if (reservation.billingEmail !== user.email) {
    reservation.billingEmail = user.email;
    changed = true;
  }
  if (String(reservation.roomId) !== String(room._id)) {
    reservation.roomId = room._id;
    changed = true;
  }
  if (reservation.preferredRoomType !== room.type) {
    reservation.preferredRoomType = room.type;
    changed = true;
  }
  if (reservation.preferredRoomNumber !== (room.name || room.roomNumber)) {
    reservation.preferredRoomNumber = room.name || room.roomNumber;
    changed = true;
  }
  if (!reservation.selectedBed?.id && bed) {
    reservation.selectedBed = { id: bed.id, position: bed.position || null };
    changed = true;
  }
  if (reservation.paymentStatus !== "paid") {
    reservation.paymentStatus = "paid";
    changed = true;
  }
  if (reservation.roomConfirmed !== true) {
    reservation.roomConfirmed = true;
    changed = true;
  }
  if (reservation.agreedToPrivacy !== true) {
    reservation.agreedToPrivacy = true;
    changed = true;
  }
  if (reservation.agreedToCertification !== true) {
    reservation.agreedToCertification = true;
    changed = true;
  }

  if (changed) {
    await reservation.save();
    ok(`Updated reservation for ${user.email}`);
  } else {
    skip(`Reusing reservation for ${user.email}`);
  }

  return reservation;
}

async function ensureUtilityPeriod(room) {
  const existing = await UtilityPeriod.findOne({
    roomId: room._id,
    utilityType: "electricity",
    isArchived: false,
    startDate: BILLING_START,
  });

  if (existing) {
    skip(`Reusing electricity utility period ${existing._id}`);
    return existing;
  }

  const openPeriod = await UtilityPeriod.findOne({
    roomId: room._id,
    utilityType: "electricity",
    status: "open",
    isArchived: false,
  });

  if (openPeriod) {
    if (!sameDate(openPeriod.startDate, BILLING_START)) {
      throw new Error(
        `Room ${room.name || room.roomNumber} already has an open electricity period with a different start date.`,
      );
    }
    skip(`Reusing open electricity utility period ${openPeriod._id}`);
    return openPeriod;
  }

  const period = await UtilityPeriod.create({
    utilityType: "electricity",
    roomId: room._id,
    branch: room.branch,
    startDate: BILLING_START,
    startReading: OPEN_READING,
    ratePerUnit: DEFAULT_RATE_PER_UNIT,
    status: "open",
  });
  ok(`Created electricity utility period ${period._id}`);
  return period;
}

function getActiveTenantIdsAt(reservations, atDate) {
  const active = new Set();
  for (const reservation of reservations) {
    const checkInDate = reservation.checkInDate
      ? new Date(reservation.checkInDate)
      : null;
    const checkOutDate = reservation.checkOutDate
      ? new Date(reservation.checkOutDate)
      : null;
    if (
      checkInDate &&
      checkInDate <= atDate &&
      (!checkOutDate || checkOutDate >= atDate)
    ) {
      active.add(String(reservation.userId));
    }
  }
  return [...active];
}

async function ensureReading({
  room,
  period,
  adminUser,
  tenant,
  eventType,
  date,
  reading,
  activeTenantIds,
}) {
  const filter = {
    utilityType: "electricity",
    roomId: room._id,
    eventType,
    date,
    isArchived: false,
    tenantId: tenant?._id || null,
  };

  let record = await UtilityReading.findOne(filter);
  if (!record) {
    record = await UtilityReading.create({
      utilityType: "electricity",
      roomId: room._id,
      branch: room.branch,
      reading,
      date,
      eventType,
      tenantId: tenant?._id || null,
      activeTenantIds,
      recordedBy: adminUser._id,
      utilityPeriodId: period?._id || null,
    });
    ok(`Created ${eventType} reading at ${reading} kWh`);
    return record;
  }

  let changed = false;
  if (Number(record.reading) !== Number(reading)) {
    record.reading = reading;
    changed = true;
  }
  if (!sameDate(record.date, date)) {
    record.date = date;
    changed = true;
  }
  if (String(record.tenantId || "") !== String(tenant?._id || "")) {
    record.tenantId = tenant?._id || null;
    changed = true;
  }
  if (String(record.recordedBy || "") !== String(adminUser._id)) {
    record.recordedBy = adminUser._id;
    changed = true;
  }
  if (String(record.utilityPeriodId || "") !== String(period?._id || "")) {
    record.utilityPeriodId = period?._id || null;
    changed = true;
  }

  const currentActiveIds = (record.activeTenantIds || [])
    .map((id) => String(id))
    .sort();
  const nextActiveIds = [
    ...new Set(activeTenantIds.map((id) => String(id))),
  ].sort();
  const activeIdsMatch =
    currentActiveIds.length === nextActiveIds.length &&
    currentActiveIds.every((id, index) => id === nextActiveIds[index]);

  if (!activeIdsMatch) {
    record.activeTenantIds = activeTenantIds;
    changed = true;
  }

  if (changed) {
    await record.save();
    ok(`Updated ${eventType} reading at ${reading} kWh`);
  } else {
    skip(`Reusing ${eventType} reading at ${reading} kWh`);
  }

  return record;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured");
  }

  await mongoose.connect(process.env.MONGODB_URI, getMongoConnectOptions());

  console.log(`\n${line()}`);
  console.log("  Seed GP Room 201 Electricity Cycle");
  console.log(line());

  const room = await Room.findOne({
    isArchived: { $ne: true },
    $or: [{ name: roomArg }, { roomNumber: roomArg }],
  });

  if (!room) {
    throw new Error(`Room not found: ${roomArg}`);
  }

  info(
    `Using room ${room.name} (${room.branch}) with occupancy ${room.currentOccupancy}/${room.capacity}`,
  );

  const adminUser = await getAdminUser(room.branch);
  info(`Using admin ${adminUser.email}`);

  const period = await ensureUtilityPeriod(room);
  const availableBeds = pickAvailableBeds(room, TENANTS.length);

  if (availableBeds.length < TENANTS.length) {
    throw new Error(
      `Room ${room.name} only has ${availableBeds.length} available bed(s); need ${TENANTS.length} to seed the requested scenario.`,
    );
  }

  const seedReservations = [];

  for (let index = 0; index < TENANTS.length; index += 1) {
    const tenantDef = TENANTS[index];
    const bed = availableBeds[index];
    const user = await ensureSeedUser(room, tenantDef);
    const reservation = await ensureReservation(room, user, tenantDef, bed);
    seedReservations.push({ user, reservation, tenantDef, bed });
  }

  const roomReservations = await Reservation.find({
    roomId: room._id,
    isArchived: { $ne: true },
  })
    .select("userId checkInDate checkOutDate status")
    .lean();

  for (const { reservation, tenantDef, bed } of seedReservations) {
    if (reservation.status !== "checked-in") {
      continue;
    }

    const freshRoom = await Room.findById(room._id);
    const currentBed = freshRoom.beds.find((entry) => entry.id === bed.id);
    const alreadyOccupied =
      String(currentBed?.occupiedBy?.reservationId || "") ===
      String(reservation._id);

    if (!alreadyOccupied) {
      freshRoom.occupyBed(bed.id, reservation.userId, reservation._id);
      freshRoom.increaseOccupancy();
      freshRoom.updateAvailability();
      await freshRoom.save();
      ok(`Occupied bed ${bed.id} for ${tenantDef.email}`);
    }
  }

  const readingEvents = [
    {
      tenant: null,
      eventType: "period-start",
      date: new Date("2026-03-15T00:00:00.000Z"),
      reading: OPEN_READING,
    },
    {
      tenant: TENANTS[0],
      eventType: "move-in",
      date: new Date("2026-03-15T08:30:00.000Z"),
      reading: 1204,
    },
    {
      tenant: TENANTS[1],
      eventType: "move-in",
      date: new Date("2026-03-22T09:00:00.000Z"),
      reading: 1262,
    },
    {
      tenant: TENANTS[2],
      eventType: "move-in",
      date: new Date("2026-03-29T10:00:00.000Z"),
      reading: 1318,
    },
    {
      tenant: TENANTS[1],
      eventType: "move-out",
      date: new Date("2026-04-03T17:00:00.000Z"),
      reading: 1364,
    },
    {
      tenant: TENANTS[2],
      eventType: "move-out",
      date: new Date("2026-04-05T16:00:00.000Z"),
      reading: 1390,
    },
  ];

  for (const event of readingEvents) {
    const activeTenantIds = getActiveTenantIdsAt(roomReservations, event.date);
    await ensureReading({
      room,
      period,
      adminUser,
      tenant: event.tenant
        ? await User.findOne({ email: event.tenant.email })
        : null,
      eventType: event.eventType,
      date: event.date,
      reading: event.reading,
      activeTenantIds,
    });
  }

  const updatedRoom = await Room.findById(room._id).lean();
  const finalReservations = await Reservation.find({
    roomId: room._id,
    isArchived: { $ne: true },
  })
    .populate("userId", "firstName lastName email tenantStatus")
    .sort({ checkInDate: 1, createdAt: 1 })
    .lean();

  const finalReadings = await UtilityReading.find({
    roomId: room._id,
    utilityType: "electricity",
    isArchived: false,
  })
    .populate("tenantId", "firstName lastName email")
    .sort({ date: 1, createdAt: 1 })
    .lean();

  console.log(`\n${line("-")}`);
  console.log(`  Room: ${updatedRoom.name}`);
  console.log(`  Branch: ${updatedRoom.branch}`);
  console.log(
    `  Occupancy: ${updatedRoom.currentOccupancy}/${updatedRoom.capacity}`,
  );
  console.log(`  Utility period: ${period._id} (${period.status})`);
  console.log("  Reservations:");
  for (const reservation of finalReservations) {
    const tenantName =
      `${reservation.userId?.firstName || ""} ${reservation.userId?.lastName || ""}`.trim();
    console.log(
      `    - ${tenantName} <${reservation.userId?.email || ""}> | ${reservation.status} | in ${formatDate(reservation.checkInDate)} | out ${reservation.checkOutDate ? formatDate(reservation.checkOutDate) : "n/a"} | bed ${reservation.selectedBed?.id || "n/a"}`,
    );
  }
  console.log("  Readings:");
  for (const reading of finalReadings) {
    const tenantName = reading.tenantId
      ? `${reading.tenantId.firstName || ""} ${reading.tenantId.lastName || ""}`.trim()
      : "period";
    console.log(
      `    - ${reading.eventType} | ${tenantName} | ${reading.reading} kWh | ${formatDate(reading.date)}`,
    );
  }
  console.log(line());

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(
    "[seed-gp-room-201-electricity-cycle] ERROR:",
    error.message || String(error),
  );
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
