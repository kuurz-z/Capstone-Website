/**
 * One-time migration script to update user roles from legacy to new hierarchy.
 * 
 * Renames:
 *   - admin       → branch_admin
 *   - superAdmin  → owner
 *   - user        → applicant
 *
 * Also syncs Firebase custom claims for each migrated user.
 *
 * Run with: node --env-file=.env scripts/migrate-roles.js
 * 
 * Safe to run multiple times (idempotent) — only updates users with old roles.
 */

import admin from "firebase-admin";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// ── Firebase Admin Init ────────────────────────────────────────────────────
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
};

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const auth = admin.auth();

// ── MongoDB User Schema (minimal inline) ──────────────────────────────────
const userSchema = new mongoose.Schema({
  firebaseUid: String,
  email: String,
  role: String,
  tenantStatus: String,
  branch: String,
}, { timestamps: true, strict: false });

const User = mongoose.models.User || mongoose.model("User", userSchema);

// ── Role mapping ──────────────────────────────────────────────────────────
const ROLE_MAP = {
  admin: "branch_admin",
  superAdmin: "owner",
  user: "applicant",
};

// ── Firebase claims builder ───────────────────────────────────────────────
function buildClaims(newRole) {
  const claims = { role: newRole };
  if (newRole === "branch_admin") claims.branch_admin = true;
  if (newRole === "owner") claims.owner = true;
  return claims;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function run() {
  console.log("🔌 Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ MongoDB connected\n");

  let totalMigrated = 0;
  let totalFailed = 0;

  for (const [oldRole, newRole] of Object.entries(ROLE_MAP)) {
    const users = await User.find({ role: oldRole });
    if (users.length === 0) {
      console.log(`ℹ️  No users with role "${oldRole}" — skipping`);
      continue;
    }

    console.log(`📦 Migrating ${users.length} user(s): "${oldRole}" → "${newRole}"`);

    for (const user of users) {
      try {
        // 1. Update MongoDB
        user.role = newRole;
        await user.save();

        // 2. Sync Firebase custom claims
        if (user.firebaseUid) {
          try {
            await auth.setCustomUserClaims(user.firebaseUid, buildClaims(newRole));
          } catch (fbErr) {
            console.warn(`  ⚠️ Firebase claims failed for ${user.email}: ${fbErr.message}`);
          }
        }

        console.log(`  ✅ ${user.email || user._id}: ${oldRole} → ${newRole}`);
        totalMigrated++;
      } catch (err) {
        console.error(`  ❌ ${user.email || user._id}: ${err.message}`);
        totalFailed++;
      }
    }
  }

  console.log(`\n🎉 Migration complete!`);
  console.log(`   Migrated: ${totalMigrated}`);
  console.log(`   Failed:   ${totalFailed}`);
  console.log(`\n⚠️  Users must re-login to receive updated Firebase tokens.`);

  await mongoose.disconnect();
  process.exit(totalFailed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("❌ Migration script failed:", err.message);
  process.exit(1);
});
