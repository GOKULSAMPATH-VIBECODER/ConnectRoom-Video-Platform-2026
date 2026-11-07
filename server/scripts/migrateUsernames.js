const path = require("path");

require("dotenv").config({
    path: path.resolve(__dirname, "..", ".env")
});

const mongoose = require("mongoose");

mongoose.set("autoIndex", false);

const User = require("../../models/User");

function generateUsername(user, usedUsernames) {
    const base =
        (user.name || "user")
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 19) || "user";

    const id = String(user._id).toLowerCase();

    let username = `${base}_${id.slice(-10)}`;

    if (usedUsernames.has(username)) {
        username = `u_${id}`;
    }

    if (usedUsernames.has(username)) {
        throw new Error(
            `Could not generate a unique username for user ${id}`
        );
    }

    return username;
}

async function migrate() {
    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI is missing from server/.env");
    }

    await mongoose.connect(process.env.MONGO_URI);

    console.log("Connected to MongoDB.");

    const users = await User.find({})
        .select("_id name username")
        .lean();

    const usedUsernames = new Set();

    for (const user of users) {
        if (!user.username) continue;

        const username = user.username.toLowerCase();

        if (usedUsernames.has(username)) {
            throw new Error(
                `Duplicate existing username detected: ${username}`
            );
        }

        usedUsernames.add(username);
    }

    const updates = [];

    for (const user of users) {
        if (user.username) continue;

        const username = generateUsername(
            user,
            usedUsernames
        );

        usedUsernames.add(username);

        updates.push({
            updateOne: {
                filter: {
                    _id: user._id,
                    $or: [
                        { username: { $exists: false } },
                        { username: null },
                        { username: "" }
                    ]
                },
                update: {
                    $set: { username }
                }
            }
        });
    }

    console.log("Total accounts:", users.length);
    console.log("Accounts needing usernames:", updates.length);

    if (!process.argv.includes("--apply")) {
        console.log("");
        console.log("DRY RUN: No database records were changed.");
        console.log("Run with --apply to perform the migration.");
        return;
    }

    if (updates.length > 0) {
        const result = await User.bulkWrite(updates);

        console.log(
            "Accounts updated:",
            result.modifiedCount
        );
    }

    await User.collection.createIndex(
        { username: 1 },
        {
            unique: true,
            sparse: true,
            name: "username_unique"
        }
    );

    console.log("Unique username index verified.");
    console.log("Username migration completed successfully.");
}

migrate()
    .catch(error => {
        console.error("Migration failed:", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
