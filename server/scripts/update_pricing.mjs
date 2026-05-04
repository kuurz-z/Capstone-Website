/**
 * ============================================================================
 * UPDATE ROOM PRICING
 * ============================================================================
 *
 * One-time migration script to update all existing room prices to match
 * the Lilycrest Gil Puyat pricing flyer.
 *
 * Pricing tiers (discounted rates — what tenants actually pay):
 *
 *   Room Type          | Short-Term (<6mo) | Long-Term (≥6mo)
 *   ─────────────────  ──────────────────  ────────────────
 *   Quadruple Sharing  | ₱6,300/pax        | ₱5,400/pax
 *   Double Sharing     | ₱8,000/pax        | ₱7,200/pax
 *   Private Room       | ₱14,400/room      | ₱13,500/room
 *
 * Field mapping:
 *   price       → Short-term rate (used when lease < 6 months)
 *   monthlyPrice→ Long-term rate  (used when lease ≥ 6 months)
 *
 * ============================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { Room } from "../models/index.js";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/lilycrest-dormitory";

const NEW_PRICING = {
  "private":           { price: 14400, monthlyPrice: 13500 },
  "double-sharing":    { price:  8000, monthlyPrice:  7200 },
  "quadruple-sharing": { price:  6300, monthlyPrice:  5400 },
};

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to DB.\n");

    for (const [type, pricing] of Object.entries(NEW_PRICING)) {
      const result = await Room.updateMany(
        { type },
        { $set: { price: pricing.price, monthlyPrice: pricing.monthlyPrice } },
      );
      console.log(`${type}: Updated ${result.modifiedCount} rooms (matched ${result.matchedCount})`);
    }

    console.log("\n✅ Pricing update complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Pricing update failed:", error);
    process.exit(1);
  }
}

run();
