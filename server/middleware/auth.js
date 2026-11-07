const jwt = require("jsonwebtoken");
app.use("/api", createCommentsRouter({ authenticateToken }));
const JWT_SECRET = process.env.JWT_SECRET;

function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!JWT_SECRET) {
        return res.status(500).json({
            message: "Server authentication is not configured."
        });
    }

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            message: "Please log in first."
        });
    }

    const token = authHeader.slice(7);

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        if (!decoded.userId) {
            return res.status(401).json({
                message: "Invalid authentication token."
            });
        }

        req.user = {
            userId: decoded.userId
        };

        next();
    } catch (error) {
        return res.status(401).json({
            message: "Your login has expired or the token is invalid."
        });
    }
}

module.exports = { requireAuth };