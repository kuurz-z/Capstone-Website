import { describe, expect, test } from "@jest/globals";
import mongoose from "mongoose";
import { formatBill } from "./_helpers.js";

describe("formatBill - contract parity", () => {
  test("includes reservationId as an ObjectId or string when populated on bill document", () => {
    const resId = new mongoose.Types.ObjectId();
    const billDoc = {
      _id: new mongoose.Types.ObjectId(),
      reservationId: { _id: resId, roomId: "room-1", roomName: "Room 101" },
      userId: { _id: "user-1", firstName: "Juanito", lastName: "Dela Cruz" },
      charges: { rent: 6300 },
      totalAmount: 6300,
      status: "paid",
    };

    const formatted = formatBill(billDoc);
    expect(formatted.reservationId).toBeDefined();
    expect(String(formatted.reservationId)).toBe(String(resId));
  });

  test("handles unpopulated reservationId string/ObjectId gracefully", () => {
    const resId = new mongoose.Types.ObjectId();
    const billDoc = {
      _id: new mongoose.Types.ObjectId(),
      reservationId: resId,
      userId: { _id: "user-1" },
      totalAmount: 6300,
      status: "paid",
    };

    const formatted = formatBill(billDoc);
    expect(formatted.reservationId).toBeDefined();
    expect(String(formatted.reservationId)).toBe(String(resId));
  });

  test("returns null when reservationId is absent", () => {
    const billDoc = {
      _id: new mongoose.Types.ObjectId(),
      userId: { _id: "user-1" },
      totalAmount: 6300,
      status: "paid",
    };

    const formatted = formatBill(billDoc);
    expect(formatted.reservationId).toBeNull();
  });
});
