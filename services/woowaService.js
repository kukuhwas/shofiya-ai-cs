// /var/www/shofiya-ai-cs/services/woowaService.js
const axios = require('axios');

const sendWA = async (phone, text) => {
    try {
        const response = await axios.post('https://notifapi.com/send_message', {
            phone_no: phone,
            key: process.env.WOOWA_KEY,
            message: text
        });
        return response.data;
    } catch (err) {
        console.error("WooWa API Error:", err.message);
        throw err;
    }
};

module.exports = { sendWA };