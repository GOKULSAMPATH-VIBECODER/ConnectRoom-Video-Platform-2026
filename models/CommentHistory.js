
const mongoose = require("mongoose");

const CommentHistorySchema = new mongoose.Schema(
  {
    commentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      required: true,
      index: true,
    },

    videoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Video",
      required: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // User who performed the edit or deletion.
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    action: {
      type: String,
      enum: ["edited", "deleted"],
      required: true,
    },

    // Previous content before the operation.
    previousText: {
      type: String,
      required: true,
    },

    // New content for edits; null for deletions.
    newText: {
      type: String,
      default: null,
    },

    occurredAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    versionKey: false,
  }
);

CommentHistorySchema.index({
  commentId: 1,
  occurredAt: -1,
});

module.exports =
  mongoose.models.CommentHistory ||
  mongoose.model("CommentHistory", CommentHistorySchema);
