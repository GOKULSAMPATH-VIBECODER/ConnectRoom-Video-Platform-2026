
const Razorpay = require("razorpay");
const crypto = require("crypto");

// Trusted server-side prices in paise.
// One-time monthly purchases, not automatic recurring billing.
const PLANS = Object.freeze({
  Bronze: { amount: 9900, days: 30 },
  Silver: { amount: 19900, days: 30 },
  Gold: { amount: 39900, days: 30 }
});

function getPlan(plan) {
  if (typeof plan !== "string" ||
      !Object.prototype.hasOwnProperty.call(PLANS, plan)) {
    return null;
  }
  return { name: plan, ...PLANS[plan] };
}

function getRazorpay() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) {
    throw new Error("Razorpay credentials are missing.");
  }

  return new Razorpay({ key_id, key_secret });
}

async function createOrder(planName, userId) {
  const plan = getPlan(planName);
  if (!plan) {
    const error = new Error("Invalid subscription plan.");
    error.status = 400;
    throw error;
  }

  const receipt = `cr_${crypto.randomBytes(12).toString("hex")}`;

  const order = await getRazorpay().orders.create({
    amount: plan.amount,
    currency: "INR",
    receipt,
    partial_payment: false,
    notes: {
      plan: plan.name,
      userId: String(userId)
    }
  });

  return { order, plan };
}

function verifySignature(orderId, paymentId, signature) {
  if (
    typeof orderId !== "string" ||
    typeof paymentId !== "string" ||
    typeof signature !== "string" ||
    !/^[a-fA-F0-9]{64}$/.test(signature)
  ) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest();

  const received = Buffer.from(signature, "hex");

  return received.length === expected.length &&
    crypto.timingSafeEqual(received, expected);
}

async function fetchConfirmedPayment(paymentId, orderId, amount) {
  const razorpay = getRazorpay();

  const [payment, order] = await Promise.all([
    razorpay.payments.fetch(paymentId),
    razorpay.orders.fetch(orderId)
  ]);

  if (
    payment.id !== paymentId ||
    payment.order_id !== orderId ||
    payment.status !== "captured" ||
    payment.captured !== true ||
    Number(payment.amount) !== amount ||
    payment.currency !== "INR" ||
    order.id !== orderId ||
    Number(order.amount) !== amount ||
    order.currency !== "INR" ||
    order.status !== "paid"
  ) {
    return null;
  }

  return payment;
}

module.exports = {
  PLANS,
  getPlan,
  createOrder,
  verifySignature,
  fetchConfirmedPayment
};
