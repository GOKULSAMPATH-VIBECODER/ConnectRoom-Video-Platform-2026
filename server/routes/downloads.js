
const express = require("express");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const Video = require("../../models/Video");
const Download = require("../../models/Download");
const Subscription = require("../../models/Subscription");
const QuotaUsage = require("../../models/QuotaUsage");

const {
    PLAN_LIMITS,
    getISTKeys,
    reserveQuota
} = require("../services/quota");

const STORAGE_ROOT = path.resolve(
    __dirname,
    "..",
    process.env.VIDEO_STORAGE_DIR || "uploads/videos"
);

function resolveVideoFile(filePath) {
    if (typeof filePath !== "string" || !filePath.trim()) {
        return null;
    }

    const resolved = path.resolve(STORAGE_ROOT, filePath);
    const relative = path.relative(STORAGE_ROOT, resolved);

    if (
        relative === "" ||
        relative === ".." ||
        relative.startsWith(".." + path.sep) ||
        path.isAbsolute(relative)
    ) {
        return null;
    }

    return resolved;
}

/**
 * Resolve the current subscription using either the current
 * date fields or the legacy date fields.
 *
 * A paid plan is valid only when its status is active and
 * its start date has passed but its expiry date has not.
 * Otherwise, the user receives Free-plan entitlements.
 */
async function getCurrentPlan(userId) {
    const now = new Date();

    const subscription = await Subscription.findOne({
        userId,
        status: "active",
        plan: { $in: ["Bronze", "Silver", "Gold"] },
        $or: [
            {
                startDate: { $lte: now },
                expiryDate: { $gt: now }
            },
            {
                startsAt: { $lte: now },
                expiresAt: { $gt: now }
            },
            {
                startDate: { $lte: now },
                expiresAt: { $gt: now }
            },
            {
                startsAt: { $lte: now },
                expiryDate: { $gt: now }
            }
        ]
    }).sort({
        expiryDate: -1,
        expiresAt: -1
    });

    return {
        plan: subscription ? subscription.plan : "Free",
        subscription
    };
}

function getDailyCount(usage, dayKey) {
    if (!usage || !usage.dailyCounts) return 0;

    if (typeof usage.dailyCounts.get === "function") {
        return usage.dailyCounts.get(dayKey) || 0;
    }

    return usage.dailyCounts[dayKey] || 0;
}

function parseSingleRange(header, size) {
    if (!header) return null;

    // Multiple ranges are intentionally unsupported.
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());

    if (!match || (!match[1] && !match[2])) {
        return { invalid: true };
    }

    let start;
    let end;

    if (!match[1]) {
        const suffixLength = Number(match[2]);

        if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
            return { invalid: true };
        }

        start = Math.max(0, size - suffixLength);
        end = size - 1;
    } else {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : size - 1;

        if (
            !Number.isSafeInteger(start) ||
            !Number.isSafeInteger(end) ||
            start < 0 ||
            end < start ||
            start >= size
        ) {
            return { invalid: true };
        }

        end = Math.min(end, size - 1);
    }

    if (size === 0 || start >= size) {
        return { invalid: true };
    }

    return { start, end };
}

function safeFilename(title, filePath) {
    const extension = path.extname(filePath).slice(0, 12);
    const base = String(title || "video")
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
        .replace(/[. ]+$/g, "")
        .slice(0, 150) || "video";

    return `${base}${extension}`;
}

function createDownloadsRouter({ authenticateToken }) {
    const router = express.Router();

    // GET /api/downloads
    // List the signed-in user's download records.
    router.get("/", authenticateToken, async (req, res) => {
        try {
            const downloads = await Download.find({
                userId: req.user.id
            })
                .sort({ createdAt: -1 })
                .limit(100)
                .populate("videoId", "title thumbnailPath");

            return res.json({ downloads });
        } catch (error) {
            console.error("List downloads error:", error);
            return res.status(500).json({
                message: "Could not load downloads."
            });
        }
    });

    // GET /api/downloads/quota
    router.get("/quota", authenticateToken, async (req, res) => {
        try {
            const { plan } = await getCurrentPlan(req.user.id);
            const limits = PLAN_LIMITS[plan];

            if (!limits) {
                throw new Error(`Missing quota limits for plan: ${plan}`);
            }

            const { dayKey, monthKey } = getISTKeys();

            const usage = await QuotaUsage.findOne({
                userId: req.user.id,
                monthKey
            }).lean();

            const dailyUsed = getDailyCount(usage, dayKey);
            const monthlyUsed = usage?.monthlyCount || 0;

            return res.json({
                plan,
                timezone: "Asia/Kolkata",
                dailyLimit: limits.daily,
                dailyUsed,
                dailyRemaining: Math.max(0, limits.daily - dailyUsed),
                monthlyLimit: limits.monthly,
                monthlyUsed,
                monthlyRemaining: Math.max(
                    0,
                    limits.monthly - monthlyUsed
                )
            });
        } catch (error) {
            console.error("Quota status error:", error);
            return res.status(500).json({
                message: "Could not load quota status."
            });
        }
    });

    // POST /api/downloads/:videoId
    // Create a download request or reuse an existing request.
    router.post("/:videoId", authenticateToken, async (req, res) => {
        try {
            const userId = req.user.id;
            const { videoId } = req.params;

            if (!mongoose.isValidObjectId(videoId)) {
                return res.status(400).json({
                    message: "Invalid video ID."
                });
            }

            const idempotencyKey = req.get("Idempotency-Key");

            // Require a UUID v4 and reuse it for retries of the
            // same logical request.
            if (
                typeof idempotencyKey !== "string" ||
                !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                    idempotencyKey
                )
            ) {
                return res.status(400).json({
                    message:
                        "Provide a valid UUID v4 in the Idempotency-Key header and reuse it for this download."
                });
            }

            // Repeated requests reuse the existing record.
            const existing = await Download.findOne({
                userId,
                idempotencyKey
            });

            if (existing) {
                if (existing.videoId.toString() !== videoId) {
                    return res.status(409).json({
                        message:
                            "This request key is already assigned to another video."
                    });
                }

                return res.json({
                    reused: true,
                    download: {
                        id: existing._id,
                        status: existing.status,
                        fileUrl: `/api/downloads/${existing._id}/file`,
                        quotaReserved: existing.quotaReserved,
                        quotaConsumed: existing.quotaConsumed
                    }
                });
            }

            const video = await Video.findOne({
                _id: videoId,
                isActive: true,
                isDownloadable: true
            });

            if (!video) {
                return res.status(404).json({
                    message: "Video not found or downloading is disabled."
                });
            }

            if (
                video.visibility === "private" &&
                String(video.ownerId) !== String(userId)
            ) {
                return res.status(403).json({
                    message: "You cannot download this private video."
                });
            }

            const filePath = resolveVideoFile(video.filePath);

            if (!filePath || !fs.existsSync(filePath)) {
                return res.status(404).json({
                    message: "Video file is unavailable."
                });
            }

            const fileStat = fs.statSync(filePath);

            if (!fileStat.isFile()) {
                return res.status(404).json({
                    message: "Video file is unavailable."
                });
            }

            const { plan } = await getCurrentPlan(userId);

            if (!PLAN_LIMITS[plan]) {
                return res.status(500).json({
                    message: "Download limits are not configured for this plan."
                });
            }

            const { dayKey, monthKey } = getISTKeys();

            // Reserve quota atomically before accepting the request.
            const reservation = await reserveQuota({
                userId,
                plan,
                idempotencyKey
            });

            if (!reservation.allowed) {
                // A concurrent request may have reserved quota
                // just before its Download record was created.
                const racedDownload = await Download.findOne({
                    userId,
                    idempotencyKey
                });

                if (racedDownload) {
                    if (racedDownload.videoId.toString() !== videoId) {
                        return res.status(409).json({
                            message: "Request key conflict."
                        });
                    }

                    return res.json({
                        reused: true,
                        download: {
                            id: racedDownload._id,
                            status: racedDownload.status,
                            fileUrl: `/api/downloads/${racedDownload._id}/file`,
                            quotaReserved: racedDownload.quotaReserved,
                            quotaConsumed: racedDownload.quotaConsumed
                        }
                    });
                }

                const status = {
                    DAILY_QUOTA_EXCEEDED: 429,
                    MONTHLY_QUOTA_EXCEEDED: 429,
                    DUPLICATE_REQUEST: 409,
                    INVALID_PLAN: 400,
                    INVALID_IDEMPOTENCY_KEY: 400
                }[reservation.reason] || 409;

                return res.status(status).json({
                    message: "Download quota reservation was not accepted.",
                    reason: reservation.reason
                });
            }

            let download;

            try {
                download = await Download.create({
                    userId,
                    videoId: video._id,
                    plan,
                    status: "pending",
                    fileSize: fileStat.size,
                    ipAddress: req.ip,
                    userAgent: String(req.get("user-agent") || "").slice(0, 1000),
                    deviceInfo: String(req.get("x-device-info") || "").slice(0, 500),
                    quotaReserved: true,
                    quotaConsumed: false,
                    idempotencyKey,
                    quotaDay: dayKey,
                    quotaMonth: monthKey
                });
            } catch (createError) {
                if (createError.code === 11000) {
                    const duplicate = await Download.findOne({
                        userId,
                        idempotencyKey
                    });

                    if (duplicate) {
                        return res.json({
                            reused: true,
                            download: {
                                id: duplicate._id,
                                status: duplicate.status,
                                fileUrl: `/api/downloads/${duplicate._id}/file`,
                                quotaReserved: duplicate.quotaReserved,
                                quotaConsumed: duplicate.quotaConsumed
                            }
                        });
                    }
                }

                throw createError;
            }

            return res.status(201).json({
                reused: false,
                download: {
                    id: download._id,
                    status: download.status,
                    fileUrl: `/api/downloads/${download._id}/file`,
                    quotaReserved: true,
                    quotaConsumed: false
                },
                plan,
                dailyRemaining: reservation.dailyRemaining,
                monthlyRemaining: reservation.monthlyRemaining
            });
        } catch (error) {
            console.error("Create download error:", error);
            return res.status(500).json({
                message: "Could not create download request."
            });
        }
    });

    // GET /api/downloads/:downloadId/file
    // Re-check ownership, video access and subscription before streaming.
    router.get("/:downloadId/file", authenticateToken, async (req, res) => {
        let download;
        let stream;
        let transferEnded = false;
        let finalized = false;

        async function updateStatus(status, completedAt = null) {
            if (!download || finalized) return;
            finalized = true;

            try {
                await Download.updateOne(
                    {
                        _id: download._id,
                        userId: req.user.id,
                        status: "in_progress"
                    },
                    {
                        $set: {
                            status,
                            completedAt,
                            ...(status === "completed"
                                ? { quotaConsumed: true }
                                : {})
                        }
                    }
                );
            } catch (error) {
                console.error("Download status update error:", error);
            }
        }

        try {
            if (!mongoose.isValidObjectId(req.params.downloadId)) {
                return res.status(400).json({
                    message: "Invalid download ID."
                });
            }

            download = await Download.findOne({
                _id: req.params.downloadId,
                userId: req.user.id
            });

            if (!download) {
                return res.status(404).json({
                    message: "Download request not found."
                });
            }

            if (download.status === "completed") {
                return res.status(409).json({
                    message:
                        "This download is already completed. Create a new request if another download is intended."
                });
            }

            if (
                !["pending", "interrupted", "failed"].includes(
                    download.status
                )
            ) {
                return res.status(409).json({
                    message:
                        "This download is already being processed or cannot be retried.",
                    status: download.status
                });
            }

            const video = await Video.findOne({
                _id: download.videoId,
                isActive: true,
                isDownloadable: true
            });

            if (!video) {
                return res.status(404).json({
                    message: "Video is no longer available for downloading."
                });
            }

            if (
                video.visibility === "private" &&
                String(video.ownerId) !== String(req.user.id)
            ) {
                return res.status(403).json({
                    message: "You no longer have access to this private video."
                });
            }

            // Revalidate the current plan immediately before streaming.
            const { plan: currentPlan } = await getCurrentPlan(req.user.id);

            if (
                download.plan !== "Free" &&
                currentPlan !== download.plan
            ) {
                return res.status(403).json({
                    message:
                        "Your original subscription is no longer active. Renew or restore the required plan before retrying this download."
                });
            }

            const filePath = resolveVideoFile(video.filePath);

            if (!filePath || !fs.existsSync(filePath)) {
                return res.status(404).json({
                    message: "Video file is unavailable."
                });
            }

            const stat = fs.statSync(filePath);

            if (!stat.isFile()) {
                return res.status(404).json({
                    message: "Video file is unavailable."
                });
            }

            const range = parseSingleRange(req.headers.range, stat.size);

            if (range?.invalid) {
                return res
                    .status(416)
                    .set("Content-Range", `bytes */${stat.size}`)
                    .end();
            }

            // Atomically claim this download request.
            const claimed = await Download.findOneAndUpdate(
                {
                    _id: download._id,
                    userId: req.user.id,
                    status: {
                        $in: ["pending", "interrupted", "failed"]
                    }
                },
                {
                    $set: {
                        status: "in_progress",
                        fileSize: stat.size
                    }
                },
                { new: true }
            );

            if (!claimed) {
                return res.status(409).json({
                    message: "Another transfer is already using this request."
                });
            }

            download = claimed;

            const start = range ? range.start : 0;
            const end = range ? range.end : stat.size - 1;
            const length = stat.size === 0 ? 0 : end - start + 1;

            res.set({
                "Accept-Ranges": "bytes",
                "Content-Type": "application/octet-stream",
                "Content-Disposition":
                    `attachment; filename="${safeFilename(video.title, filePath).replace(/"/g, "_")}"`,
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff"
            });

            if (range) {
                res.status(206);
                res.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
            } else {
                res.status(200);
            }

            res.set("Content-Length", String(length));

            stream = fs.createReadStream(
                filePath,
                range ? { start, end } : undefined
            );

            stream.on("end", () => {
                transferEnded = true;
            });

            stream.on("error", async (error) => {
                console.error("Download stream error:", error);

                if (!res.headersSent) {
                    res.status(500).end("Download failed.");
                } else if (!res.destroyed) {
                    res.destroy(error);
                }

                await updateStatus("failed");
            });

            res.on("finish", async () => {
                if (transferEnded) {
                    await updateStatus("completed", new Date());
                }
            });

            res.on("close", async () => {
                if (!res.writableFinished) {
                    if (stream && !stream.destroyed) {
                        stream.destroy();
                    }

                    await updateStatus("interrupted");
                }
            });

            stream.pipe(res);
        } catch (error) {
            console.error("Stream download error:", error);

            if (stream && !stream.destroyed) {
                stream.destroy();
            }

            if (download && download.status === "in_progress") {
                await updateStatus("failed");
            }

            if (!res.headersSent) {
                res.status(500).json({
                    message: "Could not stream the video."
                });
            } else if (!res.destroyed) {
                res.destroy();
            }
        }
    });

    // POST /api/downloads/:downloadId/cancel
    // Reserved quota is not refunded under the existing policy.
    router.post("/:downloadId/cancel", authenticateToken, async (req, res) => {
        try {
            if (!mongoose.isValidObjectId(req.params.downloadId)) {
                return res.status(400).json({
                    message: "Invalid download ID."
                });
            }

            const download = await Download.findOneAndUpdate(
                {
                    _id: req.params.downloadId,
                    userId: req.user.id,
                    status: {
                        $in: ["pending", "interrupted", "failed"]
                    }
                },
                {
                    $set: { status: "cancelled" }
                },
                { new: true }
            );

            if (!download) {
                return res.status(409).json({
                    message:
                        "Download not found, already in progress, or cannot be cancelled."
                });
            }

            return res.json({
                message: "Download request cancelled.",
                status: download.status,
                quotaRefunded: false
            });
        } catch (error) {
            console.error("Cancel download error:", error);
            return res.status(500).json({
                message: "Could not cancel the download."
            });
        }
    });

    return router;
}

module.exports = { createDownloadsRouter };


