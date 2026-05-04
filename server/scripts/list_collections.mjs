/**
 * List all collections and their document counts.
 * Usage: node scripts/list_collections.mjs
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const collections = await db.listCollections().toArray();
console.log("\n" + "═".repeat(55));
console.log("  DATABASE:", db.databaseName);
console.log("═".repeat(55));

let total = 0;
for (const col of collections.sort((a, b) => a.name.localeCompare(b.name))) {
  const count = await db.collection(col.name).countDocuments();
  total += count;
  const label = col.name === "users" ? " ← KEEP" : "";
  console.log(`  ${col.name.padEnd(28)} ${String(count).padStart(5)} docs${label}`);
}
console.log("─".repeat(55));
console.log(`  TOTAL${" ".repeat(22)} ${String(total).padStart(5)} docs`);
console.log("═".repeat(55) + "\n");

await mongoose.disconnect();
