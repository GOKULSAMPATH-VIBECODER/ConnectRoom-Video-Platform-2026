const express = require("express");
const mongoose = require("mongoose");
const WatchProgress = require("../models/WatchProgress");
const Video = require("../../models/Video");

module.exports = function createWatchProgressRouter({ authenticateToken }) {
    const router = express.Router();

    async function findAccessibleVideo(videoId, userId) {
        if (!mongoose.Types.ObjectId.isValid(videoId)) {
            return { error: "Invalid video ID.", status: 400 };
        }

        const video = await Video.findOne({
            _id: videoId,
            isActive: true
        }).select("_id ownerId visibility");

        if (!video) {
            return { error: "Video not found.", status: 404 };
        }

        if (
            video.visibility === "private" &&
            video.ownerId.toString() !== userId
        ) {
            return { error: "You do not have access to this video.", status: 403 };
        }

        return { video };
    }

    // Get the logged-in user's saved progress for one video.
    router.get("/:videoId", authenticateToken, async (req, res) => {
        try {
            const userId = req.user.id;
            const result = await findAccessibleVideo(req.params.videoId, userId);

            if (result.error) {
                return res.status(result.status).json({
                    message: result.error
                });
            }

            const progress = await WatchProgress.findOne({
                userId,
                videoId: result.video._id
            }).lean();

            return res.json({ progress: progress || null });
        } catch (error) {
            console.error("Get watch progress error:", error);
            return res.status(500).json({
                message: "Could not load watch progress."
            });
        }
    });

    // Insert or update one progress record per user/video pair.
    router.put("/:videoId", authenticateToken, async (req, res) => {
        try {
            const userId = req.user.id;
            const result = await findAccessibleVideo(req.params.videoId, userId);

            if (result.error) {
                return res.status(result.status).json({
                    message: result.error
                });
            }

            const { positionSeconds, durationSeconds, completed } = req.body;

            if (
                typeof positionSeconds !== "number" ||
                !Number.isFinite(positionSeconds) ||
                positionSeconds < 0 ||
                typeof durationSeconds !== "number" ||
                !Number.isFinite(durationSeconds) ||
                durationSeconds < 0 ||
                (completed !== undefined && typeof completed !== "boolean")
            ) {
                return res.status(400).json({
                    message: "Position, duration, and completion values are invalid."
                });
            }

            const safeDuration = Math.min(durationSeconds, 7 * 24 * 60 * 60);
            const safePosition = Math.min(positionSeconds, safeDuration || positionSeconds);
            const isCompleted =
                completed === true ||
                (safeDuration > 0 && safePosition >= safeDuration - 2);

            const progress = await WatchProgress.findOneAndUpdate(
                {
                    userId,
                    videoId: result.video._id
                },
                {
                    $set: {
                        positionSeconds: safePosition,
                        durationSeconds: safeDuration,
                        completed: isCompleted
                    }
                },
                {
                    new: true,
                    upsert: true,
                    runValidators: true,
                    setDefaultsOnInsert: true
                }
            );

            return res.json({
                message: "Watch progress saved.",
                progress
            });
        } catch (error) {
            // The unique index prevents duplicate records for the same pair.
            if (error.code === 11000) {
                return res.status(409).json({
                    message: "Progress was updated concurrently. Please retry."
                });
            }

            console.error("Save watch progress error:", error);
            return res.status(500).json({
                message: "Could not save watch progress."
            });
        }
    });

    return router;
};
