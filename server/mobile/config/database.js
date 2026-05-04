/**
 * ============================================================================
 * MOBILE APP BRIDGE — Database adapter
 * ============================================================================
 *
 * The LilyCrest-Clean mobile backend uses the native MongoDB driver via
 * getDb().collection(...).  The Capstone-Website server uses Mongoose.
 *
 * This adapter exposes a getDb() function that returns the native driver
 * db handle from the existing Mongoose connection — so all mobile
 * controllers work without modification.
 * ============================================================================
 */

import mongoose from "mongoose";

export function getDb() {
  const conn = mongoose.connection;
  if (!conn || conn.readyState !== 1) {
    throw new Error("[mobile-bridge] Database not connected");
  }
  return conn.db;
}

export function connectToMongo() {
  // No-op: Mongoose connection is managed by the main server bootstrap.
  return Promise.resolve(getDb());
}
