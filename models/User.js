
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    preferredLanguage: {
        type: String,
        default: "en",
        trim: true,
        lowercase: true,
        maxlength: 20
    },

    name: {
        type: String,
        required: true,
        trim: true
    },

    // Automatically assigned during registration or migration.
    username: {
        type: String,
        lowercase: true,
        trim: true,
        minlength: 3,
        maxlength: 30,
        match: /^[a-z0-9_]+$/
    },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },

    password: {
        type: String,
        required: true
    },

    profileImage: {
        type: String,
        default: ""
    },

    location: {
        type: String,
        trim: true,
        maxlength: 100,
        default: ""
    },

    shareLocation: {
        type: Boolean,
        default: false
    },

    notificationPreferences: {
        mentions: {
            type: Boolean,
            default: true
        }
    },

    themePreference: {
        preferredLanguage: {
            type: String,
            default: "en",
            trim: true,
            lowercase: true,
            maxlength: 20
        },
        type: String,
        enum: ["light", "dark"],
        default: "dark"
    },

    themeMode: {
        type: String,
        enum: ["automatic", "manual"],
        default: "automatic"
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Username must be unique when present.
// Sparse allows existing accounts to be migrated safely.
userSchema.index(
    { username: 1 },
    { unique: true, sparse: true }
);

// Always use the default Mongoose connection.
module.exports =
    mongoose.connection.models.User ||
    mongoose.model("User", userSchema);

