const mongoose = require("mongoose");

const trustedDeviceSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    deviceFingerprint: {
        type: String,
        required: true
    },
    browser: {
        type: String,
        default: "Unknown"
    },
    lastKnownIP: {
        type: String,
        default: null
    },
    trustedUntil: {
        type: Date,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastSeenAt: {
        type: Date,
        default: Date.now
    }
});

trustedDeviceSchema.index(
    { userId: 1, deviceFingerprint: 1 },
    { unique: true }
);

trustedDeviceSchema.index({ trustedUntil: 1 });

module.exports =
    mongoose.models.TrustedDevice ||
    mongoose.model("TrustedDevice", trustedDeviceSchema);
