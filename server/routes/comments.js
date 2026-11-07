
const express = require("express");
const mongoose = require("mongoose");
const crypto = require("crypto");
const User = require("../../models/User");

const Comment = require("../../models/Comment");
const CommentHistory = require("../../models/CommentHistory");
const Video = require("../../models/Video");
const CommentReport = require("../../models/CommentReport");
const Notification = require("../../models/Notification");

const EDIT_WINDOW_MINUTES = Math.max(
    1,
    Number(process.env.COMMENT_EDIT_WINDOW_MINUTES) || 15
);

function validId(id) {
    return mongoose.isValidObjectId(id);
}
function getCommentVersionHash(text) {
    return crypto
        .createHash("sha256")
        .update(text)
        .digest("hex");
}

function isValidLanguageCode(language) {
    return (
        typeof language === "string" &&
        /^[a-zA-Z-]{2,20}$/.test(language)
    );
}
function validateText(text) {
    return (
        typeof text === "string" &&
        text.trim().length > 0 &&
        text.trim().length <= 5000
    );
}

function getMentions(mentions) {
    
async function resolveMentions(text) {
    const regex = /(?:^|[^a-zA-Z0-9_@])@([a-z0-9_]{3,30})(?![a-z0-9_])/gi;

    const usernames = new Set();
    let match;

    while ((match = regex.exec(text)) !== null) {
        usernames.add(match[1].toLowerCase());

        if (usernames.size > 20) {
            return null;
        }
    }

    if (usernames.size === 0) {
        return {
            ids: [],
            users: []
        };
    }

    const users = await User.find({
        username: {
            $in: [...usernames]
        }
    })
        .select("_id username name notificationPreferences")
        .lean();

    return {
        ids: users.map(user => user._id),
        users
    };
}

async function createMentionNotifications({
    users,
    actorId,
    actorName,
    commentId,
    videoId
}) {
    const notifications = users
        .filter(user =>
            String(user._id) !== String(actorId) &&
            user.notificationPreferences?.mentions !== false
        )
        .map(user => ({
            updateOne: {
                filter: {
                    recipientId: user._id,
                    commentId,
                    type: "mention"
                },
                update: {
                    $setOnInsert: {
                        recipientId: user._id,
                        actorId,
                        type: "mention",
                        commentId,
                        videoId,
                        message: `${actorName || "Someone"} mentioned you in a comment.`
                    }
                },
                upsert: true
            }
        }));

    if (notifications.length > 0) {
        await Notification.bulkWrite(notifications);
    }
}


    // Public and unlisted videos are accessible when their ID is known.
    return video;
}

function formatComment(comment) {
    const likes = comment.likes || [];
    const dislikes = comment.dislikes || [];

    return {
        _id: comment._id,
        videoId: comment.videoId,
        user: comment.userId,
        parentCommentId: comment.parentCommentId,
        text: comment.text,
        language: comment.language,
        likesCount: likes.length,
        dislikesCount: dislikes.length,
        edited: comment.edited,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt
    };
}

function createCommentsRouter({ authenticateToken }) {
    const router = express.Router();

    // --------------------------------------------------
    // GET /api/videos/:videoId/comments
    // List original comments and their replies.
    // --------------------------------------------------

    router.get(
        "/videos/:videoId/comments",
        authenticateToken,
        async (req, res) => {
            try {
                const { videoId } = req.params;

                if (!validId(videoId)) {
                    return res.status(400).json({
                        message: "Invalid video ID."
                    });
                }

                const video = await canAccessVideo(
                    videoId,
                    req.user.id
                );

                if (!video) {
                    return res.status(404).json({
                        message: "Video not found or unavailable."
                    });
                }

                const page = Math.max(
                    1,
                    parseInt(req.query.page, 10) || 1
                );

                const limit = Math.min(
                    100,
                    Math.max(1, parseInt(req.query.limit, 10) || 20)
                );

                const filter = {
                    videoId,
                    parentCommentId: null,
                    deletedAt: null
                };

                const [comments, total] = await Promise.all([
                    Comment.find(filter)
                        .sort({ createdAt: -1 })
                        .skip((page - 1) * limit)
                        .limit(limit)
                        .populate("userId", "name profileImage location shareLocation")
                        .lean(),

                    Comment.countDocuments(filter)
                ]);

                const commentIds = comments.map(comment => comment._id);

                let replies = [];

                if (commentIds.length > 0) {
                    replies = await Comment.find({
                        videoId,
                        parentCommentId: { $in: commentIds },
                        deletedAt: null
                    })
                        .sort({ createdAt: 1 })
                        .limit(limit * 20)
                        .populate("userId", "name")
                        .lean();
                }

                const repliesByParent = new Map();

                for (const reply of replies) {
                    const parentId = String(reply.parentCommentId);

                    if (!repliesByParent.has(parentId)) {
                        repliesByParent.set(parentId, []);
                    }

                    repliesByParent.get(parentId).push(
                        formatComment(reply)
                    );
                }

                const result = comments.map(comment => ({
                    ...formatComment(comment),
                    replies: repliesByParent.get(String(comment._id)) || []
                }));

                return res.json({
                    videoId,
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                    comments: result
                });
            } catch (error) {
                console.error("List comments error:", error);

                return res.status(500).json({
                    message: "Could not load comments."
                });
            }
        }
    );

    // --------------------------------------------------
    // POST /api/videos/:videoId/comments
    // Add an original comment.
    // --------------------------------------------------

    router.post(
        "/videos/:videoId/comments",
        authenticateToken,
        async (req, res) => {
            try {
                const { videoId } = req.params;
                const { text, language = "en" } = req.body;

                if (!validId(videoId)) {
                    return res.status(400).json({
                        message: "Invalid video ID."
                    });
                }

                if (!validateText(text)) {
                    return res.status(400).json({
                        message: "Comment must contain 1–5000 characters."
                    });
                }

                const video = await canAccessVideo(
                    videoId,
                    req.user.id
                );

                if (!video) {
                    return res.status(404).json({
                        message: "Video not found or unavailable."
                    });
                }

                if (
                    typeof language !== "string" ||
                    language.length > 20
                ) {
                    return res.status(400).json({
                        message: "Invalid language."
                    });
                }

                const comment = await Comment.create({
                    videoId,
                    userId: req.user.id,
                    parentCommentId: null,
                    text: text.trim(),
                    language: language.trim(),
                    mentions: validMentions
                });

                await comment.populate("userId", "name");
                await saveModerationFlags(comment);
                await saveModerationFlags(reply);

                return res.status(201).json({
                    message: "Comment added successfully.",
                    comment: formatComment(comment)
                });
            } catch (error) {
                console.error("Add comment error:", error);

                return res.status(500).json({
                    message: "Could not add comment."
                });
            }
        }
    );

    // --------------------------------------------------
    // POST /api/comments/:id/replies
    // Reply to an original comment.
    // --------------------------------------------------

    router.post(
        "/comments/:id/replies",
        authenticateToken,
        async (req, res) => {
            try {
                const { id } = req.params;
                const { text, language = "en", mentions, captchaToken } = req.body;

                if (!validId(id)) {
                    return res.status(400).json({
                        message: "Invalid comment ID."
                    });
                }

                if (!validateText(text)) {
                    return res.status(400).json({
                        message: "Reply must contain 1–5000 characters."
                    });
                }

                const parent = await Comment.findOne({
                    _id: id,
                    deletedAt: null
                });

                if (!parent) {
                    return res.status(404).json({
                        message: "Original comment not found."
                    });
                }

                if (parent.parentCommentId) {
                    return res.status(400).json({
                        message: "Replies must be attached to an original comment."
                    });
                }

                const video = await canAccessVideo(
                    parent.videoId,
                    req.user.id
                );

                if (!video) {
                    return res.status(404).json({
                        message: "Video not found or unavailable."
                    });
                }

                const validMentions = getMentions(mentions);

                if (validMentions === null) {
                    return res.status(400).json({
                        message: "Invalid mentions."
                    });
                }

                if (
                    typeof language !== "string" ||
                    language.length > 20
                ) {
                    return res.status(400).json({
                        message: "Invalid language."
                    });
                }

                const reply = await Comment.create({
                    videoId: parent.videoId,
                    userId: req.user.id,
                    parentCommentId: parent._id,
                    text: text.trim(),
                    language: language.trim(),
                    mentions: validMentions
                });

                await reply.populate("userId", "name");

                return res.status(201).json({
                    message: "Reply added successfully.",
                    reply: formatComment(reply)
                });
            } catch (error) {
                console.error("Add reply error:", error);

                return res.status(500).json({
                    message: "Could not add reply."
                });
            }
        }
    );

    // --------------------------------------------------
    // PATCH /api/comments/:id
    // Edit own comment within the allowed time.
    // --------------------------------------------------

    router.patch(
        "/comments/:id",
        authenticateToken,
        async (req, res) => {
            const session = await mongoose.startSession();

            try {
                const { id } = req.params;
                const { text, language, mentions } = req.body;

                if (!validId(id)) {
                    return res.status(400).json({
                        message: "Invalid comment ID."
                    });
                }

                if (!validateText(text)) {
                    return res.status(400).json({
                        message: "Comment must contain 1–5000 characters."
                    });
                }

                const validMentions = getMentions(mentions);

                if (validMentions === null) {
                    return res.status(400).json({
                        message: "Invalid mentions."
                    });
                }

                if (
                    language !== undefined &&
                    (typeof language !== "string" || language.length > 20)
                ) {
                    return res.status(400).json({
                        message: "Invalid language."
                    });
                }

                let updatedComment;

                await session.withTransaction(async () => {
                    const comment = await Comment.findOne({
                        _id: id,
                        userId: req.user.id,
                        deletedAt: null
                    }).session(session);

                    if (!comment) {
                        const error = new Error("COMMENT_NOT_FOUND");
                        throw error;
                    }

                    const elapsed =
                        Date.now() - new Date(comment.createdAt).getTime();

                    const editWindow =
                        EDIT_WINDOW_MINUTES * 60 * 1000;

                    if (elapsed > editWindow) {
                        const error = new Error("EDIT_WINDOW_EXPIRED");
                        throw error;
                    }

                    const video = await Video.findOne({
                        _id: comment.videoId,
                        isActive: true
                    }).session(session);

                    if (!video) {
                        const error = new Error("VIDEO_UNAVAILABLE");
                        throw error;
                    }

                    const previousText = comment.text;

                    await CommentHistory.create(
                        [{
                            commentId: comment._id,
                            videoId: comment.videoId,
                            userId: comment.userId,
                            performedBy: req.user.id,
                            action: "edited",
                            previousText,
                            newText: text.trim()
                        }],
                        { session }
                    );

                    comment.text = text.trim();
                    comment.translationCache = [];

                    if (language !== undefined) {
                        comment.language = language.trim();
                    }

                    if (mentions !== undefined) {
                        comment.mentions = validMentions;
                    }

                    comment.edited = true;

                    await comment.save({ session });

                    updatedComment = comment;
                });

                await updatedComment.populate("userId", "name");

                return res.json({
                    message: "Comment updated successfully.",
                    comment: formatComment(updatedComment)
                });
            } catch (error) {
                if (error.message === "COMMENT_NOT_FOUND") {
                    return res.status(404).json({
                        message: "Comment not found or you do not own it."
                    });
                }

                if (error.message === "EDIT_WINDOW_EXPIRED") {
                    return res.status(403).json({
                        message: `Comments can only be edited within ${EDIT_WINDOW_MINUTES} minutes of creation.`
                    });
                }

                if (error.message === "VIDEO_UNAVAILABLE") {
                    return res.status(404).json({
                        message: "Video is unavailable."
                    });
                }

                console.error("Edit comment error:", error);

                return res.status(500).json({
                    message: "Could not edit comment."
                });
            } finally {
                await session.endSession();
            }
        }
    );

    // --------------------------------------------------
    // DELETE /api/comments/:id
    // Soft-delete own comment and save history.
    // --------------------------------------------------

    router.delete(
        "/comments/:id",
        authenticateToken,
        async (req, res) => {
            const session = await mongoose.startSession();

            try {
                const { id } = req.params;

                if (!validId(id)) {
                    return res.status(400).json({
                        message: "Invalid comment ID."
                    });
                }

                await session.withTransaction(async () => {
                    const comment = await Comment.findOne({
                        _id: id,
                        userId: req.user.id,
                        deletedAt: null
                    }).session(session);

                    if (!comment) {
                        const error = new Error("COMMENT_NOT_FOUND");
                        throw error;
                    }

                    await CommentHistory.create(
                        [{
                            commentId: comment._id,
                            videoId: comment.videoId,
                            userId: comment.userId,
                            performedBy: req.user.id,
                            action: "deleted",
                            previousText: comment.text,
                            newText: null
                        }],
                        { session }
                    );

                    comment.deletedAt = new Date();
                    await comment.save({ session });
                });

                return res.json({
                    message: "Comment deleted successfully."
                });
            } catch (error) {
                if (error.message === "COMMENT_NOT_FOUND") {
                    return res.status(404).json({
                        message: "Comment not found or you do not own it."
                    });
                }

                console.error("Delete comment error:", error);

                return res.status(500).json({
                    message: "Could not delete comment."
                });
            } finally {
                await session.endSession();
            }
        }
    );

    // --------------------------------------------------
    // POST /api/comments/:id/reactions
    // Like or dislike a comment.
    // --------------------------------------------------

    router.post(
        "/comments/:id/reactions",
        authenticateToken,
        async (req, res) => {
            try {
                const { id } = req.params;
                const { type } = req.body;

                if (!validId(id)) {
                    return res.status(400).json({
                        message: "Invalid comment ID."
                    });
                }

                if (!["like", "dislike"].includes(type)) {
                    return res.status(400).json({
                        message: 'Reaction must be "like" or "dislike".'
                    });
                }

                const comment = await Comment.findOne({
                    _id: id,
                    deletedAt: null
                });

                if (!comment) {
                    return res.status(404).json({
                        message: "Comment not found."
                    });
                }

                const video = await canAccessVideo(
                    comment.videoId,
                    req.user.id
                );

                if (!video) {
                    return res.status(404).json({
                        message: "Video not found or unavailable."
                    });
                }

                const userId = new mongoose.Types.ObjectId(req.user.id);

                const currentArray =
                    type === "like" ? comment.likes : comment.dislikes;

                const oppositeField =
                    type === "like" ? "dislikes" : "likes";

                const currentField =
                    type === "like" ? "likes" : "dislikes";

                const alreadyReacted = currentArray.some(
                    value => String(value) === String(userId)
                );

                const update = alreadyReacted
                    ? {
                        $pull: {
                            [currentField]: userId,
                            [oppositeField]: userId
                        }
                    }
                    : {
                        $addToSet: {
                            [currentField]: userId
                        },
                        $pull: {
                            [oppositeField]: userId
                        }
                    };

                await Comment.updateOne(
                    {
                        _id: id,
                        deletedAt: null
                    },
                    update
                );

                const updated = await Comment.findById(id).select(
                    "likes dislikes"
                );

                return res.json({
                    message: alreadyReacted
                        ? "Reaction removed."
                        : "Reaction saved.",
                    reaction: alreadyReacted ? null : type,
                    likesCount: updated.likes.length,
                    dislikesCount: updated.dislikes.length
                });
            } catch (error) {
                console.error("Comment reaction error:", error);

                return res.status(500).json({
                    message: "Could not update reaction."
                });
            }
        }
    );

    // --------------------------------------------------
    // POST /api/comments/:id/report
    // Report a comment.
    // --------------------------------------------------

    router.post(
        "/comments/:id/report",
        authenticateToken,
        async (req, res) => {
            try {
                const { id } = req.params;
                const { reason, details = "" } = req.body;

                const allowedReasons = [
                    "spam",
                    "harassment",
                    "hate",
                    "misinformation",
                    "sexual_content",
                    "violence",
                    "other"
                ];

                if (!validId(id)) {
                    return res.status(400).json({
                        message: "Invalid comment ID."
                    });
                }

                if (!allowedReasons.includes(reason)) {
                    return res.status(400).json({
                        message: "Select a valid report reason."
                    });
                }

                if (
                    typeof details !== "string" ||
                    details.length > 1000
                ) {
                    return res.status(400).json({
                        message: "Report details must be under 1000 characters."
                    });
                }

                const comment = await Comment.findOne({
                    _id: id,
                    deletedAt: null
                });

                if (!comment) {
                    return res.status(404).json({
                        message: "Comment not found."
                    });
                }

                const video = await canAccessVideo(
                    comment.videoId,
                    req.user.id
                );

                if (!video) {
                    return res.status(404).json({
                        message: "Video not found or unavailable."
                    });
                }

                await CommentReport.create({
                    commentId: comment._id,
                    videoId: comment.videoId,
                    userId: req.user.id,
                    reason,
                    details: details.trim()
                });

                return res.status(201).json({
                    message: "Comment reported successfully."
                });
            } catch (error) {
                if (error.code === 11000) {
                    return res.status(409).json({
                        message: "You have already reported this comment."
                    });
                }

                console.error("Report comment error:", error);

                return res.status(500).json({
                    message: "Could not submit comment report."
                });
            }
        }
    );

      // --------------------------------------------------
    // GET /api/me/translation-language
    // Get the logged-in user's preferred language.
    // --------------------------------------------------

    router.get(
        "/me/translation-language",
        authenticateToken,
        async (req, res) => {
            try {
                const user = await User.findById(req.user.id)
                    .select("preferredLanguage");

                if (!user) {
                    return res.status(404).json({
                        message: "User not found."
                    });
                }

                return res.json({
                    preferredLanguage: user.preferredLanguage || "en"
                });
            } catch (error) {
                console.error("Get translation language error:", error);

                return res.status(500).json({
                    message: "Could not load preferred language."
                });
            }
        }
    );

    // --------------------------------------------------
    // PUT /api/me/translation-language
    // Save the logged-in user's preferred language.
    // --------------------------------------------------

    router.put(
        "/me/translation-language",
        authenticateToken,
        async (req, res) => {
            try {
                const { preferredLanguage } = req.body;

                if (!isValidLanguageCode(preferredLanguage)) {
                    return res.status(400).json({
                        message: "Provide a valid language code."
                    });
                }

                const normalizedLanguage =
                    preferredLanguage.trim().toLowerCase();

                const user = await User.findByIdAndUpdate(
                    req.user.id,
                    {
                        preferredLanguage: normalizedLanguage
                    },
                    {
                        new: true,
                        runValidators: true
                    }
                ).select("preferredLanguage");

                if (!user) {
                    return res.status(404).json({
                        message: "User not found."
                    });
                }

                return res.json({
                    message: "Preferred language updated.",
                    preferredLanguage: user.preferredLanguage
                });
            } catch (error) {
                console.error("Update translation language error:", error);

                return res.status(500).json({
                    message: "Could not update preferred language."
                });
            }
        }
    );

    // --------------------------------------------------
    // POST /api/comments/:id/translate
    // Translate comments and cache by comment version
    // and target language.
    // --------------------------------------------------

    router.post(
        "/comments/:id/translate",
        authenticateToken,
        async (req, res) => {
            try {
                const { id } = req.params;
                const requestedLanguage = req.body.targetLanguage;

                if (!validId(id)) {
                    return res.status(400).json({
                        message: "Invalid comment ID."
                    });
                }

                const comment = await Comment.findOne({
                    _id: id,
                    deletedAt: null
                });

                if (!comment) {
                    return res.status(404).json({
                        message: "Comment not found."
                    });
                }

                const video = await canAccessVideo(
                    comment.videoId,
                    req.user.id
                );

                if (!video) {
                    return res.status(404).json({
                        message: "Video not found or unavailable."
                    });
                }

                let targetLanguage;

                if (requestedLanguage !== undefined) {
                    if (!isValidLanguageCode(requestedLanguage)) {
                        return res.status(400).json({
                            message: "Provide a valid target language code."
                        });
                    }

                    targetLanguage =
                        requestedLanguage.trim().toLowerCase();
                } else {
                    const user = await User.findById(req.user.id)
                        .select("preferredLanguage");

                    targetLanguage =
                        user?.preferredLanguage || "en";
                }

                const versionHash =
                    getCommentVersionHash(comment.text);

                // Check whether this exact comment version and
                // target language have already been translated.
                const cachedTranslation =
                    (comment.translationCache || []).find(item =>
                        item.versionHash === versionHash &&
                        item.targetLanguage === targetLanguage
                    );

                if (cachedTranslation) {
                    return res.json({
                        commentId: comment._id,
                        sourceLanguage: cachedTranslation.sourceLanguage,
                        targetLanguage,
                        translatedText: cachedTranslation.translatedText,
                        cached: true
                    });
                }

                const translationUrl =
                    process.env.TRANSLATION_API_URL;

                if (!translationUrl) {
                    return res.status(503).json({
                        message:
                            "Translation is not configured. Set TRANSLATION_API_URL in your server environment."
                    });
                }

                if (typeof fetch !== "function") {
                    return res.status(503).json({
                        message:
                            "This Node.js version does not support fetch."
                    });
                }

                const payload = {
                    q: comment.text,
                    source: "auto",
                    target: targetLanguage,
                    format: "text"
                };

                if (process.env.TRANSLATION_API_KEY) {
                    payload.api_key =
                        process.env.TRANSLATION_API_KEY;
                }

                const response = await fetch(translationUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(15000)
                });

                if (!response.ok) {
                    return res.status(502).json({
                        message:
                            "Translation provider returned an error. Please retry."
                    });
                }

                const result = await response.json();

                if (
                    typeof result.translatedText !== "string" ||
                    !result.translatedText.trim()
                ) {
                    return res.status(502).json({
                        message:
                            "Translation provider returned an invalid result."
                    });
                }

                // LibreTranslate detects the source language
                // when source is set to "auto".
                const sourceLanguage =
                    result.detectedLanguage?.language || "auto";

                // Save translation against this exact comment version.
                comment.translationCache =
                    (comment.translationCache || []).filter(item =>
                        !(
                            item.versionHash === versionHash &&
                            item.targetLanguage === targetLanguage
                        )
                    );

                comment.translationCache.push({
                    versionHash,
                    targetLanguage,
                    sourceLanguage,
                    translatedText: result.translatedText.trim(),
                    createdAt: new Date()
                });

                // Keep the cache bounded.
                if (comment.translationCache.length > 20) {
                    comment.translationCache =
                        comment.translationCache.slice(-20);
                }

                await comment.save();

                return res.json({
                    commentId: comment._id,
                    sourceLanguage,
                    targetLanguage,
                    translatedText: result.translatedText.trim(),
                    cached: false
                });
            } catch (error) {
                console.error("Translate comment error:", error);

                return res.status(502).json({
                    message:
                        "Could not translate this comment. Please retry."
                });
            }
        }
    );
    return router;
}

module.exports = createCommentsRouter;
