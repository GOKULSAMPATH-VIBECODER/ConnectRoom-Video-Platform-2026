
const express = require("express");
const Payment = require("../../models/Payment");
const WebhookEvent = require("../../models/WebhookEvent");

const {
  verifyWebhookSignature
} = require("../services/verifyPayment");

const {
  activatePayment
} = require("../services/activatePayment");

const router = express.Router();

router.post(
  "/",
  express.raw({
    type: "application/json",
    limit: "1mb"
  }),
  async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body)) {
        return res.status(400).json({
          message: "Invalid request body"
        });
      }

      const signature =
        req.headers["x-razorpay-signature"];

      if (!verifyWebhookSignature(req.body, signature)) {
        return res.status(401).json({
          message: "Invalid signature"
        });
      }

      const eventId = req.headers["x-razorpay-event-id"];

      if (typeof eventId !== "string" ||
          !eventId.trim()) {
        return res.status(400).json({
          message: "Missing event ID"
        });
      }

      const event = JSON.parse(req.body.toString("utf8"));

      if (!event || typeof event.event !== "string") {
        return res.status(400).json({
          message: "Invalid event"
        });
      }

      const existing = await WebhookEvent.findOne({
        eventId
      });

      if (existing) {
        return res.json({
          success: true,
          duplicate: true
        });
      }

      if (event.event === "payment.captured") {
        const payment =
          event.payload?.payment?.entity;

        if (!payment?.id || !payment?.order_id) {
          return res.status(400).json({
            message: "Missing payment information"
          });
        }

        await activatePayment(
          payment.order_id,
          payment.id,
          { id: eventId, type: event.event }
        );

        return res.json({ success: true });
      }

      if (event.event === "payment.failed") {
        const payment =
          event.payload?.payment?.entity;

        if (payment?.order_id) {
          await Payment.updateOne(
            {
              razorpayOrderId: payment.order_id,
              status: { $in: ["created", "pending", "authorized"] }
            },
            {
              $set: { status: "failed" }
            }
          );
        }
      }

      // Other event types are acknowledged but do not
      // activate subscriptions.
      try {
        await WebhookEvent.create({
          eventId,
          eventType: event.event
        });
      } catch (error) {
        if (error.code !== 11000) throw error;
      }

      return res.json({ success: true });

    } catch (error) {
      console.error("Webhook processing error:", error);

      if (error.code === 11000) {
        return res.json({
          success: true,
          duplicate: true
        });
      }

      return res.status(500).json({
        message: "Webhook processing failed"
      });
    }
  }
);

module.exports = router;
