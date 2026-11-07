

const mongoose = require("mongoose");

const commentReportSchema = new mongoose.Schema(
  {
    commentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      required: true,
      index: true,
    },

    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    reason: {
      type: String,
      enum: [
        "spam",
        "harassment",
        "hate",
        "misinformation",
        "sexual_content",
        "violence",
        "other",
      ],
      required: true,
    },

    details: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    status: {
      type: String,
      enum: ["pending", "reviewed", "dismissed", "action_taken"],
      default: "pending",
      index: true,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  {
    versionKey: false,
  }
);

// One report per user for each comment.
commentReportSchema.index(
  { commentId: 1, reporterId: 1 },
  { unique: true }
);

module.exports =
  mongoose.models.CommentReport ||
  mongoose.model("CommentReport", commentReportSchema);
