import mongoose from "mongoose";
import { ROOM_BRANCHES } from "../config/branches.js";

const chatConversationSchema = new mongoose.Schema(
  {
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
chatConversationSchema.index({ branch: 1, status: 1, lastMessageAt: -1 });
chatConversationSchema.index({ branch: 1, priority: 1, lastMessageAt: -1 });
chatConversationSchema.index({ updatedAt: -1 });

const ChatConversation = mongoose.model(
  "ChatConversation",
  chatConversationSchema,
  "chat_conversations",
);

export default ChatConversation;
