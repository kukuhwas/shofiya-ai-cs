// /var/www/shofiya-ai-cs/workers/chatWorker.js
require('dotenv').config();
const mongoose = require('mongoose'); // Tambahkan ini
const { Worker } = require('bullmq');
const { connection } = require('../queues/chatQueue');
const { getGeminiResponse } = require('../services/geminiService');
const { sendWA } = require('../services/woowaService');
const SystemConfig = require('../models/SystemConfig');

/**
 * 🗄️ KONEKSI DATABASE MONGODB
 * Worker butuh koneksi sendiri untuk mengakses data Jubelio melalui toolHandler
 */
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shofiya';

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Worker: Terhubung ke MongoDB"))
    .catch(err => {
        console.error("❌ Worker: Gagal Koneksi MongoDB", err.message);
        process.exit(1); // Matikan worker jika DB tidak bisa diakses
    });

/**
 * 👷 INISIALISASI WORKER
 */
const chatWorker = new Worker('chatQueue', async (job) => {
    const { phone, msg, name } = job.data;
    console.log(`[WORKER] Memproses pesan dari ${name} (${phone})`);

    try {
        // AMBIL INSTRUKSI DARI DATABASE
        const config = await SystemConfig.findOne({ key: 'ai_instruction' });

        // Jika di DB belum ada, gunakan fallback (cadangan) teks manual
        const dynamicInstruction = config ? config.value : "Kamu adalah Kak Shofiya...";

        // Gunakan dynamicInstruction saat panggil Gemini
        const aiResponse = await getGeminiResponse(dynamicInstruction, msg, phone, formattedHistory);

        // 3. Kirim hasil akhir ke WhatsApp
        if (aiResponse) {
            await sendWA(phone, aiResponse);
            console.log(`[WORKER] ✅ Sukses membalas ${phone}`);
        } else {
            console.warn(`[WORKER] Gemini tidak memberikan respon untuk ${phone}`);
        }

    } catch (err) {
        // Jika error karena Database/Gemini, job akan masuk antrean Retry
        console.error(`[WORKER] ❌ Gagal memproses job ${job.id}:`, err.message);
        throw err;
    }
}, {
    connection,
    concurrency: 5,
    // Tambahkan pengaturan agar job tidak nyangkut selamanya
    lockDuration: 30000
});

/**
 * 📢 MONITORING EVENT
 */
chatWorker.on('failed', (job, err) => {
    console.error(`[WORKER] Job ${job.id} gagal total: ${err.message}`);
});

chatWorker.on('completed', (job) => {
    console.log(`[WORKER] Job ${job.id} selesai dikerjakan.`);
});

console.log("👷 Chat Worker Shofiya AI aktif dan siap memproses antrean...");