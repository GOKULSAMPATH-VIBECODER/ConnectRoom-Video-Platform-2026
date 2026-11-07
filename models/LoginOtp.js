const mongoose = require("mongoose");

const loginOtpSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    deviceFingerprint: {
        type: String,
        required: true
    },
    otpHash: {
        type: String,
        required: true
    },
    otpExpiresAt: {
        type: Date,
        required: true
    },
    attempts: {
        type: Number,
        default: 0
    },
    sendCount: {
        type: Number,
        default: 1
    },
    windowStartedAt: {
        type: Date,
        default: Date.now
    },
    lastSentAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        required: true
    }
}, {
    timestamps: true
});

loginOtpSchema.index(
    { userId: 1, deviceFingerprint: 1 },
    { unique: true }
);

loginOtpSchema.index(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 }
);

module.exports =
    mongoose.models.LoginOtp ||
    mongoose.model("LoginOtp", loginOtpSchema);
