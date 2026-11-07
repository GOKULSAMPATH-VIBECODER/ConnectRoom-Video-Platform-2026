const mongoose = require("mongoose");

const participantSchema = new mongoose.Schema({
    meetingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Meeting",
        required: true
    },

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    joinedAt: {
        type: Date,
        default: Date.now
    },

    leftAt: {
        type: Date,
        default: null
    }
});

module.exports = mongoose.model("Participant", participantSchema);