/**
 * One-time script: Mark admin accounts as email verified
 * in both Firebase Auth and MongoDB.
 *
 * Usage: node scripts/verify-admins.js
 */

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import admin from "firebase-admin";

// Reuse the firebase config
import "../config/firebase.js";

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/lilycrest-dormitory";

async function main() {
  console.log("🔗 Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  // Find all admin and superAdmin users
  const admins = await db
    .collection("users")
    .find({ role: { $in: ["admin", "superAdmin"] } })
    .toArray();

  console.log(`\n📋 Found ${admins.length} admin account(s):\n`);

  for (const user of admins) {
    console.log(`  👤 ${user.email} (${user.role})`);
    console.log(`     MongoDB isEmailVerified: ${user.isEmailVerified}`);

    // Update MongoDB
    if (!user.isEmailVerified) {
      await db
        .collection("users")
        .updateOne({ _id: user._id }, { $set: { isEmailVerified: true } });
      console.log(`     ✅ MongoDB → set isEmailVerified = true`);
    } else {
      console.log(`     ✅ MongoDB → already verified`);
    }

    // Update Firebase Auth
    if (user.firebaseUid) {
      try {
        const auth = admin.auth();
        const fbUser = await auth.getUser(user.firebaseUid);
        console.log(`     Firebase emailVerified: ${fbUser.emailVerified}`);

        if (!fbUser.emailVerified) {
          await auth.updateUser(user.firebaseUid, { emailVerified: true });
          console.log(`     ✅ Firebase → set emailVerified = true`);
        } else {
          console.log(`     ✅ Firebase → already verified`);
        }
      } catch (err) {
        console.error(`     ❌ Firebase error: ${err.message}`);
      }
    }
    console.log("");
  }

  console.log("🎉 Done!");
  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Script failed:", err);
  process.exit(1);
});
