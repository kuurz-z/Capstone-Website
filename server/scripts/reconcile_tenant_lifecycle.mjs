/**
 * ============================================================================
 * RECONCILE USER TENANT LIFECYCLE STATE
 * ============================================================================
 *
 * Scans users and repairs drift between User.role / User.tenantStatus /
 * User.branch and the reservation lifecycle rules.
 *
 * Default mode is DRY RUN. No writes happen unless `--apply` is provided.
 *
 * Usage:
 *   node scripts/reconcile_tenant_lifecycle.mjs
 *   node scripts/reconcile_tenant_lifecycle.mjs --apply
 *   node scripts/reconcile_tenant_lifecycle.mjs --user=<userId>
 *   node scripts/reconcile_tenant_lifecycle.mjs --branch=<gil-puyat|guadalupe>
 * ============================================================================
 */

import dotenv from "dotenv";
import mongoose from "mongoose";

import { User } from "../models/index.js";
import { getAuth } from "../config/firebase.js";
import { resolveReservationLifecycleState } from "../utils/reservationHelpers.js";

dotenv.config();

const args = process.argv.slice(2);
const isApply = args.includes("--apply");
const userArg = args.find((arg) => arg.startsWith("--user="));
const branchArg = args.find((arg) => arg.startsWith("--branch="));
const userId = userArg ? userArg.split("=")[1] : null;
const branchFilter = branchArg ? branchArg.split("=")[1] : null;

const fmt = (value) => (value === null || value === undefined || value === "" ? "null" : String(value));

function getMongoConnectOptions() {
  return process.env.DB_NAME ? { dbName: process.env.DB_NAME } : {};
}

function buildUserQuery() {
  const query = {
    isArchived: { $ne: true },
    role: { $in: ["applicant", "tenant"] },
  };

  if (userId) query._id = userId;
  if (branchFilter) query.branch = branchFilter;

  return query;
}

async function syncFirebaseClaimsNonFatal(user, nextState) {
  try {
    const auth = getAuth();
    if (!auth || !user.firebaseUid) return { synced: false, reason: "firebase-unavailable" };

    await auth.setCustomUserClaims(user.firebaseUid, {
      role: nextState.role,
      tenantStatus: nextState.tenantStatus,
    });
    return { synced: true };
  } catch (error) {
    return { synced: false, reason: error.message };
  }
}

function collectUserChanges(user, expected) {
  const changes = [];
  if (user.role !== expected.role) {
    changes.push(`role: ${fmt(user.role)} -> ${fmt(expected.role)}`);
  }
  if (user.tenantStatus !== expected.tenantStatus) {
    changes.push(
      `tenantStatus: ${fmt(user.tenantStatus)} -> ${fmt(expected.tenantStatus)}`,
    );
  }
  const currentBranch = user.branch ?? null;
  const expectedBranch = expected.branch ?? null;
  if (currentBranch !== expectedBranch) {
    changes.push(`branch: ${fmt(currentBranch)} -> ${fmt(expectedBranch)}`);
  }
  return changes;
}

async function deriveExpectedState(user) {
  const fallback = await resolveReservationLifecycleState({
    status: "archived",
    roomId: null,
    userId: user._id,
    reservationId: null,
  });

  return fallback || {
    role: "applicant",
    tenantStatus: "applicant",
    branch: null,
  };
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured.");
  }

  await mongoose.connect(process.env.MONGODB_URI, getMongoConnectOptions());
  console.log(`Connected to MongoDB database "${mongoose.connection.name}"`);
  console.log(`Mode: ${isApply ? "APPLY" : "DRY RUN"}`);

  const users = await User.find(buildUserQuery())
    .select("_id email firstName lastName role tenantStatus branch firebaseUid")
    .sort({ email: 1 })
    .exec();

  let scanned = 0;
  let drifted = 0;
  let updated = 0;
  let claimsSynced = 0;
  let claimsFailed = 0;
  const samples = [];

  for (const user of users) {
    scanned += 1;
    const expected = await deriveExpectedState(user);
    const changes = collectUserChanges(user, expected);
    if (!changes.length) continue;

    drifted += 1;

    const label =
      `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
      user.email ||
      String(user._id);
    if (samples.length < 20) {
      samples.push(`${label}: ${changes.join(", ")}`);
    }

    if (!isApply) continue;

    user.role = expected.role;
    user.tenantStatus = expected.tenantStatus;
    user.branch = expected.branch;
    await user.save();
    updated += 1;

    const claimResult = await syncFirebaseClaimsNonFatal(user, expected);
    if (claimResult.synced) {
      claimsSynced += 1;
    } else if (user.firebaseUid) {
      claimsFailed += 1;
      if (samples.length < 25) {
        samples.push(`${label}: Firebase claim sync failed (${claimResult.reason})`);
      }
    }
  }

  console.log("");
  console.log(`Users scanned: ${scanned}`);
  console.log(`Users with drift: ${drifted}`);
  console.log(`Users updated: ${updated}`);
  console.log(`Firebase claims synced: ${claimsSynced}`);
  console.log(`Firebase claim sync failures: ${claimsFailed}`);

  if (samples.length) {
    console.log("");
    console.log("Sample changes:");
    for (const sample of samples) {
      console.log(`- ${sample}`);
    }
  } else {
    console.log("");
    console.log("No lifecycle drift detected.");
  }

  if (!isApply) {
    console.log("");
    console.log(`Dry run complete. Re-run with "--apply" to persist ${drifted} user update(s).`);
  }
}

main()
  .catch((error) => {
    console.error("Tenant lifecycle reconciliation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
