const fs = require("fs");

const modelFile = "models/Comment.js";
let model = fs.readFileSync(modelFile, "utf8");

model = model.replace(
    /\nconst\s*\{\s*inspectComment,\s*saveModerationFlags\s*\}\s*=\s*require\("\.\.\/utils\/commentProtection"\);\s*\n/,
    "\n"
);

model = model.replace(
    /\nconst Notification = require\("\.\.\/\.\.\/models\/Notification"\);\s*\n/,
    "\n"
);

fs.writeFileSync(modelFile, model);

const routeFile = "server/routes/comments.js";
let route = fs.readFileSync(routeFile, "utf8");

if (!route.includes('require("../utils/commentProtection")')) {
    route = route.replace(
        'const CommentReport = require("../../models/CommentReport");',
        'const CommentReport = require("../../models/CommentReport");\nconst Notification = require("../../models/Notification");\nconst { inspectComment, saveModerationFlags } = require("../utils/commentProtection");'
    );
}

fs.writeFileSync(routeFile, route);

console.log("Corrected imports in Comment.js and comments.js");
