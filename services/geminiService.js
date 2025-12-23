// /var/www/shofiya-ai-cs/services/geminiService.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const toolHandler = require('../handlers/toolHandler');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * 🛠️ DEKLARASI TOOLS
 * Memberitahu Gemini fungsi apa saja yang tersedia untuk dia panggil.
 */
const tools = [
    {
        functionDeclarations: [
            {
                name: "searchInventory",
                description: "Mencari ketersediaan stok produk dan harga berdasarkan nama barang.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        keyword: {
                            type: "string",
                            description: "Nama atau jenis produk yang ditanyakan pelanggan (misal: Tunik, Adelia, Gamis)."
                        }
                    },
                    required: ["keyword"]
                }
            },
            {
                name: "findCustomerOrder",
                description: "Mengecek status pesanan, rincian item, dan nomor resi pengiriman pelanggan.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        phone: {
                            type: "string",
                            description: "Nomor telepon pelanggan untuk mencari data order."
                        }
                    },
                    required: ["phone"]
                }
            },
            {
                name: "validateOrder",
                description: "Memvalidasi stok dan harga akhir sebelum pelanggan membayar. Gunakan ID kelompok item dari hasil pencarian.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        itemGroupId: {
                            type: "string",
                            description: "ID kelompok item (item_group_id) yang didapat dari searchInventory."
                        },
                        quantity: {
                            type: "number",
                            description: "Jumlah barang yang ingin dipesan pelanggan."
                        }
                    },
                    required: ["itemGroupId", "quantity"]
                }
            }
        ]
    }
];

/**
 * 🤖 FUNGSI UTAMA GEMINI
 */
const getGeminiResponse = async (instruction, userMsg, phone, history = []) => {
    const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        systemInstruction: instruction,
        tools: tools
    });

    // Memulai chat dengan riwayat (history) yang ditarik dari MongoDB oleh Worker
    const chat = model.startChat({
        history: history
    });

    let result = await chat.sendMessage(userMsg);
    let response = result.response;

    // Loop ini memastikan Gemini menyelesaikan semua panggilan tool sampai tuntas
    let iterationLimit = 0;
    while (response.functionCalls() && response.functionCalls().length > 0 && iterationLimit < 5) {
        const calls = response.functionCalls();
        const functionResponses = [];

        for (const call of calls) {
            const { name, args } = call;
            console.log(`🎯 AI MEMANGGIL TOOL: ${name} | Args:`, args);

            let toolData;
            try {
                if (name === "searchInventory") {
                    toolData = await toolHandler.searchInventory(args.keyword);
                } else if (name === "findCustomerOrder") {
                    toolData = await toolHandler.findCustomerOrder(args.phone || phone);
                } else if (name === "validateOrder") {
                    toolData = await toolHandler.validateOrder(args.itemGroupId, args.quantity);
                }
            } catch (err) {
                console.error(`❌ Error executing tool ${name}:`, err.message);
                toolData = "Maaf, terjadi kendala saat mengakses data sistem.";
            }

            functionResponses.push({
                functionResponse: {
                    name: name,
                    response: { content: toolData }
                }
            });
        }

        // Kirim semua hasil tool kembali ke Gemini dalam satu waktu
        result = await chat.sendMessage(functionResponses);
        response = result.response;
        iterationLimit++;
    }

    return response.text();
};

module.exports = { getGeminiResponse };