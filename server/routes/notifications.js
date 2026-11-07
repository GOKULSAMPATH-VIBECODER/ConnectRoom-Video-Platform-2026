const express = require("express");
const mongoose = require("mongoose");

const Notification = require("../../models/Notification");
const User = require("../../models/User");

function createNotificationsRouter({ authenticateToken }) {
    const router = express.Router();

    // GET /api/notifications
    router.get("/", authenticateToken, async (req, res) => {
        try {
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

            const filter = { recipientId: req.user.id };

            const [notifications, total, unreadCount] = await Promise.all([
                Notification.find(filter)
                    .sort({ createdAt: -1 })
                    .skip((page - 1) * limit)
                    .limit(limit)
                    .populate("actorId", "name username profileImage")
                    .populate("commentId", "text videoId deletedAt")
                    .lean(),

                Notification.countDocuments(filter),

                Notification.countDocuments({
                    recipientId: req.user.id,
                    readAt: null
                })
            ]);

            return res.json({
                notifications,
                total,
                unreadCount,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            });
        } catch (error) {
            console.error("List notifications error:", error);
            return res.status(500).json({
                message: "Could not load notifications."
            });
        }
    });

    // PATCH /api/notifications/read-all
    router.patch("/read-all", authenticateToken, async (req, res) => {
        try {
            const result = await Notification.updateMany(
                {
                    recipientId: req.user.id,
                    readAt: null
                },
                {
                    $set: { readAt: new Date() }
                }
            );

            return res.json({
                message: "All notifications marked as read.",
                modifiedCount: result.modifiedCount
            });
        } catch (error) {
            console.error("Mark all notifications read error:", error);
            return res.status(500).json({
                message: "Could not update notifications."
            });
        }
    });

    // PATCH /api/notifications/:id/read
    router.patch("/:id/read", authenticateToken, async (req, res) => {
        try {
            const { id } = req.params;

            if (!mongoose.isValidObjectId(id)) {
                return res.status(400).json({
                    message: "Invalid notification ID."
                });
            }

            const notification = await Notification.findOneAndUpdate(
                {
                    _id: id,
                    recipientId: req.user.id
                },
                {
                    $set: { readAt: new Date() }
                },
                { new: true }
            );

            if (!notification) {
                return res.status(404).json({
                    message: "Notification not found."
                });
            }

            return res.json({
                message: "Notification marked as read.",
                notification
            });
        } catch (error) {
            console.error("Mark notification read error:", error);
            return res.status(500).json({
                message: "Could not update notification."
            });
        }
    });

    // GET /api/notifications/preferences
    router.get("/preferences", authenticateToken, async (req, res) => {
        try {
            const user = await User.findById(req.user.id)
                .select("notificationPreferences");

            if (!user) {
                return res.status(404).json({
                    message: "User not found."
                });
            }

            return res.json({
                notificationPreferences: {
                    mentions: user.notificationPreferences?.mentions !== false
                }
            });
        } catch (error) {
            console.error("Get notification preferences error:", error);
            return res.status(500).json({
                message: "Could not load notification preferences."
            });
        }
    });

    // PATCH /api/notifications/preferences
    router.patch("/preferences", authenticateToken, async (req, res) => {
        try {
            const { mentions } = req.body || {};

            if (typeof mentions !== "boolean") {
                return res.status(400).json({
                    message: "The mentions setting must be true or false."
                });
            }

            const user = await User.findByIdAndUpdate(
                req.user.id,
                {
                    $set: {
                        "notificationPreferences.mentions": mentions
                    }
                },
                {
                    new: true,
                    runValidators: true
                }
            ).select("notificationPreferences");

            if (!user) {
                return res.status(404).json({
                    message: "User not found."
                });
            }

            return res.json({
                message: "Notification preferences updated.",
                notificationPreferences: user.notificationPreferences
            });
        } catch (error) {
            console.error("Update notification preferences error:", error);
            return res.status(500).json({
                message: "Could not update notification preferences."
            });
        }
    });

    return router;
}

module.exports = createNotificationsRouter;
