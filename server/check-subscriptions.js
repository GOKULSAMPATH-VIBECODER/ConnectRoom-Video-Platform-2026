

require("dotenv").config();

const mongoose = require("mongoose");

async function main() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000
    });

    console.log("MongoDB connected:", mongoose.connection.name);
    console.log("Connection state:", mongoose.connection.readyState);

    // Read directly from the MongoDB collection, bypassing the model.
    const rows = await mongoose.connection.db
      .collection("subscriptions")
      .find({
        plan: { $in: ["Bronze", "Silver", "Gold"] }
      })
      .project({
        plan: 1,
        status: 1,
        expiryDate: 1,
        expiresAt: 1,
        userId: 1
      })
      .toArray();

    console.log("Paid subscription records:", rows.length);
    console.log(JSON.stringify(rows, null, 2));
  } catch (error) {
    console.error("Diagnostic failed:", error.message);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

main();
