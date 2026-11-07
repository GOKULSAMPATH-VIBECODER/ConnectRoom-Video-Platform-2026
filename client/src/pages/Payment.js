
const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
      index: true,
    },

    razorpayOrderId: {
      type: String,
      default: null,
      trim: true,
    },

    razorpayPaymentId: {
      type: String,
      default: null,
      trim: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
      required: true,
    },

    status: {
      type: String,
      enum: [
        "created",
        "pending",
        "authorized",
        "captured",
        "failed",
        "refunded",
      ],
      default: "created",
      required: true,
    },

    invoiceNumber: {
      type: String,
      default: null,
      trim: true,
    },

    verifiedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

paymentSchema.index({ userId: 1, createdAt: -1 });

paymentSchema.index(
  { razorpayPaymentId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      razorpayPaymentId: { $type: "string" },
    },
  }
);

module.exports =
  mongoose.models.Payment ||
  mongoose.model("Payment", paymentSchema);
