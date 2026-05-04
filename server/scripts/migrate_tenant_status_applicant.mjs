import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI");
  process.exit(1);
}

const shouldWrite = process.argv.includes("--write");
const modeLabel = shouldWrite ? "WRITE" : "DRY RUN";

async function main() {
  console.log(`[${modeLabel}] Connecting to MongoDB...`);
  await mongoose.connect(MONGODB_URI);

  const users = mongoose.connection.db.collection("users");

  const legacyCount = await users.countDocuments({ tenantStatus: "none" });
  console.log(`[${modeLabel}] Users with legacy tenantStatus \"none\": ${legacyCount}`);

  if (!shouldWrite) {
    console.log(`[${modeLabel}] No changes applied. Re-run with --write to persist.`);
    await mongoose.disconnect();
    return;
  }

  const result = await users.updateMany(
    { tenantStatus: "none" },
    { $set: { tenantStatus: "applicant" } },
  );

  console.log(`[${modeLabel}] Updated users: ${result.modifiedCount}`);

  const remaining = await users.countDocuments({ tenantStatus: "none" });
  console.log(`[${modeLabel}] Remaining legacy users: ${remaining}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect failure
  }
  process.exit(1);
});
