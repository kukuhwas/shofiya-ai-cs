require('dotenv').config();
const mongoose = require('mongoose');
const { Worker } = require('bullmq');
const { connection } = require('../queues/chatQueue');
const { getGeminiResponse } = require('../services/geminiService');
const { sendWA } = require('../services/woowaService');
const SystemConfig = require('../models/SystemConfig');
const ChatLog = require('../models/ChatLog');

/**
 * 🗄️ KONEKSI DATABASE MONGODB
 */
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shofiya';
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Worker: Terhubung ke MongoDB"))
    .catch(err => {
        console.error("❌ Worker: Gagal Koneksi MongoDB", err.message);
        process.exit(1);
    });

/**
 * 👷 INISIALISASI WORKER
 */
const chatWorker = new Worker('chatQueue', async (job) => {
    const { phone, msg, name, mediaUrl, mediaType } = job.data;
    console.log(`[WORKER] Memproses pesan dari ${name} (${phone})`);

    try {
        let mediaData = { exists: false, type: 'none' };

        // 1. HANDLE MEDIA METADATA
        // mediaUrl sekarang berisi path lokal (contoh: /media/wa_628xxx.jpg) yang dikirim dari app.js
        if (mediaUrl) {
            console.log(`[WORKER] Mencatat metadata media: ${mediaUrl}`);
            mediaData = {
                exists: true,
                type: mediaType === 'document' ? 'document' : 'image',
                url: mediaUrl,
                filename: mediaUrl.split('/').pop(),
                mimeType: mediaType === 'document' ? 'application/pdf' : 'image/jpeg',
                fileSize: 0 // Ukuran sudah ditangani saat penulisan file di app.js
            };
        }

        // 2. SIMPAN LOG PESAN USER KE DATABASE
        // Jika pesan teks kosong (user hanya kirim gambar), beri keterangan role user
        const userDisplayMsg = msg || `[Sent ${mediaData.type}]`;

        await ChatLog.create({
            phone,
            role: 'user',
            message: userDisplayMsg,
            name: name,
            media: mediaData
        });

        // 3. AMBIL RIWAYAT PERCAKAPAN (History 10 pesan terakhir)
        const historyLogs = await ChatLog.find({ phone })
            .sort({ timestamp: -1 })
            .limit(10);

        // Memformat history agar sesuai dengan struktur Content Gemini SDK
        const formattedHistory = historyLogs.reverse().map(log => ({
            role: log.role === 'user' ? 'user' : 'model',
            parts: [{ text: log.message || "" }]
        }));

        // 4. AMBIL INSTRUKSI AI DARI DB
        const config = await SystemConfig.findOne({ key: 'ai_instruction' });
        const dynamicInstruction = config ? config.value : "Kamu adalah Kak Shofiya, CS ramah dari Shofiya Fashion...";

        // 5. PANGGIL GEMINI (Kirim instruksi, pesan saat ini, dan riwayat)
        const aiResponse = await getGeminiResponse(dynamicInstruction, userDisplayMsg, phone, formattedHistory);

        // 6. SIMPAN RESPON AI & KIRIM KE WHATSAPP
        if (aiResponse) {
            // Simpan log balasan AI ke database
            await ChatLog.create({
                phone,
                role: 'model',
                message: aiResponse,
                name: 'Kak Shofiya',
                media: { exists: false, type: 'none' }
            });

            // Kirim balasan ke WhatsApp via WooWa Service
            await sendWA(phone, aiResponse);
            console.log(`[WORKER] ✅ Berhasil merespons ${phone}`);
        } else {
            console.warn(`[WORKER] Gemini tidak memberikan respon untuk ${phone}`);
        }

    } catch (err) {
        console.error(`[WORKER] ❌ Gagal memproses job ${job.id}:`, err.message);
        throw err; // BullMQ akan mencoba ulang (retry) sesuai konfigurasi backoff
    }
}, {
    connection,
    concurrency: 5, // Maksimal 5 pemrosesan paralel untuk menjaga stabilitas memori
    lockDuration: 30000
});

/**
 * 📢 MONITORING EVENT
 */
chatWorker.on('failed', (job, err) => {
    console.error(`[WORKER] Job ${job.id} gagal total: ${err.message}`);
});

chatWorker.on('completed', (job) => {
    console.log(`[WORKER] Job ${job.id} selesai diproses.`);
});

console.log("👷 Chat Worker Shofiya AI aktif (Storage & History Sinkron)...");