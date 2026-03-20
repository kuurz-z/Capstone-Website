/**
 * One-time script to recreate the superadmin account.
 * Run with: node --env-file=.env scripts/create-superadmin.js
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

// ── Superadmin Credentials ─────────────────────────────────────────────────
const EMAIL    = "superadmin@lilycrest.com";
const PASSWORD = "Lilycrest2026!";

// ── MongoDB User Schema (minimal inline) ──────────────────────────────────
const userSchema = new mongoose.Schema({
  firebaseUid: { type: String, required: true, unique: true },
  email:       { type: String, required: true, unique: true, lowercase: true },
  username:    { type: String, required: true, unique: true },
  firstName:   { type: String, required: true },
  lastName:    { type: String, required: true },
  role:        { type: String, default: "applicant" },
  branch:      { type: String, default: null },
  accountStatus: { type: String, default: "active" },
  isActive:    { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: true },
  isArchived:  { type: Boolean, default: false },
  permissions: { type: [String], default: [] },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model("User", userSchema);

// ── Main ───────────────────────────────────────────────────────────────────
async function run() {
  // 1. Connect to MongoDB
  console.log("🔌 Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ MongoDB connected");

  // 2. Check if Firebase account already exists
  let firebaseUid;
  try {
    const existing = await auth.getUserByEmail(EMAIL);
    firebaseUid = existing.uid;
    console.log(`ℹ️  Firebase account already exists (uid: ${firebaseUid})`);

    // Reset the password to make sure it's correct
    await auth.updateUser(firebaseUid, { password: PASSWORD, emailVerified: true });
    console.log("✅ Firebase password reset");
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      // Create new Firebase account
      const fbUser = await auth.createUser({
        email: EMAIL,
        password: PASSWORD,
        displayName: "Super Admin",
        emailVerified: true,
      });
      firebaseUid = fbUser.uid;
      console.log(`✅ Firebase account created (uid: ${firebaseUid})`);
    } else {
      throw err;
    }
  }

  // 3. Check if MongoDB record already exists
  const existingMongo = await User.findOne({ email: EMAIL });
  if (existingMongo) {
    // Update role and firebaseUid just in case they drifted
    existingMongo.role = "superAdmin";
    existingMongo.firebaseUid = firebaseUid;
    existingMongo.accountStatus = "active";
    existingMongo.isActive = true;
    existingMongo.isArchived = false;
    await existingMongo.save();
    console.log("✅ MongoDB record updated to superAdmin");
  } else {
    // Create fresh MongoDB record
    await User.create({
      firebaseUid,
      email:     EMAIL,
      username:  "superadmin",
      firstName: "Super",
      lastName:  "Admin",
      role:      "superAdmin",
      branch:    null,
      accountStatus: "active",
      isActive:  true,
      isEmailVerified: true,
      isArchived: false,
      permissions: [],
    });
    console.log("✅ MongoDB superAdmin record created");
  }

  console.log("\n🎉 Done! You can now log in with:");
  console.log(`   Email:    ${EMAIL}`);
  console.log(`   Password: ${PASSWORD}`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Script failed:", err.message);
  process.exit(1);
});
