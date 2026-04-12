/**
 * ============================================================================
 * DATABASE CONFIGURATION
 * ============================================================================
 *
 * MongoDB connection bootstrap.
 *
 * Production rules:
 * - Missing MongoDB configuration is fatal
 * - Initial connection failure is fatal
 *
 * Non-production rules:
 * - Missing MongoDB configuration is tolerated
 * - Connection failures are logged and retried in the background
 *
 * ============================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const RETRY_DELAY_MS = 10_000;

const isProduction = () => process.env.NODE_ENV === "production";

const scheduleReconnect = () => {
  setTimeout(() => {
    connectDB().catch((retryError) => {
      console.error("Failed to retry MongoDB connection:", retryError);
    });
  }, RETRY_DELAY_MS);
};

const connectDB = async () => {
  const mongoUri = String(process.env.MONGODB_URI || "").trim();

  if (!mongoUri) {
    const error = new Error("MONGODB_URI is not set in environment variables");
    if (isProduction()) {
      throw error;
    }

    console.error("MongoDB connection skipped:", error.message);
    console.log(
      "Server is starting without MongoDB. Set MONGODB_URI in .env to enable database features.",
    );
    return false;
  }

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
    });

    console.log("MongoDB connected successfully");
    console.log(`Database: ${mongoose.connection.name}`);
    return true;
  } catch (error) {
    console.error("MongoDB connection error:", error.message);

    if (isProduction()) {
      throw error;
    }

    console.log(
      `Server is starting without MongoDB. Retrying connection in ${RETRY_DELAY_MS / 1000} seconds...`,
    );
    scheduleReconnect();
    return false;
  }
};

try {
  mongoose.connection.on("connected", () => {
    console.log("Mongoose connected to MongoDB");
  });

  mongoose.connection.on("disconnected", () => {
    console.log("Mongoose disconnected from MongoDB");
  });

  mongoose.connection.on("error", (err) => {
    console.error("Mongoose connection error:", err);
  });
} catch (error) {
  console.error("Failed to set up MongoDB event listeners:", error);
}

export default connectDB;
