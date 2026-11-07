const fs = require("fs");
const file = "server/routes/comments.js";
let s = fs.readFileSync(file, "utf8");

if (!s.includes('require("../utils/commentProtection")')) {
    s = s.replace(
        'const CommentReport = require("../../models/CommentReport");',
        `const CommentReport = require("../../models/CommentReport");
const Notification = require("../../models/Notification");
const { inspectComment, saveModerationFlags } = require("../utils/commentProtection");`
    );
}

const marker = "const resolvedMentions = await resolveMentions(text);";
const first = s.indexOf(marker);
const second = s.indexOf(marker, first + marker.length);

if (first < 0 || second < 0) {
    console.error("Could not find both comment and reply insertion points. No changes saved.");
    process.exit(1);
}

const commentCheck = `const protection = await inspectComment({
                    text: text.trim(),
                    userId: req.user.id,
                    videoId,
                    ip: req.ip,
                    parentCommentId: null
                });

                if (!protection.allowed) {
                    return res.status(429).json({ message: protection.message });
                }

                `;

const replyCheck = `const protection = await inspectComment({
                    text: text.trim(),
                    userId: req.user.id,
                    videoId: parent.videoId,
                    ip: req.ip,
                    parentCommentId: parent._id
                });

                if (!protection.allowed) {
                    return res.status(429).json({ message: protection.message });
                }

                `;

s = s.slice(0, first) + commentCheck + s.slice(first);
const newSecond = s.indexOf(marker, first + commentCheck.length + marker.length);
s = s.slice(0, newSecond) + replyCheck + s.slice(newSecond);

const commentCreate = `mentions: resolvedMentions.ids
                });`;
const replyCreate = `mentions: resolvedMentions.ids
                });`;

const c = s.indexOf(commentCreate);
const r = s.indexOf(replyCreate, c + commentCreate.length);

if (c < 0 || r < 0) {
    console.error("Could not find comment creation blocks. Review the file before proceeding.");
    process.exit(1);
}

s = s.slice(0, c + commentCreate.length) +
    "\n\n                await saveModerationFlags(comment);" +
    s.slice(c + commentCreate.length);

const newR = s.indexOf(replyCreate, c + commentCreate.length);
s = s.slice(0, newR + replyCreate.length) +
    "\n\n                await saveModerationFlags(reply);" +
    s.slice(newR + replyCreate.length);

fs.writeFileSync(file, s, "utf8");
console.log("Comment and reply protection connected.");
