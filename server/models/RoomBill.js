/**
 * ============================================================================
 * ROOM BILL MODEL
 * ============================================================================
 *
 * Stores room-level monthly billing entries.
 * Admin enters utility costs per room → system distributes among tenants.
 *
 * ============================================================================
 */

import mongoose from "mongoose";

const roomBillSchema = new mongoose.Schema(
  {
    // --- Room Reference ---
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },
    branch: {
      type: String,
      enum: ["gil-puyat", "guadalupe"],
      required: true,
      index: true,
    },

    // --- Bill Period ---
    billingMonth: {
      type: Date,
      required: true,
      index: true,
    },
    dueDate: {
      type: Date,
      required: true,
    },

    // --- Room-Level Charges (totals for the room) ---
    charges: {
      electricity: { type: Number, default: 0 },
      water: { type: Number, default: 0 },
      applianceFees: { type: Number, default: 0 },
      corkageFees: { type: Number, default: 0 },
    },

    // --- Total of room-level utility charges ---
    totalCharges: {
      type: Number,
      required: true,
      default: 0,
    },

    // --- Generated tenant bills ---
    generatedBills: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Bill",
      },
    ],

    // --- Status ---
    status: {
      type: String,
      enum: ["draft", "generated"],
      default: "generated",
    },

    // --- Who generated it ---
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // --- Tenant Breakdown (snapshot at generation time) ---
    tenantBreakdown: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        reservationId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Reservation",
        },
        daysInRoom: { type: Number },
        proRataShare: { type: Number }, // percentage 0-1
        rent: { type: Number },
        utilityShare: { type: Number },
        totalAmount: { type: Number },
        billId: { type: mongoose.Schema.Types.ObjectId, ref: "Bill" },
      },
    ],

    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true },
);

// Compound index to prevent duplicate room bills
roomBillSchema.index({ roomId: 1, billingMonth: 1 }, { unique: true });
roomBillSchema.index({ branch: 1, billingMonth: -1 });

export default mongoose.model("RoomBill", roomBillSchema);
