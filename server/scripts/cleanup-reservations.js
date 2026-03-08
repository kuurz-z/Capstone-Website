import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../.env") });

const MONGODB_URI = process.env.MONGODB_URI;

async function cleanup() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const db = mongoose.connection.db;
    const reservations = db.collection("reservations");

    // Get all reservations grouped by user
    const allReservations = await reservations
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    console.log(`📊 Total reservations: ${allReservations.length}`);

    // Group by userId
    const byUser = {};
    for (const r of allReservations) {
      const uid = String(r.userId);
      if (!byUser[uid]) byUser[uid] = [];
      byUser[uid].push(r);
    }

    let totalDeleted = 0;
    for (const [userId, userReservations] of Object.entries(byUser)) {
      if (userReservations.length > 1) {
        console.log(
          `\n👤 User ${userId} has ${userReservations.length} reservations`,
        );
        // Keep the most recent one (first in sorted list), delete the rest
        const keep = userReservations[0];
        const toDelete = userReservations.slice(1);

        console.log(
          `  ✅ Keeping: ${keep._id} (code: ${keep.reservationCode || "N/A"}, status: ${keep.status})`,
        );

        for (const del of toDelete) {
          console.log(
            `  🗑️  Deleting: ${del._id} (code: ${del.reservationCode || "N/A"}, status: ${del.status})`,
          );
          await reservations.deleteOne({ _id: del._id });
          totalDeleted++;
        }
      }
    }

    console.log(
      `\n✅ Cleanup complete. Deleted ${totalDeleted} duplicate reservations.`,
    );

    // Show remaining
    const remaining = await reservations.countDocuments();
    console.log(`📊 Remaining reservations: ${remaining}`);

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

cleanup();
