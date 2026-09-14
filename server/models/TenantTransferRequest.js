import mongoose from "mongoose";
import { ROOM_BRANCHES } from "../config/branches.js";

export const TENANT_TRANSFER_REQUEST_STATUSES = Object.freeze([
  "pending",
  "scheduling",
  "scheduled",
  "completed",
  "declined",
  "cancelled",
]);

export const OPEN_TENANT_TRANSFER_REQUEST_STATUSES = Object.freeze([
  "pending",
  "scheduling",
  "scheduled",
]);

const roomSnapshotSchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    name: { type: String, default: "" },
    roomNumber: { type: String, default: "" },
    type: { type: String, default: "" },
    branch: { type: String, enum: ROOM_BRANCHES, required: true },
  },
  { _id: false },
);

const bedSnapshotSchema = new mongoose.Schema(
  {
    bedId: { type: String, default: null },
    position: { type: String, default: null },
    bunkBlock: { type: String, default: null },
    code: { type: String, default: null },
  },
  { _id: false },
);

const tenantTransferRequestSchema = new mongoose.Schema(
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
    stayId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stay",
      required: true,
      index: true,
    },
    branch: { type: String, enum: ROOM_BRANCHES, required: true, index: true },
    currentRoomSnapshot: { type: roomSnapshotSchema, required: true },
    currentBedSnapshot: { type: bedSnapshotSchema, default: () => ({}) },
    preferredRoomType: {
      type: String,
      enum: ["private", "double-sharing", "quadruple-sharing"],
      required: true,
    },
    preferredRoomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      default: null,
    },
    preferredTransferDate: { type: Date, default: null },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    note: { type: String, default: "", trim: true, maxlength: 1000 },
    status: {
      type: String,
      enum: TENANT_TRANSFER_REQUEST_STATUSES,
      default: "pending",
      required: true,
      index: true,
    },
    scheduledRoomTransferId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ScheduledRoomTransfer",
      default: null,
      index: true,
    },
    schedulingToken: { type: String, default: null, select: false },
    schedulingStartedAt: { type: Date, default: null },
    schedulingHeartbeatAt: { type: Date, default: null },
    submittedAt: { type: Date, default: Date.now, required: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    declineReason: { type: String, default: "", trim: true, maxlength: 1000 },
    cancelledAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

tenantTransferRequestSchema.index({ tenantId: 1, submittedAt: -1 });
tenantTransferRequestSchema.index({ reservationId: 1, submittedAt: -1 });
tenantTransferRequestSchema.index(
  { tenantId: 1 },
  {
    unique: true,
    name: "unique_open_tenant_transfer_request",
    partialFilterExpression: {
      status: { $in: [...OPEN_TENANT_TRANSFER_REQUEST_STATUSES] },
    },
  },
);

export default mongoose.model("TenantTransferRequest", tenantTransferRequestSchema);
