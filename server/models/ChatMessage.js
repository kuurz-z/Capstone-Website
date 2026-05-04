import mongoose from "mongoose";

const chatMessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatConversation",
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    senderUserId: {
      type: String,
      trim: true,
      default: "",
    },
    senderName: {
      type: String,
      required: true,
      trim: true,
    },
    senderRole: {
      type: String,
      enum: ["tenant", "admin", "owner", "superadmin"],
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

chatMessageSchema.virtual("id").get(function getId() {
  return this._id?.toString();
});

chatMessageSchema.index({ conversationId: 1, createdAt: 1 });
chatMessageSchema.index({ conversationId: 1, senderRole: 1, readAt: 1 });

const ChatMessage = mongoose.model(
  "ChatMessage",
  chatMessageSchema,
  "chat_messages",
);

export default ChatMessage;
