import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);
const r = await mongoose.connection.db.collection("auditLogs").deleteMany({});
console.log("Deleted:", r.deletedCount, "audit logs");
process.exit(0);
