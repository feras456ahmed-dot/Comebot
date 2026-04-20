const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    jidDecode
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const express = require("express");
const pino = require("pino");
const fs = require("fs");

// --- 1. إعداد لوحة المراقبة ---
const app = express();
let lastError = "النظام مستقر 🛡️";
app.get("/", (req, res) => {
    res.send(`<body style="background:#000;color:#f00;text-align:center;padding-top:50px;font-family:sans-serif;"><h1>🛡️ Sparta Dashboard</h1><p style="color:#0f0;">Status: Online</p><div style="border:1px dashed #444;padding:20px;margin:20px;">${lastError}</div></body>`);
});
app.listen(process.env.PORT || 8000);

// --- 2. إدارة البيانات ---
let data = { elite: ["967730263509@s.whatsapp.net"], warnings: {} };
if (fs.existsSync('sparta_data.json')) {
    try { data = JSON.parse(fs.readFileSync('sparta_data.json')); } catch (e) {}
}
const saveData = () => fs.writeFileSync('sparta_data.json', JSON.stringify(data));

const decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
        let decode = jidDecode(jid) || {};
        return decode.user && decode.server && decode.user + '@' + decode.server || jid;
    }
    return jid;
};

// --- 3. تشغيل البوت ---
async function startSpartaBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }),
        browser: ["Sparta Elite", "Chrome", "20.0.04"]
    });

    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startSpartaBot();
        }
    });

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        // 🛡️ القاعدة الذهبية: إذا كانت الرسالة "من البوت نفسه" يتجاهلها فوراً (نفي العلة)
        if (msg.key.fromMe) return;

        const remoteJid = msg.key.remoteJid;
        const sender = msg.key.participant || remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();

        // --- أمر الانضمام للنخبة بالولاء ---
        if (text === "ارجوك اضفني للنخبة يا سيدي") {
            if (!data.elite.includes(sender)) {
                data.elite.push(sender);
                saveData();
                return sock.sendMessage(remoteJid, { text: `🛡️ قُبل ولاؤك. تم منحك صلاحيات النخبة في نظام سبارتا.` }, { quoted: msg });
            } else {
                return sock.sendMessage(remoteJid, { text: `🛡️ أنت بالفعل من النخبة يا جندي.` }, { quoted: msg });
            }
        }

        // --- فحص الصلاحيات للأوامر الأخرى ---
        const isDeveloper = sender.includes("967730263509");
        const isElite = data.elite.includes(sender) || isDeveloper;

        if (!text.startsWith(".")) return;

        if (isElite && remoteJid.endsWith('@g.us')) {
            const quotedMsg = msg.message.extendedTextMessage?.contextInfo;
            if (text === ".ثبت" && quotedMsg?.stanzaId) {
                await sock.relayMessage(remoteJid, { pinInChatMsg: { key: { remoteJid, fromMe: false, id: quotedMsg.stanzaId, participant: quotedMsg.participant }, type: 1, duration: 2592000 } }, {});
            }
            if (text === ".احذف" && quotedMsg?.stanzaId) {
                await sock.sendMessage(remoteJid, { delete: { remoteJid, fromMe: false, id: quotedMsg.stanzaId, participant: quotedMsg.participant } });
            }
        }

        if (text === ".بوت") {
            await sock.sendMessage(remoteJid, { text: "🛡️ نظام سبارتا الملكي مستقر وجاهز." }, { quoted: msg });
        }
    });
}

process.on('uncaughtException', (err) => {
    lastError = `خطأ: ${err.message}`;
    console.error(err);
});

startSpartaBot();

