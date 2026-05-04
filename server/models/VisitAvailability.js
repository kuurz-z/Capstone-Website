import mongoose from "mongoose";
import { ROOM_BRANCHES } from "../config/branches.js";

export const DEFAULT_VISIT_SLOTS = Object.freeze([
  { label: "08:00 AM", enabled: true, capacity: 5 },
  { label: "09:00 AM", enabled: true, capacity: 5 },
  { label: "10:00 AM", enabled: true, capacity: 5 },
  { label: "11:00 AM", enabled: true, capacity: 5 },
  { label: "01:00 PM", enabled: true, capacity: 5 },
  { label: "02:00 PM", enabled: true, capacity: 5 },
  { label: "03:00 PM", enabled: true, capacity: 5 },
  { label: "04:00 PM", enabled: true, capacity: 5 },
]);

export const DEFAULT_VISIT_WEEKDAYS = Object.freeze([1, 2, 3, 4, 5]);
export const VISIT_WEEKDAY_SYSTEM = "js-get-day";

const changedBySchema = new mongoose.Schema(
  {
    userId: { type: String, default: null },
    email: { type: String, default: "" },
    role: { type: String, default: "" },
  },
  { _id: false },
);

const visitSlotSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    enabled: { type: Boolean, default: true },
    capacity: { type: Number, default: 5, min: 0 },
  },
  { _id: false },
);

const blackoutDateSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, trim: true },
    reason: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const visitAvailabilitySchema = new mongoose.Schema(
  {
    branch: {
      type: String,
      enum: ROOM_BRANCHES,
      required: true,
      unique: true,
      index: true,
    },
    enabledWeekdays: {
      type: [Number],
      default: () => [...DEFAULT_VISIT_WEEKDAYS],
    },
    weekdaySystem: {
      type: String,
      default: VISIT_WEEKDAY_SYSTEM,
    },
    slots: {
      type: [visitSlotSchema],
      default: () => DEFAULT_VISIT_SLOTS.map((slot) => ({ ...slot })),
    },
    blackoutDates: {
      type: [blackoutDateSchema],
      default: [],
    },
    changedBy: {
      type: changedBySchema,
      default: null,
    },
    changedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

export default mongoose.model("VisitAvailability", visitAvailabilitySchema);
