require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { chatQueue } = require('./queues/chatQueue');
const SystemConfig = require('./models/SystemConfig');

const app = express();

/**
 * 🛠️ MIDDLEWARE CONFIGURATION
 * Limit dinaikkan ke 50mb untuk menampung file PDF/Gambar dalam format Base64
 */
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

/**
 * 🔒 KONFIGURASI WHITELIST
 */
const USE_WHITELIST = process.env.USE_WHITELIST === 'true';
const WHITELIST_RAW = process.env.WHITELIST_NUMBERS ? process.env.WHITELIST_NUMBERS.split(',') : [];
const WHITELIST = WHITELIST_RAW.map(num => num.trim());

/**
 * 📥 ENDPOINT WEBHOOK LISTENER (UNTUK WOOWA)
 */
app.post('/webhook/wa-in', async (req, res) => {
    try {
        const b = req.body;

        // 1. FILTER DIRECTION (Mencegah Looping)
        if (b.direction === 'outgoing') {
            return res.status(200).send('Ignored: Outgoing message');
        }

        // 2. MEMBERSIHKAN NOMOR TELEPON (Menangani format grup @g.us)
        let rawPhone = String(b.contact_name || b.phone || b.phone_no || "").trim();
        const phone_no = rawPhone.split('@')[0].split('-')[0].replace(/\D/g, '');

        const message = b.message ? String(b.message).trim() : "";
        const sender_name = b.sender_name || "Pelanggan";

        // 3. HANDLE MEDIA BASE64 (Hasil temuan Inspector)
        let mediaUrl = null;
        let mediaType = 'text';

        if (b.media && b.media !== "none") {
            // Deteksi Ekstensi berdasarkan Magic Number Base64
            let extension = 'bin';
            if (b.media.startsWith('/9j/4')) {
                extension = 'jpg';
                mediaType = 'image';
            } else if (b.media.startsWith('JVBERi')) {
                extension = 'pdf';
                mediaType = 'document';
            } else if (b.media.startsWith('iVBORw')) {
                extension = 'png';
                mediaType = 'image';
            }

            const filename = `wa_${phone_no}_${uuidv4()}.${extension}`;
            const storagePath = '/var/www/shofiya-media';
            const localPath = path.join(storagePath, filename);

            // Pastikan folder tersedia
            if (!fs.existsSync(storagePath)) {
                fs.mkdirSync(storagePath, { recursive: true });
            }

            // Simpan Base64 ke File fisik
            fs.writeFileSync(localPath, b.media, { encoding: 'base64' });

            // Path URL untuk diakses Nginx/Dashboard
            mediaUrl = `/media/${filename}`;
            console.log(`📸 Media Tersimpan: ${filename} (${mediaType})`);
        }

        // 4. LOG MONITORING
        console.log(`📩 Masuk: [${sender_name}] ${phone_no} | Msg: ${message || `[${mediaType}]`}`);

        // 5. VALIDASI DATA MINIMAL
        if (!message && !mediaUrl) {
            return res.status(200).send('OK but Incomplete Data');
        }

        // 6. FILTER WHITELIST
        if (USE_WHITELIST) {
            const isWhitelisted = WHITELIST.some(num => {
                const cleanNum = num.replace(/\D/g, '').trim();
                return cleanNum !== "" && phone_no.endsWith(cleanNum);
            });

            if (!isWhitelisted) {
                if (!rawPhone.includes('@g.us')) {
                    console.log(`[WHITELIST] Nomor ${phone_no} diabaikan.`);
                }
                return res.status(200).send('Ignored: Not Whitelisted');
            }
        }

        // 7. MASUKKAN KE ANTREAN REDIS
        await chatQueue.add('process-chat', {
            phone: phone_no,
            msg: message,
            name: sender_name,
            mediaUrl: mediaUrl,   // Sekarang berisi path lokal /media/wa_xxx.ext
            mediaType: mediaType
        }, {
            attempts: 3,
            backoff: 5000,
            removeOnComplete: true,
            removeOnFail: 1000
        });

        console.log(`[QUEUED] ✅ Masuk antrean: ${phone_no}`);
        res.status(200).send('OK');

    } catch (err) {
        console.error("❌ Webhook Error:", err.message);
        res.status(500).send('Internal Server Error');
    }
});

/**
 * 🚀 JALANKAN SERVER
 */
const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
    console.log(`📡 Shofiya AI-CS Listener (v2.1 - Base64 Support) Online di Port ${PORT}`);
});

// Render Settings
app.get('/settings', async (req, res) => {
    let config = await SystemConfig.findOne({ key: 'ai_instruction' });
    if (!config) {
        config = await SystemConfig.create({ key: 'ai_instruction', value: 'Kamu adalah Kak Shofiya...' });
    }
    res.render('dashboard', { page: 'settings', aiInstruction: config.value });
});

app.post('/settings/ai-instruction', async (req, res) => {
    const { instruction } = req.body;
    await SystemConfig.findOneAndUpdate({ key: 'ai_instruction' }, { value: instruction }, { upsert: true });
    res.redirect('/settings?status=success');
});