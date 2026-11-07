
const mongoose = require("mongoose");

const emailJobSchema = new mongoose.Schema(
  {
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
      unique: true
    },

    to: {
      type: String,
      default: "",
      trim: true
    },

    subject: {
      type: String,
      required: true
    },

    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },

    status: {
      type: String,
      enum: ["pending", "sending", "retry", "sent", "failed"],
      default: "pending",
      index: true
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0
    },

    nextAttemptAt: {
      type: Date,
      default: Date.now,
      index: true
    },

    lastError: {
      type: String,
      default: null
    },

    sentAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

emailJobSchema.index({
  status: 1,
  nextAttemptAt: 1
});

module.exports =
  mongoose.models.EmailJob ||
  mongoose.model("EmailJob", emailJobSchema);
