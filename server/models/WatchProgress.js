const mongoose = require("mongoose");

const watchProgressSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: "User"
        },
        videoId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: "Video"
        },
        positionSeconds: {
            type: Number,
            default: 0,
            min: 0
        },
        durationSeconds: {
            type: Number,
            default: 0,
            min: 0
        },
        completed: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

watchProgressSchema.index(
    { userId: 1, videoId: 1 },
    { unique: true }
);

module.exports =
    mongoose.models.WatchProgress ||
    mongoose.model("WatchProgress", watchProgressSchema);
