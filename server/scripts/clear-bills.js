import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";

try {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to", mongoose.connection.name);

  const bills = await mongoose.connection.db.collection("bills").deleteMany({});
  const roomBills = await mongoose.connection.db
    .collection("roombills")
    .deleteMany({});

  console.log(`✅ Deleted ${bills.deletedCount} bills`);
  console.log(`✅ Deleted ${roomBills.deletedCount} room bills`);

  process.exit(0);
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
}
