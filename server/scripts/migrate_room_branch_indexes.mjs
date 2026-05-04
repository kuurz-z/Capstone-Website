import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const uri = String(process.env.MONGODB_URI || "").trim();

if (!uri) {
  throw new Error("MONGODB_URI is required to migrate room indexes.");
}

const LEGACY_INDEXES = ["name_1", "roomNumber_1"];
const TARGET_INDEX = "branch_1_roomNumber_1";

async function main() {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  const collection = mongoose.connection.collection("rooms");
  const indexes = await collection.indexes();
  const indexNames = new Set(indexes.map((index) => index.name));

  for (const indexName of LEGACY_INDEXES) {
    if (indexNames.has(indexName)) {
      console.log(`Dropping legacy room index: ${indexName}`);
      await collection.dropIndex(indexName);
    }
  }

  if (!indexNames.has(TARGET_INDEX)) {
    console.log("Creating branch-scoped room number index");
    await collection.createIndex(
      { branch: 1, roomNumber: 1 },
      {
        name: TARGET_INDEX,
        unique: true,
        partialFilterExpression: { isArchived: false },
      },
    );
  }

  console.log("Room index migration complete.");
}

main()
  .catch((error) => {
    console.error("Room index migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
