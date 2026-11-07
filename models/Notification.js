const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
    {
        recipientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        actorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        type: {
            type: String,
            enum: ["mention"],
            required: true,
            default: "mention"
        },

        commentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Comment",
            required: true
        },

        videoId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Video",
            required: true
        },

        message: {
            type: String,
            required: true,
            maxlength: 300
        },

        readAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

notificationSchema.index(
    {
        recipientId: 1,
        createdAt: -1
    }
);

notificationSchema.index(
    {
        recipientId: 1,
        commentId: 1,
        type: 1
    },
    {
        unique: true
    }
);

module.exports =
    mongoose.models.Notification ||
    mongoose.model("Notification", notificationSchema);
