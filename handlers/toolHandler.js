require('dotenv').config();
const axios = require('axios');

/**
 * 🛠️ CONFIGURATION
 * Mengambil base URL dari .env agar tidak hardcode.
 * Contoh di .env: JUBELIO_ENGINE_URL=http://localhost:3002/jubelio-api
 */
const JUBELIO_API_BASE = process.env.JUBELIO_ENGINE_URL || 'http://localhost:3002/jubelio-api';

// Membuat instance axios agar lebih rapi dan memiliki timeout
const api = axios.create({
    baseURL: JUBELIO_API_BASE,
    timeout: 8000 // Menunggu maksimal 8 detik
});

const toolHandler = {
    /**
     * Mencari pesanan terakhir berdasarkan nomor telepon atau nomor order
     * Mengonsumsi endpoint: GET /orders/status
     */
    findCustomerOrder: async (searchQuery) => {
        try {
            console.log(`🔗 API Call: Mengambil status order untuk [${searchQuery}]`);

            const response = await api.get('/orders/status', {
                params: { search: searchQuery }
            });

            const order = response.data;

            return {
                order_no: order.order_no,
                status: order.order_status,
                total: order.total_amount,
                resi: order.tracking_number || "Sedang diproses/belum diinput",
                items: order.items && order.items.length > 0
                    ? order.items.map(i => `${i.item_name} (x${i.qty})`).join(', ')
                    : "Tidak ada rincian produk",
                last_update: order.last_update
            };
        } catch (err) {
            if (err.response && err.response.status === 404) {
                return "Maaf, pesanan dengan nomor tersebut tidak ditemukan di sistem kami.";
            }
            console.error("❌ API Tool Error (findCustomerOrder):", err.message);
            return "Terjadi kendala saat menghubungi sistem pusat. Mohon coba beberapa saat lagi.";
        }
    },

    /**
     * Mencari produk berdasarkan kata kunci stok
     * Mengonsumsi endpoint: GET /products/search
     */
    searchInventory: async (keyword) => {
        try {
            if (!keyword || keyword.length < 2) return "Kata kunci terlalu pendek.";

            console.log(`🔗 API Call: Mencari stok untuk [${keyword}]`);

            const response = await api.get('/products/search', {
                params: { q: keyword }
            });

            const products = response.data;

            if (products.length === 0) {
                return `Produk dengan kata kunci "${keyword}" tidak ditemukan.`;
            }

            return products.map(p => ({
                nama: p.item_name,
                harga: p.sell_price || p.price, // Gunakan sell_price hasil inspeksi tadi
                total_stok: p.variants ? p.variants.reduce((acc, curr) => acc + (curr.stok || 0), 0) : 0, // Kalkulasi stok dari varian
                item_group_id: p.item_group_id,
                sku_detail: p.variants ? p.variants.map(v => `${v.color_size}: ${v.stok}`).join(', ') : ""
            }));
        } catch (err) {
            console.error("❌ API Tool Error (searchInventory):", err.message);
            return "Gagal mencari data produk karena kendala komunikasi API.";
        }
    },

    /**
     * 🛡️ TOOL BARU: VALIDASI PESANAN (Double-Check Tahap 1)
     * Mengonsumsi endpoint: POST /orders/validate
     */
    validateOrder: async (itemGroupId, quantity) => {
        try {
            console.log(`🔗 API Call: Validasi stok untuk ID ${itemGroupId} Qty ${quantity}`);

            const response = await api.post('/orders/validate', {
                items: [{ item_group_id: itemGroupId, qty: parseInt(quantity) }]
            });

            const result = response.data;

            if (result.valid) {
                const detail = result.summary[0];
                return {
                    success: true,
                    message: `Stok tersedia! ✅\n\n*Ringkasan Pesanan:*\n- Produk: ${detail.item_name}\n- Jumlah: ${detail.qty}\n- Total: Rp ${result.total_price.toLocaleString('id-ID')}\n\nApakah datanya sudah benar? Ketik *YA* untuk memproses pesanan.`
                };
            } else {
                return {
                    success: false,
                    message: `Waduh, maaf Kak. ${result.message}`
                };
            }
        } catch (err) {
            console.error("❌ API Tool Error (validateOrder):", err.message);
            return { success: false, message: "Gagal memproses validasi stok." };
        }
    }
};

module.exports = toolHandler;