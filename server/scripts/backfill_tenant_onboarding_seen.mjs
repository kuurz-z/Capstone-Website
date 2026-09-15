import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import AuditLog from "../models/AuditLog.js";
import tenantEligibility from "../security/mobileTenantEligibility.cjs";

const { evaluateTenant } = tenantEligibility;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const AUDIT_ACTION = "tenant_onboarding_seen_backfill";

export function parseCliArgs(argv = []) {
  const known = new Set(["--confirm", "--force-rerun"]);
  const unknown = argv.filter((arg) => !known.has(arg));
  if (unknown.length > 0) throw new Error("Unknown argument(s): " + unknown.join(", "));
  const confirm = argv.includes("--confirm");
  const forceRerun = argv.includes("--force-rerun");
  if (forceRerun && !confirm) throw new Error("--force-rerun requires --confirm.");
  return { dryRun: !confirm, forceRerun };
}

export async function runTenantOnboardingBackfill({
  usersCollection,
  auditModel = AuditLog,
  dryRun = true,
  forceRerun = false,
  seenAt = new Date(),
} = {}) {
  if (!usersCollection) throw new Error("usersCollection is required.");
  const priorRun = await auditModel.findOne({
    action: AUDIT_ACTION,
    "metadata.status": "completed",
  });

  if (!dryRun && priorRun && !forceRerun) {
    const completedAt = priorRun.timestamp
      ? new Date(priorRun.timestamp).toISOString()
      : "an unknown time";
    throw new Error(
      "A completed tenant onboarding backfill is already recorded at " + completedAt
      + ". A second write run could suppress the guide for future tenants."
      + " Use --force-rerun only after documenting why a deliberate repeat is safe.",
    );
  }

  const cursor = usersCollection.find(
    { tenant_onboarding_seen_at: null },
    { projection: {
      _id: 1, user_id: 1, role: 1, tenantStatus: 1, tenant_status: 1,
      accountStatus: 1, account_status: 1, isActive: 1, is_active: 1,
      isArchived: 1, is_archived: 1,
    } },
  );

  let scanned = 0;
  let eligible = 0;
  let modified = 0;
  for await (const user of cursor) {
    scanned += 1;
    if (!evaluateTenant(user).allowed) continue;
    eligible += 1;
    if (!dryRun) {
      const result = await usersCollection.updateOne(
        { _id: user._id, tenant_onboarding_seen_at: null },
        { $set: { tenant_onboarding_seen_at: seenAt } },
      );
      modified += result.modifiedCount || 0;
    }
  }

  const skipped = scanned - eligible;
  if (!dryRun) {
    await auditModel.log({
      type: "data_modification",
      action: AUDIT_ACTION,
      severity: "high",
      user: "system",
      userRole: "system",
      entityType: "system",
      details: "Grandfathered existing active tenants for the server-authoritative mobile Manual Guide rollout.",
      metadata: {
        status: "completed", scanned, eligible, modified, skipped,
        forcedRerun: forceRerun, seenAt,
      },
    });
  }

  return { scanned, eligible, modified, skipped, priorCompletedAudit: Boolean(priorRun) };
}

async function main() {
  dotenv.config({ path: resolve(__dirname, "../.env") });
  const options = parseCliArgs(process.argv.slice(2));
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("No MONGODB_URI or MONGO_URI found in the environment.");

  await mongoose.connect(uri);
  try {
    const result = await runTenantOnboardingBackfill({
      usersCollection: mongoose.connection.db.collection("users"),
      ...options,
    });
    console.log("scanned: " + result.scanned);
    console.log("eligible/matched: " + result.eligible);
    console.log("modified: " + result.modified);
    console.log("skipped: " + result.skipped);
    if (options.dryRun) console.log("would modify: " + result.eligible);
    console.log("existing prior completed audit: " + (result.priorCompletedAudit ? "yes" : "no"));
    console.log(options.dryRun ? "DRY-RUN complete; no writes performed." : "CONFIRMED backfill complete.");
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch(async (error) => {
    console.error("Tenant onboarding backfill failed: " + (error.message || String(error)));
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
}
