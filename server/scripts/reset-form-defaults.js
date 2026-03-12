/**
 * One-time script to reset leaseDuration and targetMoveInDate on all reservations.
 * Run: node scripts/reset-form-defaults.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected!\n");

  const col = mongoose.connection.db.collection("reservations");
  const total = await col.countDocuments();
  console.log(`Total reservations: ${total}`);

  const result = await col.updateMany(
    {},
    {
      $unset: {
        leaseDuration: "",
        targetMoveInDate: "",
      },
    }
  );

  console.log(`\nUpdated ${result.modifiedCount} reservation(s).`);
  console.log("Cleared: leaseDuration, targetMoveInDate");

  await mongoose.disconnect();
  console.log("Done!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
