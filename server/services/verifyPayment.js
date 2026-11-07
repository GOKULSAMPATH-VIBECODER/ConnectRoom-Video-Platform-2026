
const crypto = require("crypto");

function safeCompare(expected, received) {
  if (
    typeof received !== "string" ||
    !/^[a-f0-9]{64}$/i.test(received)
  ) {
    return false;
  }

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");

  return a.length === b.length &&
    crypto.timingSafeEqual(a, b);
}

function verifyPaymentSignature({
  orderId,
  paymentId,
  signature
}) {
  const secret = process.env.RAZORPAY_KEY_SECRET;

  if (!secret) {
    throw new Error("Razorpay secret not configured");
  }

  if (
    typeof orderId !== "string" ||
    typeof paymentId !== "string"
  ) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  return safeCompare(expected, signature);
}

function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("Webhook secret not configured");
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  return safeCompare(expected, signature);
}

module.exports = {
  verifyPaymentSignature,
  verifyWebhookSignature
};
