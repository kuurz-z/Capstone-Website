import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function repairRoom204() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const db = mongoose.connection.db;
  const room = await db.collection("rooms").findOne({ roomNumber: "204" });

  if (!room) {
    console.error("Room 204 not found!");
    process.exit(1);
  }

  console.log("Found room:", room.name, "with", (room.beds || []).length, "beds");

  const existingBeds = room.beds || [];
  const existingIds = new Set(existingBeds.map((b) => b.id));

  const standardBeds = [
    {
      _id: new mongoose.Types.ObjectId(),
      id: "bed-1",
      position: "lower",
      bunkBlock: "A",
      status: "available",
      occupiedBy: { userId: null, reservationId: null, occupiedSince: null },
      lockExpiresAt: null,
      lockedBy: null,
      code: null,
    },
    {
      _id: new mongoose.Types.ObjectId(),
      id: "bed-2",
      position: "upper",
      bunkBlock: "A",
      status: "available",
      occupiedBy: { userId: null, reservationId: null, occupiedSince: null },
      lockExpiresAt: null,
      lockedBy: null,
      code: null,
    },
    {
      _id: new mongoose.Types.ObjectId(),
      id: "bed-3",
      position: "lower",
      bunkBlock: "B",
      status: "available",
      occupiedBy: { userId: null, reservationId: null, occupiedSince: null },
      lockExpiresAt: null,
      lockedBy: null,
      code: null,
    },
  ];

  const bedsToAdd = standardBeds.filter((b) => !existingIds.has(b.id));

  if (bedsToAdd.length > 0) {
    const updatedBeds = [...bedsToAdd, ...existingBeds].sort((a, b) => {
      const numA = parseInt(String(a.id).replace(/\D/g, "") || "0", 10);
      const numB = parseInt(String(b.id).replace(/\D/g, "") || "0", 10);
      return numA - numB;
    });

    await db.collection("rooms").updateOne(
      { _id: room._id },
      {
        $set: {
          beds: updatedBeds,
          capacity: 4,
        },
      }
    );

    const verified = await db.collection("rooms").findOne({ roomNumber: "204" });
    console.log("Successfully restored Room 204 beds. Total beds now in MongoDB:", verified.beds.length);
  } else {
    console.log("All beds already exist in Room 204.");
  }

  await mongoose.disconnect();
}

repairRoom204().catch((err) => {
  console.error("Repair error:", err);
  process.exit(1);
});
