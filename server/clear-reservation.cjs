const mongoose = require("mongoose");
require("dotenv").config({
  path:
    __dirname +
    "/../Portfolio/3rdYear/CapstoneSystem/Capstone-Website/server/.env",
});

// Fallback: try loading from CWD
if (!process.env.MONGODB_URI) {
  require("dotenv").config();
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not set");
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  const db = mongoose.connection.db;

  // Find user
  const user = await db
    .collection("users")
    .findOne({ email: "usertest@gmail.com" });
  if (!user) {
    console.log("User not found");
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log("User ID:", user._id.toString());

  // Delete all reservations for this user
  const result = await db
    .collection("reservations")
    .deleteMany({ userId: user._id });
  console.log("Deleted reservations (ObjectId):", result.deletedCount);

  const result2 = await db
    .collection("reservations")
    .deleteMany({ userId: user._id.toString() });
  console.log("Deleted reservations (string):", result2.deletedCount);

  await mongoose.disconnect();
  console.log("Done - reservations cleared!");
}

main().catch(console.error);
