const fs = require('fs');
const axios = require('axios');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const STORAGE_PATH = '/var/www/shofiya-media';

// Pastikan direktori ada
if (!fs.existsSync(STORAGE_PATH)) {
    fs.mkdirSync(STORAGE_PATH, { recursive: true });
}

async function downloadIncomingMedia(url, phone) {
    try {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            timeout: 15000
        });

        const mimeType = response.headers['content-type'] || 'application/octet-stream';
        const ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';
        const filename = `${phone}_${uuidv4()}.${ext}`;
        const localPath = path.join(STORAGE_PATH, filename);

        const writer = fs.createWriteStream(localPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve({
                success: true,
                url: `/media/${filename}`,
                filename: filename,
                mimeType: mimeType,
                fileSize: parseInt(response.headers['content-length'] || 0)
            }));
            writer.on('error', reject);
        });
    } catch (err) {
        console.error(`❌ Download Error [${phone}]:`, err.message);
        return { success: false, error: err.message };
    }
}

module.exports = { downloadIncomingMedia };