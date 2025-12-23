const mongoose = require('mongoose');

const SystemConfigSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, default: 'ai_instruction' },
    value: { type: String, required: true }
});

module.exports = mongoose.model('SystemConfig', SystemConfigSchema);