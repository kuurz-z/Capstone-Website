import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { User, Reservation, Contract, Stay, Room } from "../models/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function check() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  console.log("URI:", uri ? "Found URI" : "No URI");
  await mongoose.connect(uri);

  const user = await User.findOne({
    $or: [{ email: /jhajhai/i }, { google_email: /jhajhai/i }],
  }).lean();

  if (!user) {
    console.log("User not found");
    await mongoose.disconnect();
    return;
  }

  console.log("\nUser Found:", user._id, user.firstName, user.lastName, user.email, "role:", user.role, "tenantStatus:", user.tenantStatus);

  const reservations = await Reservation.find({ userId: user._id }).lean();
  console.log("\nReservations Count:", reservations.length);
  reservations.forEach((r) => {
    console.log(` - Res ID: ${r._id}, Status: ${r.status}, Bed: ${r.selectedBed?.id} (${r.selectedBed?.position}), Room: ${r.roomId}`);
  });

  const contracts = await Contract.find({ tenantId: user._id }).lean();
  console.log("\nContracts Count:", contracts.length);
  contracts.forEach((c) => {
    console.log(` - Contract: ${c.contractNumber}, Status: ${c.status}, Purpose: ${c.contractPurpose || "primary"}, ResId: ${c.reservationId}`);
  });

  const stays = await Stay.find({ tenantId: user._id }).lean();
  console.log("\nStays Count:", stays.length);
  stays.forEach((s) => {
    console.log(` - Stay ID: ${s._id}, Status: ${s.status}, ResId: ${s.reservationId}, Dates: ${s.leaseStartDate?.toISOString().slice(0,10)} to ${s.leaseEndDate?.toISOString().slice(0,10)}`);
  });

  // Generate a dev JWT token to set in browser localStorage
  const secret = process.env.JWT_SECRET || "development-jwt-secret-key-12345";
  const token = jwt.sign(
    {
      id: user._id,
      email: user.email || user.google_email,
      role: user.role,
      tenantStatus: user.tenantStatus,
    },
    secret,
    { expiresIn: "7d" }
  );

  console.log("\nDEV USER DATA FOR BROWSER:");
  console.log(JSON.stringify({
    token,
    user: {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email || user.google_email,
      role: user.role,
      tenantStatus: user.tenantStatus,
    }
  }));

  await mongoose.disconnect();
}

check();
