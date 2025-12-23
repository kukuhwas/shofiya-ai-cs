const mongoose = require('mongoose');

const ChatLogSchema = new mongoose.Schema({
    phone: { type: String, required: true, index: true }, //
    role: { type: String, enum: ['user', 'model'], required: true }, //
    message: { type: String },
    name: { type: String },

    // Metadata Media Baru
    media: {
        exists: { type: Boolean, default: false },
        type: { type: String, enum: ['image', 'document', 'audio', 'video', 'none'], default: 'none' },
        url: { type: String },       // Path akses: /media/filename.jpg
        filename: { type: String },
        mimeType: { type: String },
        fileSize: { type: Number }
    },

    timestamp: { type: Date, default: Date.now } //
});

module.exports = mongoose.model('ChatLog', ChatLogSchema);