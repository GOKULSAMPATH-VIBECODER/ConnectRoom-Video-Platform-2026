
const express = require("express");
const mongoose = require("mongoose");

const Payment = require("../../models/Payment");

const {
  PLANS,
  getPlan,
  createOrder
} = require("../services/payment");

const {
  verifyPaymentSignature
} = require("../services/verifyPayment");

const {
  activatePayment
} = require("../services/activatePayment");

function createPaymentsRouter({ authenticateToken }) {
  if (typeof authenticateToken !== "function") {
    throw new Error("Authentication middleware required");
  }

  const router = express.Router();

  // Protect all payment routes
  router.use(authenticateToken);

  // =====================================
  // GET /api/payments/plans
  // =====================================

  router.get("/plans", (_req, res) => {
    return res.json({
      success: true,
      currency: "INR",
      billing: "monthly",
      plans: [
        {
          name: "Free",
          amount: 0
        },
        ...Object.entries(PLANS).map(([name, item]) => ({
          name,
          amount: item.amount
        }))
      ]
    });
  });

  // =====================================
  // POST /api/payments/orders
  // =====================================

  router.post("/orders", async (req, res) => {
    try {
      const userId = req.user?.id;

      if (!mongoose.isValidObjectId(userId)) {
        return res.status(401).json({
          message: "Please log in again."
        });
      }

      const plan = getPlan(req.body?.plan);

      if (!plan) {
        return res.status(400).json({
          message: "Invalid subscription plan."
        });
      }

      // Create a Razorpay order using
      // the amount stored on the server.
      const { order } = await createOrder(
        plan.name,
        userId
      );

      // Save the order in MongoDB
      await Payment.create({
        userId,
        plan: plan.name,
        razorpayOrderId: order.id,
        amount: plan.amount,
        currency: "INR",
        status: "created"
      });

      return res.status(201).json({
        success: true,
        orderId: order.id,
        amount: plan.amount,
        currency: "INR",
        keyId: process.env.RAZORPAY_KEY_ID
      });

    } catch (error) {
      console.error(
        "Payment order creation failed:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Could not create payment order."
      });
    }
  });

  // =====================================
  // POST /api/payments/verify
  // =====================================

  router.post("/verify", async (req, res) => {
    try {
      const userId = req.user?.id;

      if (!mongoose.isValidObjectId(userId)) {
        return res.status(401).json({
          success: false,
          message: "Please log in again."
        });
      }

      const {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature
      } = req.body || {};

      // Check required payment details
      if (
        ![orderId, paymentId, signature].every(
          value =>
            typeof value === "string" &&
            value.length > 0
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Missing payment details."
        });
      }

      // Find the order belonging to
      // the currently logged-in user.
      const record = await Payment.findOne({
        razorpayOrderId: orderId,
        userId
      });

      if (!record) {
        return res.status(404).json({
          success: false,
          message: "Payment order not found for this user."
        });
      }

      // Verify Razorpay checkout signature
      const validSignature = verifyPaymentSignature({
        orderId: record.razorpayOrderId,
        paymentId,
        signature
      });

      if (!validSignature) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment signature."
        });
      }

      // Verify the stored plan and amount
      const plan = getPlan(record.plan);

      if (
        !plan ||
        record.amount !== plan.amount ||
        record.currency !== "INR"
      ) {
        return res.status(409).json({
          success: false,
          message: "Stored payment details are inconsistent."
        });
      }

      // Shared activation service:
      // - Confirms captured payment with Razorpay
      // - Uses a MongoDB transaction
      // - Prevents duplicate subscription activation
      const result = await activatePayment(
        orderId,
        paymentId
      );

      return res.json({
        success: true,
        message: result.alreadyProcessed
          ? "Payment already verified."
          : "Payment verified successfully.",
        subscriptionId: result.subscriptionId,
        alreadyProcessed: result.alreadyProcessed
      });

    } catch (error) {
      console.error(
        "Payment verification failed:",
        error
      );

      const status =
        Number.isInteger(error.status) &&
        error.status >= 400 &&
        error.status < 500
          ? error.status
          : 500;

      return res.status(status).json({
        success: false,
        message: status === 500
          ? "Payment verification could not be completed."
          : error.message
      });
    }
  });

  return router;
}

module.exports = {
  createPaymentsRouter
};
