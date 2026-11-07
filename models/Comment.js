

const mongoose = require("mongoose");
const translationCacheSchema = new mongoose.Schema(
  {
    versionHash: {
      type: String,
      required: true,
    },
    targetLanguage: {
      type: String,
      required: true,
    },
    sourceLanguage: {
      type: String,
      default: "auto",
    },
    translatedText: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  }
);

const commentSchema = new mongoose.Schema(
  {
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

    parentCommentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
    },

    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },

    language: {
      type: String,
      default: "en",
      trim: true,
      lowercase: true,
    },

    // Translation cache must be a top-level field.
    translationCache: {
      type: [translationCacheSchema],
      default: [],
    },

    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    dislikes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    mentions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    edited: {
      type: Boolean,
      default: false,
    },

    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Comment retrieval index.
commentSchema.index({
  videoId: 1,
  parentCommentId: 1,
  createdAt: -1,
});

// User comment history index.
commentSchema.index({
  userId: 1,
  createdAt: -1,
});

module.exports =
  mongoose.models.Comment ||
  mongoose.model("Comment", commentSchema);
