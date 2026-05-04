import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
import Room from "../models/Room.js";
import Reservation from "../models/Reservation.js";

await mongoose.connect(process.env.MONGODB_URI);

const rooms = await Room.find({ isArchived: { $ne: true } }).select("name branch type").lean();
console.log("\nAll rooms:");
for (const r of rooms) console.log(`  ${r.name} | ${r.branch} | ${r.type}`);

const movedIn = await Reservation.find({ status: "moveIn", isArchived: { $ne: true } })
  .populate("roomId", "name branch")
  .populate("userId", "firstName lastName")
  .lean();

console.log("\nMoved-in tenants:");
for (const r of movedIn) {
  const name = `${r.userId?.firstName || ""} ${r.userId?.lastName || ""}`.trim();
  console.log(`  ${r.roomId?.name} | ${r.roomId?.branch} | ${name}`);
}

await mongoose.disconnect();
