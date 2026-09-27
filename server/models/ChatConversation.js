import mongoose from "mongoose";
import { ROOM_BRANCHES } from "../config/branches.js";

const chatConversationSchema = new mongoose.Schema(
  {
    // Persisted by the mobile support service; never reconstructed from legacy fields.
    request: { type: mongoose.Schema.Types.Mixed, default: undefined },
    supportRevision: { type: Number, default: undefined },
    ticketId: {
      type: String,
      trim: true,
      uppercase: true,
      immutable: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tenantUserId: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    tenantName: {
      type: String,
      required: true,
      trim: true,
    },
    tenantEmail: {
      type: String,
      trim: true,
      default: "",
    },
    tenantProfileImage: {
      type: String,
      trim: true,
      default: "",
    },
    branch: {
      type: String,
      required: true,
      enum: ROOM_BRANCHES,
      index: true,
    },
    roomNumber: {
      type: String,
      trim: true,
      default: "",
    },
    roomBed: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["open", "in_review", "waiting_tenant", "resolved", "closed"],
      default: "open",
      index: true,
    },
    category: {
      type: String,
      enum: [
        "billing_concern",
        "maintenance_concern",
        "reservation_concern",
        "payment_concern",
        "general_inquiry",
        "urgent_issue",
      ],
      default: "general_inquiry",
      index: true,
    },
    priority: {
      type: String,
      enum: ["normal", "high", "urgent"],
      default: "normal",
      index: true,
    },
    assignedAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    assignedAdminName: {
      type: String,
      trim: true,
      default: "",
    },
    lastMessage: {
      type: String,
      trim: true,
      default: "",
    },
    lastMessageAt: {
      type: Date,
      default: null,
      index: true,
    },
    unreadAdminCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    unreadTenantCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    closingNote: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
    resolvedAt: { type: Date, default: null },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolutionConfirmationSource: { type: String, trim: true, default: "" },
    firstAdminReplyAt: { type: Date, default: null },
    firstAdminReplyMinutes: { type: Number, default: null },
    resolutionDurationMinutes: { type: Number, default: null },
    satisfactionRating: { type: Number, min: 1, max: 5, default: null },
    satisfactionFeedback: { type: String, trim: true, default: "", maxlength: 1000 },
    reopenedAt: { type: Date, default: null },
    reopenCount: { type: Number, default: 0, min: 0 },
    // Optional reference to the business record this conversation concerns
    // (e.g. a specific lease Contract). Deliberately a reference, not a
    // duplicate of the entity's fields — resolve the entity's current state
    // by entityId when needed rather than trusting a stale copy here.
    context: {
      entityType: {
        type: String,
        enum: ["", "contract"],
        default: "",
      },
      entityId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
      sourceModule: {
        type: String,
        trim: true,
        default: "",
      },
    },
    statusHistory: [
      {
        status: {
          type: String,
          enum: ["open", "in_review", "waiting_tenant", "resolved", "closed"],
          required: true,
        },
        note: {
          type: String,
          trim: true,
          default: "",
          maxlength: 1000,
        },
        actorId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        actorName: {
          type: String,
          trim: true,
          default: "",
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

chatConversationSchema.virtual("id").get(function getId() {
  return this._id?.toString();
});

chatConversationSchema.index({ tenantId: 1, status: 1 });
chatConversationSchema.index({ ticketId: 1 }, { unique: true, sparse: true });
// Supports the "reuse/reopen the existing contextual conversation instead of
// creating a new one" lookup in chatController.js's startConversation().
chatConversationSchema.index({
  tenantId: 1,
  "context.entityType": 1,
  "context.entityId": 1,
  status: 1,
});
chatConversationSchema.index({ branch: 1, status: 1, lastMessageAt: -1 });
chatConversationSchema.index({ branch: 1, priority: 1, lastMessageAt: -1 });
chatConversationSchema.index({ updatedAt: -1 });

const ChatConversation = mongoose.model(
  "ChatConversation",
  chatConversationSchema,
  "chat_conversations",
);

export default ChatConversation;
