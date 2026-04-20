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

// --- 1. إعداد سيرفر الويب للبقاء متصلاً 24/7 على Render ---
const app = express();
const port = process.env.PORT || 8000;
app.get("/", (req, res) => res.send("🛡️ Sparta Bot System is Live!"));
app.listen(port, () => console.log(`✅ Web Server running on port: ${port}`));

async function startSpartaBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        printQRInTerminal: false, // تعطيل QR لاستخدام كود الربط
        logger: pino({ level: "fatal" }),
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    // --- 2. نظام الربط بالرقم (Pairing Code) ---
    if (!sock.authState.creds.registered) {
        const phoneNumber = "4915510974213"; // رقمك الألماني المعتمد
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

    // --- 3. معالجة الأوامر ---
    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const remoteJid = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();

        // أمر الرد بجهة الاتصال
        if (text === ".بوت" || text === "بوت") {
            const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:Abu Al-Baraa 🛡️\nORG:Sparta System;\nTEL;type=CELL;type=VOICE;waid=4915510974213:+49 15510 974213\nEND:VCARD';
            
            await sock.sendMessage(remoteJid, { 
                text: "أهلاً بك في نظام سبارتا الملكي 🛡️\nأنا بوت المساعدة الخاص بـ أبو البراء.\n\nيمكنك التواصل مع المطور مباشرة عبر جهة الاتصال أدناه:" 
            }, { quoted: msg });

            await sock.sendMessage(remoteJid, {
                contacts: { displayName: 'أبو البراء', contacts: [{ vcard }] }
            });
        }

        // أمر الحصول على آيدي واسم الجروب (تطوير سبارتا)
        if (text === ".ايدي وأسم القروب") {
            if (!remoteJid.endsWith('@g.us')) {
                return await sock.sendMessage(remoteJid, { text: "❌ هذا الأمر يعمل داخل المجموعات فقط!" }, { quoted: msg });
            }

            try {
                const groupMetadata = await sock.groupMetadata(remoteJid);
                const groupName = groupMetadata.subject;
                const groupId = remoteJid;

                await sock.sendMessage(remoteJid, { 
                    text: `🛡️ ايدي قروب (${groupName}) هو :\n\n${groupId}` 
                }, { quoted: msg });
            } catch (err) {
                console.error(err);
            }
        }
    });
}

// تشغيل النظام
startSpartaBot();
