import mongoose from "mongoose";

const utilityReadingSchema = new mongoose.Schema(
  {
    utilityType: {
      type: String,
      enum: ["electricity", "water"],
      required: true,
      index: true,
    },
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

    reading: {
      type: Number,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    eventType: {
      type: String,
      enum: ["move-in", "move-out", "regular-billing"],
      required: true,
    },

    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    activeTenantIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    utilityPeriodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UtilityPeriod",
      default: null,
    },

    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true },
);

utilityReadingSchema.index({ utilityType: 1, roomId: 1, date: 1 });
utilityReadingSchema.index({ utilityType: 1, roomId: 1, utilityPeriodId: 1 });
utilityReadingSchema.index({ branch: 1, date: -1 });

export default mongoose.model("UtilityReading", utilityReadingSchema);
