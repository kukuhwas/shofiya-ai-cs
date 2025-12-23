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
            }
        ]
    }
];

const getGeminiResponse = async (instruction, userMsg, phone) => {
    const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        systemInstruction: instruction,
        tools: tools
    });

    const chat = model.startChat();
    let result = await chat.sendMessage(userMsg);
    let response = result.response;

    // Loop ini memastikan Gemini menyelesaikan semua panggil alat sampai tuntas
    while (response.functionCalls() && response.functionCalls().length > 0) {
        const calls = response.functionCalls();
        const functionResponses = [];

        for (const call of calls) {
            const { name, args } = call;
            console.log(`🎯 AI MEMANGGIL TOOL: ${name} | Args:`, args);

            let toolData;
            if (name === "searchInventory") {
                toolData = await toolHandler.searchInventory(args.keyword);
            } else if (name === "findCustomerOrder") {
                toolData = await toolHandler.findCustomerOrder(args.phone || phone);
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
    }

    return response.text();
};
module.exports = { getGeminiResponse };