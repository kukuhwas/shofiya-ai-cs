const axios = require('axios');
require('dotenv').config();

const test = async () => {
    try {
        console.log("🔗 Menghubungi:", process.env.JUBELIO_ENGINE_URL);
        const res = await axios.get(`${process.env.JUBELIO_ENGINE_URL}/logs`); // Cek endpoint logs yang sudah ada
        console.log("✅ Berhasil terhubung! Status:", res.status);
    } catch (err) {
        console.error("❌ Gagal terhubung. Pastikan Jubelio Engine sudah RUNNING di port 3002.");
        console.error("Error:", err.message);
    }
};
test();