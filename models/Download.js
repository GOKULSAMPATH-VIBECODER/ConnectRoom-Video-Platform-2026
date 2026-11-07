

const mongoose = require("mongoose");
const crypto = require("crypto");

const downloadSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        videoId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Video",
            required: true,
            index: true
        },
        plan: {
            type: String,
            enum: ["Free", "Bronze", "Silver", "Gold"],
            required: true
        },
        status: {
            type: String,
            enum: [
                "pending",
                "in_progress",
                "completed",
                "interrupted",
                "failed",
                "cancelled"
            ],
            default: "pending",
            required: true
        },
        requestedAt: {
            type: Date,
            default: Date.now,
            required: true
        },
        completedAt: {
            type: Date,
            default: null
        },
        fileSize: {
            type: Number,
            min: 0,
            default: null
        },
        ipAddress: {
            type: String,
            maxlength: 45
        },
        userAgent: {
            type: String,
            maxlength: 1000
        },
        deviceInfo: {
            type: String,
            maxlength: 500
        },
        quotaReserved: {
            type: Boolean,
            default: false
        },
        quotaConsumed: {
            type: Boolean,
            default: false
        },
        idempotencyKey: {
            type: String,
            required: true,
            immutable: true,
            default: () => crypto.randomUUID(),
            maxlength: 100
        },
        quotaDay: {
            type: String,
            required: true
        },
        quotaMonth: {
            type: String,
            required: true
        }
    },
    { timestamps: true }
);

downloadSchema.index(
    { userId: 1, idempotencyKey: 1 },
    { unique: true }
);

downloadSchema.index({
    userId: 1,
    quotaDay: 1,
    status: 1
});

downloadSchema.index({
    userId: 1,
    quotaMonth: 1,
    status: 1
});

module.exports =
    mongoose.models.Download ||
    mongoose.model("Download", downloadSchema);
