const express = require('express');
const app = express();

// Naikkan limit ke 50MB agar PDF besar bisa masuk
app.use(express.json({ limit: '50mb' }));

app.post('/webhook/wa-in', (req, res) => {
    console.log("==========================================");
    console.log("📩 RAW PAYLOAD RECEIVED AT:", new Date().toISOString());
    console.log("------------------------------------------");

    // Kita cek tipenya dulu
    const type = req.body.message_type || 'unknown';
    const hasMedia = req.body.media && req.body.media !== "none";

    console.log(`Type: ${type} | Media: ${hasMedia ? 'YES (Base64)' : 'NO'}`);

    // Jangan print seluruh Base64 jika terlalu panjang, cukup 50 karakter awal
    const bodyCopy = { ...req.body };
    if (bodyCopy.media && bodyCopy.media.length > 50) {
        bodyCopy.media = bodyCopy.media.substring(0, 50) + "...[TRUNCATED]";
    }

    console.log(JSON.stringify(bodyCopy, null, 2));
    console.log("==========================================\n");

    res.status(200).send("RAW_RECEIVED");
});

const PORT = 3004;
app.listen(PORT, () => {
    console.log(`🕵️ Inspector Shofiya (Higher Limit) aktif di port ${PORT}`);
});