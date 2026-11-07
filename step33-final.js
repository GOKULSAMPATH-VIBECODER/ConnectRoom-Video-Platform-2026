const fs = require("fs");

const routeFile = "server/routes/comments.js";
let s = fs.readFileSync(routeFile, "utf8");

if (!s.includes('require("../../models/CommentModeration")')) {
    s = s.replace(
        'const CommentReport = require("../../models/CommentReport");',
        'const CommentReport = require("../../models/CommentReport");\nconst CommentModeration = require("../../models/CommentModeration");'
    );
}

if (!s.includes("async function isCommentAdmin")) {
    const helper = `
async function isCommentAdmin(req) {
    const configuredEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    if (!configuredEmail) return false;

    const user = await User.findById(req.user.id).select("email").lean();
    return Boolean(
        user &&
        user.email &&
        user.email.toLowerCase() === configuredEmail
    );
}

`;
    s = s.replace("function createCommentsRouter", helper + "function createCommentsRouter");
}

if (!s.includes('"/admin/comments/moderation"')) {
    const routes = `
    // Administrator moderation queue.
    router.get("/admin/comments/moderation", authenticateToken, async (req, res) => {
        try {
            if (!(await isCommentAdmin(req))) {
                return res.status(403).json({ message: "Administrator access required." });
            }

            const [moderation, reports] = await Promise.all([
                CommentModeration.find({ status: "pending" })
                    .sort({ createdAt: -1 })
                    .limit(100)
                    .populate("commentId")
                    .populate("userId", "name email")
                    .lean(),

                CommentReport.find({ status: "pending" })
                    .sort({ createdAt: -1 })
                    .limit(100)
                    .populate("commentId")
                    .populate("userId", "name email")
                    .lean()
            ]);

            return res.json({ moderation, reports });
        } catch (error) {
            console.error("Moderation queue error:", error);
            return res.status(500).json({ message: "Could not load moderation queue." });
        }
    });

    router.patch("/admin/comments/moderation/:id", authenticateToken, async (req, res) => {
        try {
            if (!(await isCommentAdmin(req))) {
                return res.status(403).json({ message: "Administrator access required." });
            }

            const { action } = req.body;
            if (!["approve", "remove"].includes(action) || !validId(req.params.id)) {
                return res.status(400).json({ message: "Invalid moderation action or ID." });
            }

            const record = await CommentModeration.findById(req.params.id);
            if (!record) {
                return res.status(404).json({ message: "Moderation record not found." });
            }

            if (action === "remove") {
                await Comment.updateOne(
                    { _id: record.commentId, deletedAt: null },
                    { $set: { deletedAt: new Date() } }
                );
            }

            record.status = action === "approve" ? "approved" : "removed";
            record.reviewedBy = req.user.id;
            record.reviewedAt = new Date();
            await record.save();

            return res.json({ message: "Moderation decision saved.", status: record.status });
        } catch (error) {
            console.error("Moderation decision error:", error);
            return res.status(500).json({ message: "Could not save moderation decision." });
        }
    });

    router.patch("/admin/comments/reports/:id", authenticateToken, async (req, res) => {
        try {
            if (!(await isCommentAdmin(req))) {
                return res.status(403).json({ message: "Administrator access required." });
            }

            const { status } = req.body;
            if (!["reviewed", "dismissed", "action_taken"].includes(status) ||
                !validId(req.params.id)) {
                return res.status(400).json({ message: "Invalid report decision or ID." });
            }

            const report = await CommentReport.findByIdAndUpdate(
                req.params.id,
                { $set: { status } },
                { new: true, runValidators: true }
            );

            if (!report) {
                return res.status(404).json({ message: "Report not found." });
            }

            if (status === "action_taken") {
                await Comment.updateOne(
                    { _id: report.commentId, deletedAt: null },
                    { $set: { deletedAt: new Date() } }
                );
            }

            return res.json({ message: "Report decision saved.", report });
        } catch (error) {
            console.error("Report moderation error:", error);
            return res.status(500).json({ message: "Could not update report." });
        }
    });

`;
    s = s.replace("    return router;", routes + "    return router;");
}

fs.writeFileSync(routeFile, s, "utf8");

const reportFile = "models/CommentReport.js";
let r = fs.readFileSync(reportFile, "utf8");

if (!r.includes('"offensive_content"')) {
    r = r.replace(
        '"sexual_content",',
        '"sexual_content",\n                "offensive_content",'
    );
}
fs.writeFileSync(reportFile, r, "utf8");

const commentsFile = "server/routes/comments.js";
let c = fs.readFileSync(commentsFile, "utf8");
if (!c.includes('"offensive_content"')) {
    c = c.replace(
        '"sexual_content",',
        '"sexual_content",\n                    "offensive_content",'
    );
}
fs.writeFileSync(commentsFile, c, "utf8");

console.log("Administrator moderation queue and offensive-content report reason added.");
