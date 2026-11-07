
const mongoose = require("mongoose");

const loginLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },

    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },

    ipAddress: {
      type: String,
      default: null,
      trim: true
    },

    browser: {
      name: { type: String, default: "Unknown" },
      version: { type: String, default: "Unknown" }
    },

    operatingSystem: {
      name: { type: String, default: "Unknown" },
      version: { type: String, default: "Unknown" }
    },

    device: {
      type: {
        type: String,
        default: "Unknown"
      },
      model: {
        type: String,
        default: null
      }
    },

    location: {
      city: { type: String, default: null },
      state: { type: String, default: null },
      country: { type: String, default: null }
    },

    status: {
      type: String,
      enum: ["success", "failure"],
      required: true,
      index: true
    },

    otpVerification: {
      type: String,
      enum: ["not_required", "pending", "success", "failure"],
      default: "not_required"
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

loginLogSchema.index({ userId: 1, timestamp: -1 });

module.exports =
  mongoose.models.LoginLog ||
  mongoose.model("LoginLog", loginLogSchema);
