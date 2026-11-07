
const express = require("express");

const LoginLog = require("../models/LoginLog");
const LoginOtp = require("../../models/LoginOtp");
const TrustedDevice = require("../../models/TrustedDevice");
const UserSession = require("../../models/UserSession");

function createSecurityRouter({ authenticateToken, io }) {
    const router = express.Router();

    router.use(authenticateToken);

    // GET ACCOUNT SECURITY OVERVIEW
    router.get("/overview", async (req, res) => {
        try {
            const userId = req.user.id;
            const now = new Date();

            const [
                loginAttempts,
                sessions,
                trustedDevices,
                otpChallenges
            ] = await Promise.all([
                LoginLog.find({ userId })
                    .sort({ timestamp: -1 })
                    .limit(30)
                    .lean(),

                UserSession.find({
                    userId,
                    revokedAt: null,
                    expiresAt: { $gt: now }
                })
                    .sort({ lastActivityAt: -1 })
                    .lean(),

                TrustedDevice.find({
                    userId,
                    trustedUntil: { $gt: now }
                })
                    .sort({ lastSeenAt: -1 })
                    .lean(),

                LoginOtp.find({ userId })
                    .select(
                        "deviceFingerprint attempts sendCount lastSentAt otpExpiresAt"
                    )
                    .lean()
            ]);

            res.json({
                success: true,

                currentSessionId: req.user.sessionId,

                loginAttempts,

                sessions: sessions.map(session => ({
                    sessionId: session.sessionId,
                    browser: session.browser,
                    operatingSystem: session.operatingSystem,
                    device: session.device,
                    ipAddress: session.ipAddress,
                    createdAt: session.createdAt,
                    lastActivityAt: session.lastActivityAt,
                    expiresAt: session.expiresAt,
                    isCurrent:
                        session.sessionId === req.user.sessionId
                })),

                trustedDevices: trustedDevices.map(device => ({
                    id: device._id,
                    browser: device.browser,
                    lastKnownIP: device.lastKnownIP,
                    createdAt: device.createdAt,
                    lastSeenAt: device.lastSeenAt,
                    trustedUntil: device.trustedUntil
                })),

                otpChallenges: otpChallenges.map(challenge => ({
                    attempts: challenge.attempts,
                    sendCount: challenge.sendCount,
                    lastSentAt: challenge.lastSentAt,
                    otpExpiresAt: challenge.otpExpiresAt
                }))
            });

        } catch (error) {
            console.error("Security overview error:", error);

            res.status(500).json({
                message: "Could not load account security information."
            });
        }
    });

    // REVOKE ONE SESSION
    router.delete("/sessions/:sessionId", async (req, res) => {
        try {
            const { sessionId } = req.params;

            if (!sessionId || sessionId.length > 100) {
                return res.status(400).json({
                    message: "Invalid session ID."
                });
            }

            const session = await UserSession.findOneAndUpdate(
                {
                    userId: req.user.id,
                    sessionId,
                    revokedAt: null
                },
                {
                    $set: {
                        revokedAt: new Date(),
                        revokedReason: "User revoked session"
                    }
                },
                { new: true }
            );

            if (!session) {
                return res.status(404).json({
                    message: "Active session not found."
                });
            }

            if (io) {
                io.in(`session:${sessionId}`)
                    .disconnectSockets(true);
            }

            res.json({
                success: true,
                message: "Session revoked successfully.",
                currentSession:
                    sessionId === req.user.sessionId
            });

        } catch (error) {
            console.error("Session revocation error:", error);

            res.status(500).json({
                message: "Could not revoke session."
            });
        }
    });

    
    // LOG OUT FROM ALL OTHER SESSIONS
    router.post("/sessions/revoke-others", async (req, res) => {
        try {
            // Find other active sessions before revoking them.
            const otherSessions = await UserSession.find({
                userId: req.user.id,
                sessionId: { $ne: req.user.sessionId },
                revokedAt: null
            }).select("sessionId");

            const now = new Date();

            const result = await UserSession.updateMany(
                {
                    userId: req.user.id,
                    sessionId: { $ne: req.user.sessionId },
                    revokedAt: null
                },
                {
                    $set: {
                        revokedAt: now,
                        revokedReason: "Logged out from other sessions"
                    }
                }
            );

            // Disconnect only the revoked sessions.
            if (io) {
                for (const session of otherSessions) {
                    io.in(`session:${session.sessionId}`)
                        .disconnectSockets(true);
                }
            }

            return res.json({
                success: true,
                revokedCount: result.modifiedCount,
                message: "Other sessions have been revoked."
            });

        } catch (error) {
            console.error("Revoke other sessions error:", error);

            return res.status(500).json({
                message: "Could not revoke other sessions."
            });
        }
    });


    // REMOVE A TRUSTED DEVICE
    router.delete("/devices/:deviceId", async (req, res) => {
        try {
            const device = await TrustedDevice.findOne({
                _id: req.params.deviceId,
                userId: req.user.id
            });

            if (!device) {
                return res.status(404).json({
                    message: "Trusted device not found."
                });
            }

            await TrustedDevice.deleteOne({
                _id: device._id,
                userId: req.user.id
            });

            // Also invalidate sessions associated with this device.
            await UserSession.updateMany(
                {
                    userId: req.user.id,
                    deviceFingerprint: device.deviceFingerprint,
                    revokedAt: null
                },
                {
                    $set: {
                        revokedAt: new Date(),
                        revokedReason: "Trusted device removed"
                    }
                }
            );

            if (io) {
                const affectedSessions = await UserSession.find({
                    userId: req.user.id,
                    deviceFingerprint: device.deviceFingerprint
                }).select("sessionId");

                for (const session of affectedSessions) {
                    io.in(`session:${session.sessionId}`)
                        .disconnectSockets(true);
                }
            }

            res.json({
                success: true,
                message: "Trusted device removed successfully."
            });

        } catch (error) {
            console.error("Trusted device removal error:", error);

            res.status(500).json({
                message: "Could not remove trusted device."
            });
        }
    });

    return router;
}

module.exports = createSecurityRouter;
