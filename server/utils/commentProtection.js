const Comment = require("../../models/Comment");
const CommentModeration = require("../../models/CommentModeration");

const RATE_WINDOW_MS = 60 * 1000;
const MAX_USER_COMMENTS = 5;
const MAX_IP_COMMENTS = 10;
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

const activity = new Map();

const suspiciousWords = ["fuck", "shit", "bitch", "asshole"];

function getActivity(key) {
    const now = Date.now();
    let record = activity.get(key);

    if (!record || now - record.startedAt > RATE_WINDOW_MS) {
        record = { startedAt: now, count: 0, suspicious: 0 };
    }

    return record;
}

function checkRateLimit(userId, ip) {
    const userKey = `user:${userId}`;
    const ipKey = `ip:${ip}`;

    const userRecord = getActivity(userKey);
    const ipRecord = getActivity(ipKey);

    if (
        userRecord.count >= MAX_USER_COMMENTS ||
        ipRecord.count >= MAX_IP_COMMENTS
    ) {
        return {
            allowed: false,
            message: "You are commenting too quickly. Please wait one minute."
        };
    }

    userRecord.count++;
    ipRecord.count++;

    activity.set(userKey, userRecord);
    activity.set(ipKey, ipRecord);

    return { allowed: true };
}

function inspectText(text) {
    const flags = [];
    const normalized = text.toLowerCase();

    if (suspiciousWords.some(word =>
        new RegExp(`\\b${word}\\b`, "i").test(normalized)
    )) {
        flags.push("profanity");
    }

    const urls = text.match(/https?:\/\/[^\s]+/gi) || [];

    if (
        urls.length > 2 ||
        urls.some(url =>
            /(bit\.ly|tinyurl\.com|grabify|iplogger|\.exe(?:$|\?))/i.test(url)
        )
    ) {
        flags.push("suspicious_url");
    }

    if (/(.)\1{9,}/u.test(text)) {
        flags.push("excessive_characters");
    }

    const emojis = text.match(/\p{Extended_Pictographic}/gu) || [];

    if (emojis.length > 20) {
        flags.push("excessive_characters");
    }

    const special = text.match(/[!@#$%^&*()_+=\[\]{};:"'<>?,./\\|~-]/g) || [];

    if (special.length > text.length * 0.4) {
        flags.push("excessive_characters");
    }

    return [...new Set(flags)];
}

async function verifyTurnstile(token, ip) {
    const secret = process.env.TURNSTILE_SECRET_KEY;

    if (!secret) {
        throw new Error("TURNSTILE_SECRET_KEY is not configured.");
    }

    if (!token || typeof token !== "string") {
        return false;
    }

    const body = new URLSearchParams({
        secret,
        response: token,
        remoteip: ip || ""
    });

    const response = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body
        }
    );

    if (!response.ok) {
        throw new Error("CAPTCHA verification service is unavailable.");
    }

    const result = await response.json();
    return result.success === true;
}

async function checkDuplicate(text, userId, videoId, parentCommentId) {
    return Comment.findOne({
        userId,
        videoId,
        parentCommentId,
        text: text.trim(),
        createdAt: {
            $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS)
        },
        deletedAt: null
    }).lean();
}

async function inspectComment({
    text,
    userId,
    videoId,
    ip,
    parentCommentId = null,
    captchaToken
}) {
    const rate = checkRateLimit(userId, ip || "unknown");

    if (!rate.allowed) {
        return { ...rate, flags: [], captchaRequired: false };
    }

    const flags = inspectText(text);

    const duplicate = await checkDuplicate(
        text,
        userId,
        videoId,
        parentCommentId
    );

    if (duplicate) {
        flags.push("duplicate");
    }

    const suspiciousKey = `suspicious:${userId}`;
    const suspiciousRecord = getActivity(suspiciousKey);

    if (flags.length > 0) {
        suspiciousRecord.suspicious++;
        activity.set(suspiciousKey, suspiciousRecord);
    }

    if (duplicate) {
        return {
            allowed: false,
            message: "You have already posted this comment recently.",
            flags,
            captchaRequired: false
        };
    }

    if (suspiciousRecord.suspicious >= 3) {
        if (!captchaToken) {
            return {
                allowed: false,
                captchaRequired: true,
                flags,
                message: "Please complete the CAPTCHA before commenting."
            };
        }

        const verified = await verifyTurnstile(captchaToken, ip);

        if (!verified) {
            return {
                allowed: false,
                captchaRequired: true,
                flags,
                message: "CAPTCHA verification failed. Please try again."
            };
        }

        suspiciousRecord.suspicious = 0;
        activity.set(suspiciousKey, suspiciousRecord);
    }

    return {
        allowed: true,
        flags,
        captchaRequired: false
    };
}

async function saveModerationFlags(comment) {
    if (!comment || !comment._id) return;

    const flags = inspectText(comment.text);

    for (const reason of flags) {
        await CommentModeration.updateOne(
            {
                commentId: comment._id,
                reason,
                status: "pending"
            },
            {
                $setOnInsert: {
                    commentId: comment._id,
                    videoId: comment.videoId,
                    userId: comment.userId,
                    reason,
                    details: "Automatically flagged by comment protection."
                }
            },
            { upsert: true }
        );
    }
}

module.exports = {
    inspectComment,
    saveModerationFlags
};

