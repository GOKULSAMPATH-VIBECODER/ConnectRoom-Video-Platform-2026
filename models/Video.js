
const mongoose = require("mongoose");

const videoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      default: "",
      maxlength: 5000,
    },
    filePath: {
      type: String,
      required: true,
    },
    thumbnailPath: {
      type: String,
      default: "",
    },
    fileSize: {
      type: Number,
      min: 0,
      default: 0,
    },
    visibility: {
      type: String,
      enum: ["public", "private", "unlisted"],
      default: "public",
      required: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    isDownloadable: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

videoSchema.index({ title: 1 });

module.exports = mongoose.model("Video", videoSchema);
