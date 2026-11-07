
const mongoose = require("mongoose");

const quotaUsageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    monthKey: {
      type: String,
      required: true,
    },
    monthlyCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    dailyCounts: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },
    idempotencyKeys: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

quotaUsageSchema.index(
  { userId: 1, monthKey: 1 },
  { unique: true }
);

module.exports = mongoose.model("QuotaUsage", quotaUsageSchema);
