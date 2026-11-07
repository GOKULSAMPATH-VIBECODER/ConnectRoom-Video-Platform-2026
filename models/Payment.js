

const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },

  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Subscription",
    default: null
  },

  plan: {
    type: String,
    enum: ["Bronze", "Silver", "Gold"],
    required: true
  },

  razorpayOrderId: {
    type: String,
    required: true,
    trim: true
  },

  razorpayPaymentId: {
    type: String,
    default: null,
    trim: true
  },

  amount: {
    type: Number,
    required: true,
    min: 1
  },

  currency: {
    type: String,
    default: "INR",
    enum: ["INR"]
  },

  status: {
    type: String,
    enum: [
      "created",
      "pending",
      "authorized",
      "captured",
      "failed",
      "refunded"
    ],
    default: "created"
  },

  invoiceNumber: {
    type: String,
    default: null
  },

  verifiedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

paymentSchema.index(
  { razorpayOrderId: 1 },
  { unique: true }
);

paymentSchema.index(
  { razorpayPaymentId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      razorpayPaymentId: { $type: "string" }
    }
  }
);

module.exports =
  mongoose.models.Payment ||
  mongoose.model("Payment", paymentSchema);
