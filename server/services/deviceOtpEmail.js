const nodemailer = require("nodemailer");

function createTransporter() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 465);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
        throw new Error("SMTP configuration is incomplete.");
    }

    return nodemailer.createTransport({
        host,
        port,
        secure: process.env.SMTP_SECURE !== "false",
        auth: { user, pass },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000
    });
}

async function sendDeviceOtp(email, otp) {
    const transporter = createTransporter();

    return transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: "Your ConnectRoom login verification code",
        text: [
            "A login attempt was made from a new browser or device.",
            "",
            `Your ConnectRoom verification code is: ${otp}`,
            "",
            "This code expires in 5 minutes.",
            "Do not share this code with anyone.",
            "If you did not try to log in, you can ignore this email."
        ].join("\n"),
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
            <h2>ConnectRoom login verification</h2>
            <p>A login attempt was made from a new browser or device.</p>
            <p style="font-size:28px;font-weight:bold;letter-spacing:8px">
              ${otp}
            </p>
            <p>This code expires in 5 minutes.</p>
            <p>Never share this code with anyone.</p>
            <p>If this was not you, ignore this email and secure your account.</p>
          </div>
        `
    });
}

module.exports = { sendDeviceOtp };
