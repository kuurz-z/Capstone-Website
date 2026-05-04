import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/lilycrest-dormitory";

const cleanDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to DB. Starting cleanup...");

    const collections = await mongoose.connection.db.listCollections().toArray();
    for (const collection of collections) {
      if (collection.name !== "users" && collection.name !== "system.views") {
        await mongoose.connection.db.dropCollection(collection.name);
        console.log(`Dropped collection: ${collection.name}`);
      }
    }

    console.log("DB cleaned. Only users remain.");
    process.exit(0);
  } catch (err) {
    console.error("Cleanup failed:", err);
    process.exit(1);
  }
}

cleanDB();
