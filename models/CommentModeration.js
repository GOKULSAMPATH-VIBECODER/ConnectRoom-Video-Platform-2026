
const mongoose = require("mongoose");

const commentModerationSchema = new mongoose.Schema(
    {
        commentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Comment",
            required: true,
            index: true
        },
        videoId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Video",
            required: true,
            index: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        reason: {
            type: String,
            enum: [
                "spam",
                "profanity",
                "suspicious_url",
                "excessive_characters",
                "duplicate",
                "user_report"
            ],
            required: true
        },
        details: {
            type: String,
            default: "",
            maxlength: 1000
        },
        status: {
            type: String,
            enum: ["pending", "approved", "removed"],
            default: "pending",
            index: true
        },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },
        reviewedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

commentModerationSchema.index({
    status: 1,
    createdAt: -1
});

module.exports =
    mongoose.models.CommentModeration ||
    mongoose.model("CommentModeration", commentModerationSchema);
