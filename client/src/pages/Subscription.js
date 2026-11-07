
const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    plan: {
      type: String,
      enum: ["Free", "Bronze", "Silver", "Gold"],
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "active", "expired", "cancelled", "failed"],
      default: "pending",
      required: true,
    },

    // Required subscription date fields
    startDate: {
      type: Date,
      default: null,
    },

    expiryDate: {
      type: Date,
      default: null,
    },

    renewalPolicy: {
      type: String,
      enum: ["manual", "automatic", "none"],
      default: "manual",
    },

    autoRenew: {
      type: Boolean,
      default: false,
    },

    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },

    orderId: {
      type: String,
      default: null,
      trim: true,
    },

    // Keep legacy fields for compatibility with existing code
    startsAt: {
      type: Date,
      default: null,
    },

    expiresAt: {
      type: Date,
      default: null,
    },

    paymentReference: {
      type: String,
      default: "",
      maxlength: 200,
    },
  },
  { timestamps: true }
);

subscriptionSchema.index({ userId: 1, status: 1, expiryDate: -1 });
subscriptionSchema.index({ userId: 1, status: 1, expiresAt: -1 });

module.exports =
  mongoose.models.Subscription ||
  mongoose.model("Subscription", subscriptionSchema);
