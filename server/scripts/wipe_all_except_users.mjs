/**
 * WIPE all collections EXCEPT `users`.
 * Usage: node scripts/wipe_all_except_users.mjs
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const KEEP = new Set(["users"]);

const collections = await db.listCollections().toArray();
console.log("\n" + "═".repeat(55));
console.log("  WIPE — lilycrest-dormitory (keeping: users)");
console.log("═".repeat(55));

let totalDeleted = 0;
for (const col of collections.sort((a, b) => a.name.localeCompare(b.name))) {
  if (KEEP.has(col.name)) {
    const count = await db.collection(col.name).countDocuments();
    console.log(`  ✅ KEPT    ${col.name.padEnd(28)} ${String(count).padStart(5)} docs`);
    continue;
  }
  const before = await db.collection(col.name).countDocuments();
  if (before === 0) {
    console.log(`  ⏭️  SKIP    ${col.name.padEnd(28)}     0 docs`);
    continue;
  }
  const result = await db.collection(col.name).deleteMany({});
  totalDeleted += result.deletedCount;
  console.log(`  🗑️  WIPED   ${col.name.padEnd(28)} ${String(result.deletedCount).padStart(5)} docs`);
}

console.log("─".repeat(55));
console.log(`  Total deleted: ${totalDeleted}`);
console.log("═".repeat(55) + "\n");

await mongoose.disconnect();
