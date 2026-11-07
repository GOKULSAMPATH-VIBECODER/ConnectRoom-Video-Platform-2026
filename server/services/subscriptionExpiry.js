

const Subscription = require("../../models/Subscription");

/**
 * Expire paid subscriptions whose effective expiry date has passed.
 *
 * Prefer expiryDate (current schema).
 * Use expiresAt (legacy schema) only when expiryDate is missing or null.
 *
 * Subscription history, videos, watch history and downloads are preserved.
 */
async function expireExpiredSubscriptions() {
  const now = new Date();

  const expiredDateCondition = {
    $type: "date",
    $lte: now
  };

  const result = await Subscription.updateMany(
    {
      status: "active",
      plan: { $in: ["Bronze", "Silver", "Gold"] },

      $or: [
        // Current schema: expiryDate is authoritative.
        {
          expiryDate: expiredDateCondition
        },

        // Legacy fallback: expiryDate does not exist.
        {
          expiryDate: { $exists: false },
          expiresAt: expiredDateCondition
        },

        // Legacy fallback: expiryDate is explicitly null.
        {
          expiryDate: null,
          expiresAt: expiredDateCondition
        }
      ]
    },
    {
      $set: {
        status: "expired",
        autoRenew: false,
        renewalPolicy: "none"
      }
    }
  );

  return {
    checkedAt: now,
    expiredCount: result.modifiedCount
  };
}

module.exports = {
  expireExpiredSubscriptions
};
