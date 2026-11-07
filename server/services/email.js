
const nodemailer = require("nodemailer");

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP configuration is incomplete. Check SMTP_HOST, SMTP_USER and SMTP_PASS."
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE !== "false",
    auth: {
      user,
      pass
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
  });
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short"
  });
}

async function sendPaymentConfirmation(job) {
  if (!job || !job.to || !job.payload) {
    throw new Error("Email recipient or payment details are missing.");
  }

  const data = job.payload;
  const supportEmail = process.env.SUPPORT_EMAIL || process.env.SMTP_USER;

  const transporter = getTransporter();

  const text = [
    "Thank you for your subscription purchase on ConnectRoom.",
    "",
    `Plan: ${data.plan}`,
    `Amount: ${data.amount} ${data.currency || "INR"}`,
    `Transaction ID: ${data.transactionId}`,
    `Order ID: ${data.orderId}`,
    `Invoice Number: ${data.invoiceNumber}`,
    `Subscription Start: ${formatDate(data.startDate)}`,
    `Subscription Expiry: ${formatDate(data.expiryDate)}`,
    "",
    `Support Contact: ${supportEmail || "Please contact platform support"}`,
    "",
    "Your payment has been verified successfully."
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#222">
      <h2>ConnectRoom Payment Confirmation</h2>
      <p>Thank you for your purchase. Your payment has been verified successfully.</p>
      <table cellpadding="9" cellspacing="0" border="1"
        style="border-collapse:collapse;width:100%;border-color:#ddd">
        <tr><td><b>Plan</b></td><td>${escapeHtml(data.plan)}</td></tr>
        <tr><td><b>Amount</b></td><td>${escapeHtml(data.amount)} ${escapeHtml(data.currency || "INR")}</td></tr>
        <tr><td><b>Transaction ID</b></td><td>${escapeHtml(data.transactionId)}</td></tr>
        <tr><td><b>Order ID</b></td><td>${escapeHtml(data.orderId)}</td></tr>
        <tr><td><b>Invoice Number</b></td><td>${escapeHtml(data.invoiceNumber)}</td></tr>
        <tr><td><b>Subscription Start</b></td><td>${escapeHtml(formatDate(data.startDate))}</td></tr>
        <tr><td><b>Subscription Expiry</b></td><td>${escapeHtml(formatDate(data.expiryDate))}</td></tr>
      </table>
      <p>For support, contact:
        ${supportEmail ? escapeHtml(supportEmail) : "your platform administrator"}
      </p>
      <p>Thank you for using ConnectRoom.</p>
    </div>
  `;

  return transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: job.to,
    subject: job.subject || `ConnectRoom ${data.plan} subscription confirmation`,
    text,
    html
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

module.exports = {
  sendPaymentConfirmation
};
