
require("dotenv").config();

const crypto = require("crypto");
const createCommentsRouter = require("./routes/comments");
const LoginLog = require("./models/LoginLog");
const UserSession = require("../models/UserSession");
const { UAParser } = require("ua-parser-js");
const express = require("express");
const http = require("http");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const { Server } = require("socket.io");

const TrustedDevice = require("../models/TrustedDevice");
const LoginOtp = require("../models/LoginOtp");

const {
    sendDeviceOtp
} = require("./services/deviceOtpEmail");

const { createDownloadsRouter } = require("./routes/downloads");
const { createPaymentsRouter } = require("./routes/payments");

const {
    expireExpiredSubscriptions
} = require("./services/subscriptionExpiry");

const {
    startEmailQueue
} = require("./services/emailQueue");

// -------------------- CONFIGURATION --------------------

const PORT = process.env.PORT || 5000;

const MONGO_URI =
    process.env.MONGO_URI ||
    "mongodb://127.0.0.1:27017/videoSharingPlatform";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error(
        "ERROR: Set JWT_SECRET to at least 32 characters in your .env file."
    );
    process.exit(1);
}

// -------------------- USER MODEL --------------------

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    themePreference: {
        type: String,
        enum: ["light", "dark"],
        default: "dark"
    },
    themeMode: {
        type: String,
        enum: ["automatic", "manual"],
        default: "automatic"
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const User =
    mongoose.models.User ||
    mongoose.model("User", UserSchema);

// -------------------- AUTOMATIC THEME HELPERS --------------------

// 05:00 AM to 12:00 PM = Light theme.
// 12:00 PM to 05:00 AM = Dark theme.
// Time is calculated using Indian Standard Time.

function getAutomaticThemePreference(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        hourCycle: "h23"
    }).formatToParts(date);

    const hourPart = parts.find(
        (part) => part.type === "hour"
    );

    const hour = Number(hourPart?.value);

    return hour >= 5 && hour < 12 ? "light" : "dark";
}

// -------------------- EXPRESS SERVER --------------------

const app = express();
const server = http.createServer(app);

app.use(cors({
    origin: [
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    credentials: true
}));

// Razorpay webhook must receive the raw request body.
// Keep this BEFORE express.json().
const webhookRouter = require("./routes/webhook");

app.use(
    "/api/payments/webhook",
    webhookRouter
);

// Parse JSON and URL-encoded request bodies.
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
// Serve frontend public files
app.use(express.static(path.join(__dirname, "public")));

// -------------------- COMMENTS API --------------------

app.use(
    "/api",
    createCommentsRouter({ authenticateToken })
);

// -------------------- NOTIFICATIONS API --------------------

app.use(
    "/api/notifications",
    require("./routes/notifications")({ authenticateToken })
);


// -------------------- SOCKET.IO --------------------

const io = new Server(server, {
    cors: {
        origin: [
            "http://localhost:5173",
            "http://127.0.0.1:5173"
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// -------------------- MEETING ROOMS --------------------

const rooms = new Map();

// -------------------- JWT HELPERS --------------------

// -------------------- JWT AND SESSION HELPERS --------------------

async function createUserSession(req, user, deviceFingerprint = null) {
    const sessionId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(
        now.getTime() + 7 * 24 * 60 * 60 * 1000
    );

    const parsed = new UAParser(
        req.get("user-agent") || ""
    ).getResult();

    const browser = parsed.browser || {};
    const os = parsed.os || {};
    const device = parsed.device || {};

    await UserSession.create({
        userId: user._id,
        sessionId,
        deviceFingerprint,
        browser: [
            browser.name || "Unknown",
            browser.version || ""
        ].join(" ").trim(),
        operatingSystem: [
            os.name || "Unknown",
            os.version || ""
        ].join(" ").trim(),
        device: device.model ||
            device.type ||
            "desktop",
        ipAddress:
            req.ip ||
            req.socket?.remoteAddress ||
            null,
        createdAt: now,
        lastActivityAt: now,
        expiresAt
    });

    return sessionId;
}

function createToken(user, sessionId) {
    return jwt.sign(
        {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            sid: sessionId
        },
        JWT_SECRET,
        { expiresIn: "7d" }
    );
}

async function authenticateToken(req, res, next) {
    const header = req.headers.authorization || "";

    const token = header.startsWith("Bearer ")
        ? header.slice(7)
        : null;

    if (!token) {
        return res.status(401).json({
            message: "Please log in first."
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        if (!decoded.id || !decoded.sid) {
            return res.status(401).json({
                message: "Invalid login token."
            });
        }

        const session = await UserSession.findOne({
            userId: decoded.id,
            sessionId: decoded.sid,
            revokedAt: null,
            expiresAt: { $gt: new Date() }
        });

        if (!session) {
            return res.status(401).json({
                message: "Your session has been revoked or expired. Please log in again."
            });
        }

        session.lastActivityAt = new Date();
        await session.save();

        req.user = decoded;
        req.user.sessionId = session.sessionId;

        next();

    } catch (error) {
        console.error("Authentication error:", error.message);

        return res.status(401).json({
            message: "Your login session is invalid or expired."
        });
    }
}


// -------------------- BASIC ROUTES --------------------

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "login.html")
    );
});

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "ConnectRoom server is running",
        database:
            mongoose.connection.readyState === 1
                ? "connected"
                : "disconnected"
    });
});

// -------------------- REGISTER --------------------

app.post("/api/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string" ||
            !name.trim() ||
            !email.trim() ||
            password.length < 6
        ) {
            return res.status(400).json({
                message:
                    "Enter your name, email, and a password of at least 6 characters."
            });
        }

        const normalizedEmail =
            email.trim().toLowerCase();

        const existingUser = await User.findOne({
            email: normalizedEmail
        });

        if (existingUser) {
            return res.status(409).json({
                message: "This email is already registered."
            });
        }

        const user = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            password: await bcrypt.hash(password, 12),
            themePreference: getAutomaticThemePreference(),
            themeMode: "automatic"
        });
        return res.status(201).json({
          message: "Registration successful. Please log in.",
          user: {
          id: user._id,
          name: user.name,
          email: user.email,
          themePreference: user.themePreference,
          themeMode: user.themeMode
     }
});
    } catch (error) {
        console.error("Registration error:", error);

        if (error.code === 11000) {
            return res.status(409).json({
                message: "This email is already registered."
            });
        }

        return res.status(500).json({
            message:
                "Registration failed. Check the server terminal."
        });
    }
});

// -------------------- LOGIN ACTIVITY LOGGING --------------------

async function recordLoginAttempt({
    req,
    userId = null,
    status,
    otpVerification = "not_required"
}) {
    try {
        const userAgent = req.get("user-agent") || "";
        const parsed = new UAParser(userAgent).getResult();

        const browser = parsed.browser || {};
        const os = parsed.os || {};
        const device = parsed.device || {};

        const ipAddress =
            req.ip ||
            req.socket?.remoteAddress ||
            null;

        await LoginLog.create({
            userId: userId || null,
            timestamp: new Date(),
            ipAddress,

            browser: {
                name: browser.name || "Unknown",
                version: browser.version || "Unknown"
            },

            operatingSystem: {
                name: os.name || "Unknown",
                version: os.version || "Unknown"
            },

            device: {
                type: device.type || "desktop",
                model: device.model || null
            },

            location: {
                city: null,
                state: null,
                country: null
            },

            status,
            otpVerification
        });

    } catch (error) {
        console.error(
            "Login activity logging error:",
            error.message
        );
    }
}

// -------------------- DEVICE OTP HELPERS --------------------

function hashDeviceFingerprint(fingerprint) {
    return crypto
        .createHash("sha256")
        .update(fingerprint)
        .digest("hex");
}

function hashLoginOtp(challengeId, otp) {
    return crypto
        .createHmac("sha256", JWT_SECRET)
        .update(`${challengeId}:${otp}`)
        .digest("hex");
}

function getLoginDeviceInfo(req) {
    const parsed = new UAParser(
        req.get("user-agent") || ""
    ).getResult();

    return {
        browser: parsed.browser?.name || "Unknown",
        ip:
            req.ip ||
            req.socket?.remoteAddress ||
            null
    };
}

function maskEmail(email) {
    const [name, domain] = email.split("@");

    if (!domain) {
        return "***";
    }

    return `${name.slice(0, 2)}***@${domain}`;
}

// Refresh automatic theme without overwriting manual selection.

async function refreshAutomaticTheme(user) {
    if (user.themeMode !== "manual") {
        user.themeMode = "automatic";

        user.themePreference =
            getAutomaticThemePreference();

        await user.save();
    }
}

// -------------------- SEND LOGIN OTP --------------------

async function sendLoginOtp(challenge, user) {
    const now = new Date();

    const fifteenMinutes = 15 * 60 * 1000;

    // Reset sending window after 15 minutes.

    if (
        now - challenge.windowStartedAt >
        fifteenMinutes
    ) {
        challenge.windowStartedAt = now;
        challenge.sendCount = 0;
    }

    // Maximum 3 OTP emails in 15 minutes.

    if (challenge.sendCount >= 3) {
        throw new Error("OTP_LIMIT_REACHED");
    }

    // Wait at least 60 seconds before resending.

    if (
        challenge.sendCount > 0 &&
        now - challenge.lastSentAt < 60 * 1000
    ) {
        throw new Error("OTP_COOLDOWN");
    }

    // Generate a secure six-digit OTP.

    const otp = crypto
        .randomInt(0, 1000000)
        .toString()
        .padStart(6, "0");

    // Store only a keyed hash of the OTP.

    challenge.otpHash = hashLoginOtp(
        challenge._id.toString(),
        otp
    );

    // OTP expires after 5 minutes.

    challenge.otpExpiresAt =
        new Date(now.getTime() + 5 * 60 * 1000);

    // Challenge expires after 1 hour.

    challenge.expiresAt =
        new Date(now.getTime() + 60 * 60 * 1000);

    challenge.attempts = 0;
    challenge.sendCount += 1;
    challenge.lastSentAt = now;

    await challenge.save();

    // Email the OTP to the account owner.

    await sendDeviceOtp(user.email, otp);
}

// -------------------- LOGIN --------------------

app.post("/api/login", async (req, res) => {
    try {
        const {
            email,
            password,
            deviceFingerprint
        } = req.body || {};

        if (
            typeof email !== "string" ||
            typeof password !== "string" ||
            typeof deviceFingerprint !== "string" ||
            !email.trim() ||
            !password ||
            deviceFingerprint.length < 20 ||
            deviceFingerprint.length > 200
        ) {
            return res.status(400).json({
                message:
                    "Enter your email, password, and a valid device identifier."
            });
        }

        const user = await User.findOne({
            email: email.trim().toLowerCase()
        });

        if (
            !user ||
            !(await bcrypt.compare(password, user.password))
        ) {
            await recordLoginAttempt({
                req,
                status: "failure",
                otpVerification: "not_required"
            });

            return res.status(401).json({
                message: "Incorrect email or password."
            });
        }

        const fingerprintHash =
            hashDeviceFingerprint(deviceFingerprint);

        const deviceInfo = getLoginDeviceInfo(req);

        // Check whether this browser is trusted.

        const trustedDevice = await TrustedDevice.findOne({
            userId: user._id,
            deviceFingerprint: fingerprintHash,
            trustedUntil: { $gt: new Date() }
        });

        // -------------------- TRUSTED DEVICE LOGIN --------------------

        if (trustedDevice) {
            trustedDevice.lastSeenAt = new Date();
            trustedDevice.lastKnownIP = deviceInfo.ip;
            trustedDevice.browser = deviceInfo.browser;

            await trustedDevice.save();

            await refreshAutomaticTheme(user);

            await recordLoginAttempt({
                req,
                userId: user._id,
                status: "success",
                otpVerification: "not_required"
            });
            const sessionId = await createUserSession(
               req,
               user,
               fingerprintHash
            );
            return res.json({
                message: "Login successful.",
                token: createToken(user, sessionId),
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    themePreference:
                        user.themePreference || "dark",
                    themeMode:
                        user.themeMode || "automatic"
                }
            });
        }

        // -------------------- NEW DEVICE LOGIN --------------------

        let challenge = await LoginOtp.findOne({
            userId: user._id,
            deviceFingerprint: fingerprintHash
        });

        if (!challenge) {
            challenge = new LoginOtp({
                userId: user._id,
                deviceFingerprint: fingerprintHash,
                otpHash: "pending",
                otpExpiresAt: new Date(0),
                attempts: 0,
                sendCount: 0,
                windowStartedAt: new Date(),
                lastSentAt: new Date(0),
                expiresAt:
                    new Date(Date.now() + 60 * 60 * 1000)
            });
        }

        try {
            await sendLoginOtp(challenge, user);

        
        } catch (error) {
            if (error.message === "OTP_LIMIT_REACHED") {
                return res.status(429).json({
                    message:
                        "You have reached the OTP sending limit. Try again after 15 minutes."
                });
            }

            if (error.message === "OTP_COOLDOWN") {
                return res.status(202).json({
                    otpRequired: true,
                    challengeId: challenge._id.toString(),
                    emailMasked: maskEmail(user.email),
                    message:
                        "A verification code was already sent. Please check your email."
                });
            }

            throw error;
        }

        await recordLoginAttempt({
            req,
            userId: user._id,
            status: "success",
            otpVerification: "pending"
        });

        // Do not issue a JWT before OTP verification.

        return res.status(202).json({
            otpRequired: true,
            challengeId: challenge._id.toString(),
            emailMasked: maskEmail(user.email),
            message:
                "A verification code has been sent to your email."
        });

    } catch (error) {
        console.error("LOGIN ERROR DETAILS:", error);

return res.status(500).json({
    message: error.message || "Unknown login error"
});
    }
});

// -------------------- VERIFY NEW DEVICE OTP --------------------

app.post("/api/login/verify-device", async (req, res) => {
    try {
        const {
            challengeId,
            otp,
            deviceFingerprint
        } = req.body || {};

        if (
            !mongoose.isValidObjectId(challengeId) ||
            typeof otp !== "string" ||
            !/^\d{6}$/.test(otp) ||
            typeof deviceFingerprint !== "string" ||
            deviceFingerprint.length < 20 ||
            deviceFingerprint.length > 200
        ) {
            return res.status(400).json({
                message: "Invalid verification details."
            });
        }

        const fingerprintHash =
            hashDeviceFingerprint(deviceFingerprint);

        const now = new Date();

        // Atomically increase the verification attempt count.

        const challenge = await LoginOtp.findOneAndUpdate(
            {
                _id: challengeId,
                deviceFingerprint: fingerprintHash,
                otpExpiresAt: { $gt: now },
                expiresAt: { $gt: now },
                attempts: { $lt: 5 }
            },
            {
                $inc: { attempts: 1 }
            },
            {
                new: true
            }
        );

        if (!challenge) {
            return res.status(400).json({
                message:
                    "The verification code has expired or the attempt limit was reached. Please log in again."
            });
        }

        const expectedHash = Buffer.from(
            challenge.otpHash,
            "hex"
        );

        const submittedHash = Buffer.from(
            hashLoginOtp(challengeId, otp),
            "hex"
        );

        const validOtp =
            expectedHash.length === submittedHash.length &&
            crypto.timingSafeEqual(
                expectedHash,
                submittedHash
            );

        // -------------------- INVALID OTP --------------------

        if (!validOtp) {
            if (challenge.attempts >= 5) {
                await LoginOtp.deleteOne({
                    _id: challenge._id
                });
            }

            await recordLoginAttempt({
                req,
                userId: challenge.userId,
                status: "failure",
                otpVerification: "failure"
            });

            return res.status(401).json({
                message:
                    challenge.attempts >= 5
                        ? "Too many incorrect attempts. Please log in again."
                        : "Incorrect verification code."
            });
        }

        // -------------------- VALID OTP --------------------

        const user = await User.findById(
            challenge.userId
        );

        if (!user) {
            await LoginOtp.deleteOne({
                _id: challenge._id
            });

            return res.status(404).json({
                message: "User not found."
            });
        }

        const deviceInfo = getLoginDeviceInfo(req);

        await refreshAutomaticTheme(user);

        // Trust this browser for 30 days.

        await TrustedDevice.findOneAndUpdate(
            {
                userId: user._id,
                deviceFingerprint: fingerprintHash
            },
            {
                $set: {
                    browser: deviceInfo.browser,
                    lastKnownIP: deviceInfo.ip,
                    trustedUntil:
                        new Date(
                            Date.now() +
                            30 * 24 * 60 * 60 * 1000
                        ),
                    lastSeenAt: new Date()
                }
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true
            }
        );

        // Delete the completed OTP challenge.

        await LoginOtp.deleteOne({
            _id: challenge._id
        });

        await recordLoginAttempt({
            req,
            userId: user._id,
            status: "success",
            otpVerification: "success"
        });
        const sessionId = await createUserSession(
           req,
           user,
           fingerprintHash
        );

        return res.json({
            message: "Device verified. Login successful.",
            token: createToken(user, sessionId),
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                themePreference:
                    user.themePreference || "dark",
                themeMode:
                    user.themeMode || "automatic"
            }
        });

    } catch (error) {
        console.error(
            "Device verification error:",
            error
        );

        return res.status(500).json({
            message:
                "Could not verify this device. Please try again."
        });
    }
});

// -------------------- RESEND DEVICE OTP --------------------

app.post("/api/login/resend-device-otp", async (req, res) => {
    try {
        const {
            challengeId,
            deviceFingerprint
        } = req.body || {};

        if (
            !mongoose.isValidObjectId(challengeId) ||
            typeof deviceFingerprint !== "string" ||
            deviceFingerprint.length < 20 ||
            deviceFingerprint.length > 200
        ) {
            return res.status(400).json({
                message: "Invalid resend request."
            });
        }

        const fingerprintHash =
            hashDeviceFingerprint(deviceFingerprint);

        const challenge = await LoginOtp.findOne({
            _id: challengeId,
            deviceFingerprint: fingerprintHash,
            expiresAt: { $gt: new Date() }
        });

        if (!challenge) {
            return res.status(400).json({
                message:
                    "This login request has expired. Please log in again."
            });
        }

        const user = await User.findById(
            challenge.userId
        );

        if (!user) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        try {
            await sendLoginOtp(challenge, user);

        
        } catch (error) {
            if (error.message === "OTP_LIMIT_REACHED") {
                return res.status(429).json({
                    message:
                        "You have reached the OTP sending limit. Try again after 15 minutes."
                });
            }

            if (error.message === "OTP_COOLDOWN") {
                return res.status(202).json({
                    otpRequired: true,
                    challengeId: challenge._id.toString(),
                    emailMasked: maskEmail(user.email),
                    message:
                        "A verification code was already sent. Please check your email."
                });
            }

            throw error;
        }
                return res.status(200).json({
            otpRequired: true,
            challengeId: challenge._id.toString(),
            emailMasked: maskEmail(user.email),
            message: "A verification code has been sent."
        });

    } catch (error) {
        console.error("Resend OTP error:", error);

        return res.status(500).json({
            message: "Could not resend verification code."
        });
    }
});

// -------------------- CURRENT USER --------------------

app.get("/api/me", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select("-password");

        if (!user) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        return res.json({ user });

    } catch (error) {
        console.error("Profile error:", error);

        return res.status(500).json({
            message: "Could not load your profile."
        });
    }
});

// -------------------- THEME PREFERENCE API --------------------

// Manual theme choices persist across logins and devices.
// Sending { themeMode: "automatic" } restores IST-based theme.

app.put("/api/theme", authenticateToken, async (req, res) => {
    try {
        const {
            themeMode,
            themePreference
        } = req.body || {};

        if (themeMode === "manual") {
            if (!["light", "dark"].includes(themePreference)) {
                return res.status(400).json({
                    message:
                        "Choose either light or dark for manual theme mode."
                });
            }

        } else if (themeMode !== "automatic") {
            return res.status(400).json({
                message:
                    'themeMode must be "automatic" or "manual".'
            });
        }

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        if (themeMode === "manual") {
            user.themeMode = "manual";
            user.themePreference = themePreference;

        } else {
            user.themeMode = "automatic";
            user.themePreference =
                getAutomaticThemePreference();
        }

        await user.save();

        return res.json({
            message: "Theme preference updated.",
            themePreference: user.themePreference,
            themeMode: user.themeMode
        });

    } catch (error) {
        console.error("Theme update error:", error);

        return res.status(500).json({
            message:
                "Could not update your theme preference."
        });
    }
});

// -------------------- DOWNLOAD API --------------------

app.use(
    "/api/downloads",
    createDownloadsRouter({ authenticateToken })
);

// -------------------- RAZORPAY PAYMENT API --------------------

app.use(
    "/api/payments",
    createPaymentsRouter({ authenticateToken })
);

// -------------------- WATCH PROGRESS API --------------------
// -------------------- ACCOUNT SECURITY API --------------------

const createSecurityRouter =
    require("./routes/security");

app.use(
    "/api/security",
    createSecurityRouter({
        authenticateToken,
        io
    })
);



// -------------------- SOCKET AUTHENTICATION --------------------

io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token;

        if (!token) {
            return next(new Error("Authentication required."));
        }

        const decoded = jwt.verify(token, JWT_SECRET);

        if (!decoded.id || !decoded.sid) {
            return next(new Error("Invalid login session."));
        }

        // Verify that this login session is still active.
        const session = await UserSession.findOne({
            userId: decoded.id,
            sessionId: decoded.sid,
            revokedAt: null,
            expiresAt: { $gt: new Date() }
        });

        if (!session) {
            return next(
                new Error("Your login session has expired or been revoked.")
            );
        }

        const user = await User.findById(decoded.id)
            .select("_id name email");

        if (!user) {
            return next(new Error("User not found."));
        }

        socket.user = {
            id: user._id.toString(),
            name: user.name,
            email: user.email
        };

        socket.sessionId = session.sessionId;

        next();

    } catch (error) {
        console.error(
            "Socket authentication failed:",
            error.message
        );

        next(new Error("Socket authentication failed."));
    }
});

   

// -------------------- SOCKET EVENTS --------------------

io.on("connection", (socket) => {
    socket.join(`session:${socket.sessionId}`);
    socket.join(`user:${socket.user.id}`);
    console.log(
        "Socket connected:",
        socket.id,
        socket.user.name
    );

    // -------------------- JOIN ROOM --------------------

    socket.on("join-room", ({ roomId } = {}) => {
        if (
            typeof roomId !== "string" ||
            !roomId.trim()
        ) {
            socket.emit(
                "room-error",
                "Invalid meeting room ID."
            );
            return;
        }

        const id = roomId.trim();

        if (socket.data.roomId === id) {
            return;
        }

        if (socket.data.roomId) {
            leaveRoom(socket);
        }

        if (!rooms.has(id)) {
            rooms.set(id, {
                locked: false,
                participants: new Map()
            });
        }

        const room = rooms.get(id);

        if (
            room.locked &&
            !room.participants.has(socket.user.id)
        ) {
            socket.emit(
                "room-error",
                "This meeting is locked."
            );
            return;
        }

        const existingParticipants = [
            ...room.participants.values()
        ];

        socket.join(id);

        room.participants.set(socket.id, {
            socketId: socket.id,
            user: socket.user
        });

        socket.data.roomId = id;

        socket.emit(
            "room-users",
            existingParticipants.map((participant) => ({
                ...participant.user,
                socketId: participant.socketId
            }))
        );

        socket.to(id).emit("user-joined", {
            user: socket.user,
            socketId: socket.id
        });

        io.to(id).emit(
            "participants-updated",
            [...room.participants.values()].map(
                (participant) => ({
                    ...participant.user,
                    socketId: participant.socketId
                })
            )
        );

        console.log(
            `${socket.user.name} (${socket.id}) joined room ${id}. Participants: ${room.participants.size}`
        );
    });

    // -------------------- WEBRTC OFFER --------------------

    socket.on("offer", ({ target, offer } = {}) => {
        if (
            target &&
            offer &&
            socket.data.roomId &&
            io.sockets.sockets.get(target)?.data.roomId ===
                socket.data.roomId
        ) {
            io.to(target).emit("offer", {
                offer,
                from: socket.id,
                user: socket.user
            });
        }
    });

    // -------------------- WEBRTC ANSWER --------------------

    socket.on("answer", ({ target, answer } = {}) => {
        if (
            target &&
            answer &&
            socket.data.roomId &&
            io.sockets.sockets.get(target)?.data.roomId ===
                socket.data.roomId
        ) {
            io.to(target).emit("answer", {
                answer,
                from: socket.id
            });
        }
    });

    // -------------------- ICE CANDIDATES --------------------

    socket.on(
        "ice-candidate",
        ({ target, candidate } = {}) => {
            if (
                target &&
                candidate &&
                socket.data.roomId &&
                io.sockets.sockets.get(target)?.data.roomId ===
                    socket.data.roomId
            ) {
                io.to(target).emit("ice-candidate", {
                    candidate,
                    from: socket.id
                });
            }
        }
    );

    // -------------------- MEETING CHAT --------------------

    socket.on("chat-message", ({ message } = {}) => {
        const id = socket.data.roomId;

        if (
            id &&
            typeof message === "string" &&
            message.trim()
        ) {
            io.to(id).emit("chat-message", {
                message: message.trim().slice(0, 2000),
                user: socket.user,
                timestamp: new Date().toISOString()
            });
        }
    });

    // -------------------- LOCK ROOM --------------------

    socket.on("lock-room", ({ locked } = {}) => {
        const id = socket.data.roomId;

        if (!id || !rooms.has(id)) {
            return;
        }

        rooms.get(id).locked = Boolean(locked);

        io.to(id).emit(
            "room-locked",
            Boolean(locked)
        );
    });

    // -------------------- LEAVE ROOM --------------------

    socket.on("leave-room", () => {
        leaveRoom(socket);
    });

    // -------------------- DISCONNECT --------------------

    socket.on("disconnect", () => {
        leaveRoom(socket);

        console.log(
            "Socket disconnected:",
            socket.id
        );
    });
});

// -------------------- LEAVE ROOM FUNCTION --------------------

function leaveRoom(socket) {
    const id = socket.data.roomId;

    if (!id || !rooms.has(id)) {
        socket.data.roomId = null;
        return;
    }

    const room = rooms.get(id);

    room.participants.delete(socket.id);
    socket.leave(id);

    socket.to(id).emit("user-left", {
        userId: socket.user?.id,
        socketId: socket.id
    });

    io.to(id).emit(
        "participants-updated",
        [...room.participants.values()].map(
            (participant) => ({
                ...participant.user,
                socketId: participant.socketId
            })
        )
    );

    if (room.participants.size === 0) {
        rooms.delete(id);
    }

    socket.data.roomId = null;

    console.log(
        `Socket ${socket.id} left room ${id}`
    );
}

// -------------------- START SERVER --------------------

async function startServer() {
    try {
        console.log("Connecting to MongoDB...");

        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 15000
        });

        console.log(
            "MongoDB connected to:",
            mongoose.connection.host
        );

        console.log(
            "Database name:",
            mongoose.connection.name
        );

        if (User.db !== mongoose.connection) {
            throw new Error(
                "User model is using a different Mongoose connection."
            );
        }

        if (User.db.readyState !== 1) {
            throw new Error(
                "User model is not connected to MongoDB."
            );
        }

        // -------------------- SUBSCRIPTION EXPIRY JOB --------------------

        const runSubscriptionExpiryJob = async () => {
            try {
                const result =
                    await expireExpiredSubscriptions();

                if (
                    result &&
                    result.expiredCount > 0
                ) {
                    console.log(
                        `Subscription expiry job: ${result.expiredCount} subscription(s) expired.`
                    );
                }

            } catch (error) {
                console.error(
                    "Subscription expiry job failed:",
                    error.message
                );
            }
        };

        await runSubscriptionExpiryJob();

        const subscriptionExpiryTimer = setInterval(
            runSubscriptionExpiryJob,
            5 * 60 * 1000
        );

        subscriptionExpiryTimer.unref();

        // -------------------- EMAIL RETRY WORKER --------------------

        // Starts only after MongoDB is connected.
        startEmailQueue();

        // -------------------- LISTEN --------------------

        server.listen(PORT, () => {
            console.log(
                `Server running at http://localhost:${PORT}`
            );

            console.log(
                `Login page: http://localhost:${PORT}/login.html`
            );

            console.log(
                `Download API: http://localhost:${PORT}/api/downloads`
            );

            console.log(
                `Payment API: http://localhost:${PORT}/api/payments`
            );
        });

    } catch (error) {
        console.error(
            "Could not start server:",
            error.message
        );

        process.exit(1);
    }
}

startServer();
