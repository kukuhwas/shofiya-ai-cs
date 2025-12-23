const mongoose = require('mongoose');

const ChatLogSchema = new mongoose.Schema({
    phone: { type: String, required: true, index: true }, // Index agar pencarian history cepat
    role: { type: String, enum: ['user', 'model'], required: true },
    message: { type: String, required: true },
    name: { type: String },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ChatLog', ChatLogSchema);