
const crypto = require("crypto");
const mongoose = require("mongoose");
const QuotaUsage = require("../../models/QuotaUsage");

const PLAN_LIMITS = Object.freeze({
  Free: Object.freeze({ daily: 1, monthly: 10 }),
  Bronze: Object.freeze({ daily: 3, monthly: 60 }),
  Silver: Object.freeze({ daily: 5, monthly: 150 }),
  Gold: Object.freeze({ daily: 10, monthly: 300 }),
});

const IST = "Asia/Kolkata";

function getISTKeys(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );

  const dayKey =
    `${values.year}-${values.month}-${values.day}`;

  return {
    dayKey,
    monthKey: dayKey.slice(0, 7),
  };
}

function getPlanLimits(plan) {
  if (
    typeof plan !== "string" ||
    !Object.prototype.hasOwnProperty.call(PLAN_LIMITS, plan)
  ) {
    return null;
  }

  return PLAN_LIMITS[plan];
}

function isValidIdempotencyKey(key) {
  return (
    typeof key === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)
  );
}

async function reserveQuota({
  userId,
  plan,
  idempotencyKey,
  now = new Date(),
}) {
  if (!mongoose.isValidObjectId(userId)) {
    return { allowed: false, reason: "UNAUTHENTICATED" };
  }

  const limits = getPlanLimits(plan);

  if (!limits) {
    return { allowed: false, reason: "INVALID_PLAN" };
  }

  if (!isValidIdempotencyKey(idempotencyKey)) {
    return {
      allowed: false,
      reason: "INVALID_IDEMPOTENCY_KEY",
    };
  }

  const { dayKey, monthKey } = getISTKeys(now);
  const dailyField = `dailyCounts.${dayKey}`;

  const filter = {
    userId: new mongoose.Types.ObjectId(userId),
    monthKey,
    idempotencyKeys: { $ne: idempotencyKey },
    $and: [
      {
        $or: [
          { monthlyCount: { $lt: limits.monthly } },
          { monthlyCount: { $exists: false } },
        ],
      },
      {
        $or: [
          { [dailyField]: { $lt: limits.daily } },
          { [dailyField]: { $exists: false } },
        ],
      },
    ],
  };

  const update = {
    $inc: {
      monthlyCount: 1,
      [dailyField]: 1,
    },
    $addToSet: {
      idempotencyKeys: idempotencyKey,
    },
  };

  let reservation;

  try {
    reservation = await QuotaUsage.findOneAndUpdate(
      filter,
      update,
      {
        upsert: true,
        new: true,
        runValidators: true,
      }
    );
  } catch (error) {
    // Concurrent creation can collide with the unique
    // user/month index. Retry without creating a document.
    if (error.code !== 11000) {
      throw error;
    }

    reservation = await QuotaUsage.findOneAndUpdate(
      filter,
      update,
      {
        upsert: false,
        new: true,
        runValidators: true,
      }
    );
  }

  if (!reservation) {
    const existing = await QuotaUsage.findOne({
      userId,
      monthKey,
    }).lean();

    if (existing?.idempotencyKeys?.includes(idempotencyKey)) {
      return {
        allowed: false,
        reason: "DUPLICATE_REQUEST",
      };
    }

    const dailyCount = existing?.dailyCounts?.[dayKey] ?? 0;
    const monthlyCount = existing?.monthlyCount ?? 0;

    if (dailyCount >= limits.daily) {
      return {
        allowed: false,
        reason: "DAILY_QUOTA_EXCEEDED",
      };
    }

    if (monthlyCount >= limits.monthly) {
      return {
        allowed: false,
        reason: "MONTHLY_QUOTA_EXCEEDED",
      };
    }

    return {
      allowed: false,
      reason: "RESERVATION_CONFLICT",
    };
  }

  const dailyCount = reservation.dailyCounts.get(dayKey) ?? 0;

  return {
    allowed: true,
    plan,
    dailyRemaining: limits.daily - dailyCount,
    monthlyRemaining: limits.monthly - reservation.monthlyCount,
    dayKey,
    monthKey,
    idempotencyKey,
  };
}

module.exports = {
  PLAN_LIMITS,
  getPlanLimits,
  getISTKeys,
  reserveQuota,
};

