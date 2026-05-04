import dotenv from "dotenv";
import mongoose from "mongoose";
import { getUtilityDiagnostics } from "../utils/utilityDiagnostics.js";

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.DB_NAME || "lilycrest-dormitory",
  });

  const branchArg = process.argv.find((arg) => arg.startsWith("--branch="));
  const branch = branchArg ? branchArg.split("=")[1] : null;
  const diagnostics = await getUtilityDiagnostics({ branch });
  console.log(JSON.stringify(diagnostics, null, 2));

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Utility diagnostics failed:", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exitCode = 1;
});
