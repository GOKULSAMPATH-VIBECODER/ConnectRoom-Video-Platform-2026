
const mongoose = require("mongoose");

const userSessionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        sessionId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },

        deviceFingerprint: {
            type: String,
            default: null
        },

        browser: {
            type: String,
            default: "Unknown"
        },

        operatingSystem: {
            type: String,
            default: "Unknown"
        },

        device: {
            type: String,
            default: "Unknown"
        },

        ipAddress: {
            type: String,
            default: null
        },

        location: {
            city: { type: String, default: null },
            state: { type: String, default: null },
            country: { type: String, default: null }
        },

        createdAt: {
            type: Date,
            default: Date.now
        },

        lastActivityAt: {
            type: Date,
            default: Date.now
        },

        expiresAt: {
            type: Date,
            required: true,
            index: true
        },

        revokedAt: {
            type: Date,
            default: null
        },

        revokedReason: {
            type: String,
            default: null
        }
    },
    {
        versionKey: false
    }
);

userSessionSchema.index({
    userId: 1,
    createdAt: -1
});

module.exports =
    mongoose.models.UserSession ||
    mongoose.model("UserSession", userSessionSchema);
