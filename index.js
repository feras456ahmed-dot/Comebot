const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const express = require("express");
const pino = require("pino");
const readline = require("readline");

// --- 1. سيرفر الويب لضمان العمل 24/7 ---
const app = express();
app.get("/", (req, res) => res.send("🛡️ Sparta Bot is Online with Pairing Code!"));
app.listen(process.env.PORT || 8000);

// إعداد واجهة إدخال الرقم في التيرمنال
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function startSpartaBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        printQRInTerminal: false, // تعطيل الـ QR
        logger: pino({ level: "fatal" }),
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    // --- منطق كود الربط ---
    if (!sock.authState.creds.registered) {
        const phoneNumber = "4915510974213"; // رقمك جاهز هنا
        setTimeout(async () => {
            let code = await sock.requestPairingCode(phoneNumber);
            code = code?.match(/.{1,4}/g)?.join("-") || code;
            console.log(`\n\n============= SPARTA SYSTEM =============\n`);
            console.log(`🔗 كود الربط الخاص بك هو: ${code}`);
            console.log(`\n=========================================\n`);
        }, 3000);
    }

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startSpartaBot();
        } else if (connection === "open") {
            console.log("✅ حقق! البوت متصل الآن بنظام سبارتا.");
        }
    });

    sock.ev.on("creds.update", saveCreds);

    // --- الرد على .بوت ---
    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();

        if (text === ".بوت") {
            const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:Abu Al-Baraa 🛡️\nTEL;type=CELL;type=VOICE;waid=4915510974213:+49 15510 974213\nEND:VCARD';
            await sock.sendMessage(msg.key.remoteJid, { text: "أهلاً بك في نظام سبارتا الملكي 🛡️" }, { quoted: msg });
            await sock.sendMessage(msg.key.remoteJid, { contacts: { displayName: 'أبو البراء', contacts: [{ vcard }] } });
        }
    });
}

startSpartaBot();

