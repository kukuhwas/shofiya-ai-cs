require('dotenv').config();
const express = require('express');
const { chatQueue } = require('./queues/chatQueue');
const SystemConfig = require('./models/SystemConfig');

const app = express();

/**
 * 🛠️ MIDDLEWARE CONFIGURATION
 * Mengatur limit payload agar tidak terjadi 'PayloadTooLargeError'
 * Sangat penting jika Webhook mengirimkan data besar atau metadata lengkap
 */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

/**
 * 🔒 KONFIGURASI WHITELIST
 */
const USE_WHITELIST = process.env.USE_WHITELIST === 'true';
const WHITELIST_RAW = process.env.WHITELIST_NUMBERS ? process.env.WHITELIST_NUMBERS.split(',') : [];
// Membersihkan spasi pada setiap nomor di whitelist
const WHITELIST = WHITELIST_RAW.map(num => num.trim());

/**
 * 📥 ENDPOINT WEBHOOK LISTENER (UNTUK WOOWA)
 * Endpoint ini menerima chat masuk dari pelanggan via server WooWa
 */
app.post('/webhook/wa-in', async (req, res) => {
    try {
        const b = req.body;

        // 1. FILTER DIRECTION (Sangat Penting: Mencegah Looping!)
        // Abaikan jika pesan berasal dari sistem kita sendiri (outgoing)
        if (b.direction === 'outgoing') {
            return res.status(200).send('Ignored: Outgoing message');
        }

        // 2. PENYESUAIAN FIELD SESUAI PAYLOAD WOOWA
        // Berdasarkan log: nomor ada di 'contact_name', nama ada di 'sender_name'
        const phone_no = String(b.contact_name || b.phone || b.phone_no || "").trim();
        const message = b.message ? String(b.message).trim() : "";
        const sender_name = b.sender_name || "Pelanggan";

        // 3. VALIDASI PESAN KOSONG
        // Abaikan jika tidak ada teks pesan (misalnya notifikasi sistem atau media tanpa caption)
        if (!message || message === "" || message === "undefined" || !phone_no) {
            return res.status(200).send('OK but Incomplete Data');
        }

        // 4. LOG MONITORING
        console.log(`📩 Pesan Masuk: [${sender_name}] ${phone_no}: ${message}`);

        // 5. FILTER WHITELIST
        if (USE_WHITELIST) {
            const cleanSender = phone_no.replace(/\D/g, '');
            const isWhitelisted = WHITELIST.some(num => {
                const cleanNum = num.replace(/\D/g, '').trim();
                return cleanNum !== "" && cleanSender.endsWith(cleanNum);
            });

            if (!isWhitelisted) {
                console.log(`[WHITELIST] Nomor ${cleanSender} tidak terdaftar. Pesan diabaikan.`);
                return res.status(200).send('Ignored: Not Whitelisted');
            }
        }

        // 6. MASUKKAN KE ANTREAN REDIS (PRODUCER)
        // Menambahkan 'job' ke antrean agar diproses oleh Worker secara asinkron
        await chatQueue.add('process-chat', {
            phone: phone_no,
            msg: message,
            name: sender_name
        }, {
            attempts: 3,        // Coba ulang 3x jika gagal (misal API Gemini limit)
            backoff: 5000,      // Jeda 5 detik tiap percobaan ulang
            removeOnComplete: true,
            removeOnFail: 1000
        });

        console.log(`[QUEUED] ✅ Berhasil masuk antrean untuk ${phone_no}`);

        // 7. RESPON OK KE WOOWA (Wajib agar Webhook dianggap berhasil)
        res.status(200).send('OK');

    } catch (err) {
        console.error("❌ Webhook Error:", err.message);
        // Tetap kirim respon agar server pengirim tidak terus-menerus retrying
        res.status(500).send('Internal Server Error');
    }
});

/**
 * 🚀 JALANKAN SERVER
 */
const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
    console.log(`
    --------------------------------------------------
    🚀 Shofiya AI-CS Listener Online (v2.0)
    📍 Port     : ${PORT}
    🔒 Whitelist: ${USE_WHITELIST ? 'AKTIF' : 'NON-AKTIF'}
    📦 Payload  : Limit 10MB (Safe Mode)
    --------------------------------------------------
    `);
});

// Render Halaman Settings
app.get('/settings', async (req, res) => {
    let config = await SystemConfig.findOne({ key: 'ai_instruction' });
    // Jika belum ada di DB, buatkan defaultnya
    if (!config) {
        config = await SystemConfig.create({
            key: 'ai_instruction',
            value: 'Kamu adalah Kak Shofiya...'
        });
    }
    res.render('dashboard', { page: 'settings', aiInstruction: config.value });
});

// Handle Update Instruction
app.post('/settings/ai-instruction', async (req, res) => {
    const { instruction } = req.body;
    await SystemConfig.findOneAndUpdate(
        { key: 'ai_instruction' },
        { value: instruction },
        { upsert: true }
    );
    res.redirect('/settings?status=success');
});