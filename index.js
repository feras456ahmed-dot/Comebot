const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const express = require("express");

// --- 1. سيرفر الويب لضمان بقاء البوت يعمل 24/7 على Render ---
const app = express();
const port = process.env.PORT || 8000;
app.get("/", (req, res) => res.status(200).send("🛡️ Sparta Bot is Online!"));
app.listen(port, () => console.log(`✅ Server running on port: ${port}`));

// --- 2. تشغيل البوت ---
async function startSpartaBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // بما أنك ربطت الرقم سابقاً
        browser: ["Sparta System", "Safari", "3.0.0"]
    });

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startSpartaBot();
        } else if (connection === "open") {
            console.log("✅ تم الاتصال بنجاح بنظام سبارتا");
        }
    });

    sock.ev.on("creds.update", saveCreds);

    // --- 3. معالجة الرسائل للرد على ".بوت" ---
    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const remoteJid = msg.key.remoteJid;
        // استخراج النص من الرسالة
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();

        // الرد إذا كتب الشخص ".بوت" بالضبط
        if (text === ".بوت") {
            
            // تعريف كارت الشخصية (VCard) برقمك
            const vcard = 'BEGIN:VCARD\n'
                + 'VERSION:3.0\n'
                + 'FN:Abu Al-Baraa 🛡️\n'
                + 'ORG:Sparta System;\n'
                + 'TEL;type=CELL;type=VOICE;waid=4915510974213:+49 15510 974213\n'
                + 'END:VCARD';

            // إرسال الرسالة الترحيبية
            await sock.sendMessage(remoteJid, { 
                text: "أهلاً بك في نظام سبارتا الملكي 🛡️\nأنا بوت المساعدة الخاص بـ أبو البراء.\n\nيمكنك التواصل مع المطور مباشرة عبر جهة الاتصال أدناه:" 
            }, { quoted: msg });

            // إرسال كارت الاتصال
            await sock.sendMessage(remoteJid, {
                contacts: {
                    displayName: 'أبو البراء',
                    contacts: [{ vcard }]
                }
            });
        }
    });
}

startSpartaBot();

