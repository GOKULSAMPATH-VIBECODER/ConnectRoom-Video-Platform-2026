
const EmailJob = require("../../models/EmailJob");
const { sendPaymentConfirmation } = require("./email");

const MAX_ATTEMPTS = 10;
const BATCH_SIZE = 10;
const RETRY_INTERVAL_MS = 30 * 1000;
const STALE_SENDING_MS = 10 * 60 * 1000;

let workerTimer = null;
let workerRunning = false;

function getRetryDelay(attempts) {
  // Exponential backoff: 30 seconds, 60 seconds, 120 seconds...
  // Maximum delay is 6 hours.
  return Math.min(
    30 * 1000 * Math.pow(2, Math.max(0, attempts - 1)),
    6 * 60 * 60 * 1000
  );
}

async function claimNextJob() {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_SENDING_MS);

  return EmailJob.findOneAndUpdate(
    {
      attempts: { $lt: MAX_ATTEMPTS },
      $or: [
        {
          status: { $in: ["pending", "retry"] },
          nextAttemptAt: { $lte: now }
        },
        {
          status: "sending",
          updatedAt: { $lte: staleBefore }
        }
      ]
    },
    {
      $set: {
        status: "sending"
      },
      $inc: {
        attempts: 1
      }
    },
    {
      new: true,
      sort: { nextAttemptAt: 1, createdAt: 1 }
    }
  );
}

async function processEmailQueue() {
  if (workerRunning) return;

  workerRunning = true;

  try {
    for (let count = 0; count < BATCH_SIZE; count += 1) {
      const job = await claimNextJob();

      if (!job) break;

      try {
        await sendPaymentConfirmation(job);

        await EmailJob.updateOne(
          { _id: job._id, status: "sending" },
          {
            $set: {
              status: "sent",
              sentAt: new Date(),
              lastError: null
            }
          }
        );

        console.log(
          `[EmailQueue] Email sent for payment ${job.paymentId}`
        );
      } catch (error) {
        const message = String(
          error && error.message ? error.message : error
        ).slice(0, 2000);

        const exhausted = job.attempts >= MAX_ATTEMPTS;

        await EmailJob.updateOne(
          { _id: job._id, status: "sending" },
          {
            $set: {
              status: exhausted ? "failed" : "retry",
              lastError: message,
              nextAttemptAt: new Date(
                Date.now() + getRetryDelay(job.attempts)
              )
            }
          }
        );

        console.error(
          `[EmailQueue] Delivery failed for job ${job._id}. ` +
          `Attempt ${job.attempts}/${MAX_ATTEMPTS}. ` +
          `Status: ${exhausted ? "failed" : "retry"}.`,
          message
        );
      }
    }
  } catch (error) {
    console.error("[EmailQueue] Worker error:", error.message);
  } finally {
    workerRunning = false;
  }
}

function startEmailQueue() {
  if (workerTimer) return;

  console.log("[EmailQueue] Email retry worker started.");

  // Process queued emails immediately after startup.
  processEmailQueue().catch(error => {
    console.error("[EmailQueue] Startup processing error:", error.message);
  });

  workerTimer = setInterval(() => {
    processEmailQueue().catch(error => {
      console.error("[EmailQueue] Processing error:", error.message);
    });
  }, RETRY_INTERVAL_MS);

  if (typeof workerTimer.unref === "function") {
    workerTimer.unref();
  }
}

module.exports = {
  startEmailQueue,
  processEmailQueue
};
