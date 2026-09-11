import { createHash } from "node:crypto";

// One opening observation is created for each target room. Compare the complete
// expected document, including the counter; no Room fields are ignored.
export function roomAfterOpening(room) {
  const revision = room.electricityObservationRevision === undefined
    ? 0 : room.electricityObservationRevision;
  if (!Number.isSafeInteger(revision) || revision < 0 || !Number.isSafeInteger(revision + 1)) {
    throw Object.assign(new Error("Invalid electricity observation revision."), { code: "UNTOUCHED_STATE_CHANGED" });
  }
  return { ...room, electricityObservationRevision: revision + 1 };
}

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (value?.toHexString) return value.toHexString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonical(value[key])]),
  );
  return value;
}

// Protect documents outside the explicit archival/replacement allowlist as
// well as all lifecycle/payment records. Stream raw documents to avoid defaults,
// hidden-field projections, or keeping entire collections in memory.
export async function protectedStateHash({ models, session, roomIds, mutableIds, afterOpening = false }) {
  const hash = createHash("sha256");
  const targets = new Set(roomIds.map(String));
  for (const name of ["Room", "ScheduledRoomTransfer", "Reservation", "Stay", "Contract", "Payment", "Bill", "UtilityPeriod", "UtilityReading"]) {
    hash.update(`${name}\n`);
    const ignored = new Set((mutableIds[name] || []).map(String));
    const cursor = models[name].collection.find({}, { session }).sort({ _id: 1 });
    try {
      for await (const document of cursor) {
        if (ignored.has(String(document._id))) continue;
        const expected = name === "Room" && targets.has(String(document._id)) && afterOpening
          ? roomAfterOpening(document) : document;
        hash.update(JSON.stringify(canonical(expected)) + "\n");
      }
    } finally { await cursor.close(); }
  }
  return hash.digest("hex");
}
