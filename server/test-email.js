
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const { sendPaymentConfirmation } = require("./services/email");

async function main() {
  const recipient = process.env.EMAIL_TEST_TO;

  if (!recipient) {
    throw new Error(
      "Set EMAIL_TEST_TO in this PowerShell window to your own email address."
    );
  }

  const result = await sendPaymentConfirmation({
    to: recipient,
    subject: "ConnectRoom SMTP Test",
    payload: {
      plan: "Bronze (TEST ONLY)",
      amount: "1.00",
      currency: "INR",
      transactionId: "TEST-TRANSACTION",
      orderId: "TEST-ORDER",
      invoiceNumber: "TEST-INVOICE",
      startDate: new Date().toISOString(),
      expiryDate: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString()
    }
  });

  console.log("SMTP test email accepted by mail server.");
  console.log("Message ID:", result.messageId);
  console.log("Check your inbox and spam folder.");
}

main().catch(error => {
  console.error("SMTP TEST FAILED:", error.message);
  process.exitCode = 1;
});
