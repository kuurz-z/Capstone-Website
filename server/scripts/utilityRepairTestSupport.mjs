import mongoose from "mongoose";

const oid = value => new mongoose.Types.ObjectId(value);
export const controls = {
  room: oid("111111111111111111111111"), period: oid("222222222222222222222222"),
  bill: oid("333333333333333333333333"), reading: oid("444444444444444444444444"),
  payment: oid("555555555555555555555555"), contract: oid("666666666666666666666666"),
};

export async function rawSnapshot(models) {
  const result = {};
  for (const [name, Model] of Object.entries(models)) {
    result[name] = await Model.collection.find({}).sort({ _id: 1 }).toArray();
  }
  return JSON.stringify(result);
}

export async function seedProtectedControls(models) {
  const { room, period, bill, reading, payment, contract } = controls;
  await models.Room.collection.insertOne({ _id: room, currentOccupancy: 2, price: 10000, electricityObservationRevision: 23 });
  await models.UtilityPeriod.collection.insertOne({ _id: period, roomId: room, utilityType: "electricity", status: "closed", isArchived: false, startReading: 5, endReading: 20, computedTotalCost: 240 });
  await models.UtilityReading.collection.insertOne({ _id: reading, utilityPeriodId: period, roomId: room, utilityType: "electricity", reading: 20, eventType: "periodEnd", readingStatus: "locked", isArchived: false });
  await models.Bill.collection.insertOne({ _id: bill, billId: "PROTECTED-PAID-BILL", status: "paid", paidAmount: 25000, totalAmount: 25000, charges: { rent: 24000, electricity: 1000 }, utilityDispatch: { electricity: { state: "sent", amount: 1000 } }, paymentSummary: { paid: 25000 }, isArchived: false });
  await models.Payment.collection.insertOne({ _id: payment, paymentId: "PROTECTED-PAYMENT", billId: bill, status: "paid", amount: 25000, receiptReference: "retained-receipt" });
  await models.Contract.collection.insertOne({ _id: contract, contractNumber: "PROTECTED-CONTRACT", status: "published", isCurrent: true });
}

export function guardMutations(target) {
  const room = { _id: oid(target.sourceRoomId) };
  return [
    ["extra revision", "Room", room, { $inc: { electricityObservationRevision: 1 } }],
    ["decreased revision", "Room", room, { $inc: { electricityObservationRevision: -2 } }],
    ["missing expected revision", "Room", room, { $unset: { electricityObservationRevision: "" } }],
    ["Room timestamp", "Room", room, { $set: { updatedAt: new Date("2001-01-01") } }],
    ["occupancy", "Room", room, { $set: { currentOccupancy: 9 } }],
    ["bed assignment", "Room", room, { $set: { beds: [{ id: "unexpected-bed", status: "occupied" }] } }],
    ["business metadata", "Room", room, { $set: { price: 99 } }],
    ["unknown Room field", "Room", room, { $set: { unexpectedRepairField: true } }],
    ["unrelated Room", "Room", { _id: controls.room }, { $set: { currentOccupancy: 9 } }],
    ["unrelated period", "UtilityPeriod", { _id: controls.period }, { $set: { computedTotalCost: 0 } }],
    ["unrelated reading", "UtilityReading", { _id: controls.reading }, { $set: { reading: 0 } }],
    ["paid invoice amount", "Bill", { _id: controls.bill }, { $set: { paidAmount: 1 } }],
    ["paid dispatch summary", "Bill", { _id: controls.bill }, { $set: { "utilityDispatch.electricity.amount": 1 } }],
    ["paid payment summary", "Bill", { _id: controls.bill }, { $set: { "paymentSummary.paid": 1 } }],
    ["settled payment", "Payment", { _id: controls.payment }, { $set: { amount: 1 } }],
    ["contract", "Contract", { _id: controls.contract }, { $set: { status: "terminated" } }],
    ["schedule hold", "ScheduledRoomTransfer", { _id: oid(target.scheduleId) }, { $set: { holdApplied: false } }],
    ["reservation assignment", "Reservation", { _id: oid(target.reservationId) }, { $set: { roomId: controls.room } }],
    ["Stay lifecycle", "Stay", { reservationId: oid(target.reservationId) }, { $set: { status: "terminated" } }],
  ];
}
