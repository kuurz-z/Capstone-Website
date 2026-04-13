import mongoose from "mongoose";
import { ROOM_BRANCHES } from "../config/branches.js";

const STAY_STATUSES = ["active", "ending_soon", "completed", "terminated", "renewed"];

const staySchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reservation",
      required: true,
      index: true,
    },
    branch: {
      type: String,
      enum: ROOM_BRANCHES,
      required: true,
      index: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },
    bedId: {
      type: String,
      required: true,
      index: true,
    },
    leaseStartDate: {
      type: Date,
      required: true,
    },
    leaseEndDate: {
      type: Date,
      required: true,
    },
    monthlyRent: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: STAY_STATUSES,
      default: "active",
      index: true,
    },
    previousStayId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stay",
      default: null,
      index: true,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    endReason: {
      type: String,
      default: "",
    },
    renewalNotes: {
      type: String,
      default: "",
    },
    transferNotes: {
      type: String,
      default: "",
    },
    moveOutNotes: {
      type: String,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

staySchema.index(
  { tenantId: 1, reservationId: 1, status: 1 },
  {
    partialFilterExpression: { status: "active" },
  },
);
staySchema.index({ reservationId: 1, leaseStartDate: -1 });

const Stay = mongoose.model("Stay", staySchema);

export { STAY_STATUSES };
export default Stay;
