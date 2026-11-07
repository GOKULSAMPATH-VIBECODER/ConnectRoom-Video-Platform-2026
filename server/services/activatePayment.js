
const mongoose = require("mongoose");
const crypto = require("crypto");

const Payment = require("../../models/Payment");
const Subscription = require("../../models/Subscription");
const User = require("../../models/User");
const EmailJob = require("../../models/EmailJob");

const {
  getPlan,
  fetchConfirmedPayment
} = require("./payment");

function generateInvoiceNumber() {
  return `CR-INV-${Date.now()}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
}

async function activatePayment(orderId, paymentId, eventInfo = null) {
  const record = await Payment.findOne({
    razorpayOrderId: orderId
  });

  if (!record) {
    const error = new Error("Unknown order");
    error.status = 404;
    throw error;
  }

  const plan = getPlan(record.plan);

  if (
    !plan ||
    record.amount !== plan.amount ||
    record.currency !== "INR"
  ) {
    throw new Error("Invalid stored payment details");
  }

  if (record.status === "captured") {
    if (
      record.razorpayPaymentId !== paymentId ||
      !record.subscriptionId
    ) {
      throw new Error("Conflicting captured payment");
    }

    return {
      subscriptionId: record.subscriptionId,
      invoiceNumber: record.invoiceNumber,
      alreadyProcessed: true
    };
  }

  const confirmed = await fetchConfirmedPayment(
    paymentId,
    orderId,
    record.amount
  );

  if (!confirmed) {
    const error = new Error("Payment not confirmed");
    error.status = 409;
    throw error;
  }

  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const invoiceNumber = generateInvoiceNumber();

      const claim = await Payment.findOneAndUpdate(
        {
          _id: record._id,
          status: { $ne: "captured" },
          razorpayPaymentId: null
        },
        {
          $set: {
            status: "captured",
            razorpayPaymentId: paymentId,
            verifiedAt: new Date(),
            invoiceNumber
          }
        },
        {
          new: true,
          session
        }
      );

      if (!claim) {
        const error = new Error("Payment already claimed");
        error.status = 409;
        throw error;
      }

      const start = new Date();
      const expiry = new Date(
        start.getTime() + plan.days * 86400000
      );

      const [subscription] = await Subscription.create(
        [{
          userId: claim.userId,
          plan: plan.name,
          status: "active",
          startDate: start,
          expiryDate: expiry,
          startsAt: start,
          expiresAt: expiry,
          renewalPolicy: "manual",
          autoRenew: false,
          paymentId: claim._id,
          orderId,
          paymentReference: paymentId
        }],
        { session }
      );

      await Payment.updateOne(
        { _id: claim._id },
        {
          $set: {
            subscriptionId: subscription._id
          }
        },
        { session }
      );

      // Prepare the confirmation email using the registered account.
      const user = await User.findById(claim.userId)
        .select("name email")
        .session(session);

      const recipient = user && user.email
        ? user.email
        : "";

      const emailPayload = {
        customerName: user && user.name ? user.name : "Customer",
        plan: plan.name,
        amount: (claim.amount / 100).toFixed(2),
        currency: claim.currency,
        transactionId: paymentId,
        orderId,
        invoiceNumber,
        startDate: start.toISOString(),
        expiryDate: expiry.toISOString()
      };

      // Save the email job in the same transaction as activation.
      // Actual SMTP delivery happens later in the retry worker.
      await EmailJob.create(
        [{
          paymentId: claim._id,
          to: recipient,
          subject: `ConnectRoom ${plan.name} subscription confirmation`,
          payload: emailPayload,
          status: "pending",
          attempts: 0,
          nextAttemptAt: new Date()
        }],
        { session }
      );

      if (eventInfo) {
        const WebhookEvent = require("../../models/WebhookEvent");

        await WebhookEvent.create(
          [{
            eventId: eventInfo.id,
            eventType: eventInfo.type
          }],
          { session }
        );
      }

      result = {
        subscriptionId: subscription._id,
        invoiceNumber,
        alreadyProcessed: false
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { activatePayment };

