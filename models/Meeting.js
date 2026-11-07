const mongoose = require("mongoose");

const meetingSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
        unique: true
    },

    hostId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    roomName: {
        type: String,
        required: true
    },

    isLocked: {
        type: Boolean,
        default: false
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Meeting", meetingSchema);