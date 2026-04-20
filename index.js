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

// --- 1. إعداد لوحة المراقبة (Dashboard) ---
const app = express();
let lastError = "النظام مستقر ويعمل بنجاح 🛡️";

app.get("/", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Sparta Dashboard</title>
            <style>
                body { background: #0a0a0a; color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .card { background: #1a1a1a; padding: 25px; border-radius: 15px; border: 1px solid #ff0000; box-shadow: 0 0 25px rgba(255,0,0,0.3); width: 90%; max-width: 500px; text-align: center; }
                h1 { color: #ff0000; text-shadow: 0 0 10px #ff0000; }
                .error-box { background: #000; color: #ff4444; padding: 15px; border-radius: 8px; font-family: monospace; text-align: left; overflow-x: auto; border: 1px dashed #444; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>🛡️ نظام سبارتا</h1>
                <div style="color:#0f0; margin-bottom:15px;">الحالة: متصل ✅</div>
                <div class="error-box">${lastError}</div>
            </div>
        </body>
        </html>
    `);
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

        const remoteJid = msg.key.remoteJid;
        const sender = msg.key.fromMe ? decodeJid(sock.user.id) : (msg.key.participant || remoteJid);
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();

        // 🛡️ الفلتر الصارم: إذا لم تبدأ الرسالة بـ "." سيتم تجاهلها فوراً
        if (!text.startsWith(".")) return;

        // حماية إضافية: لا يرد على نفسه إذا كان النص يحتوي على شعار البوت (لمنع التكرار)
        if (msg.key.fromMe && text.includes("🛡️")) return;

        const isDeveloper = sender.includes("967730263509") || sender.includes(decodeJid(sock.user.id));
        const isElite = data.elite.includes(sender) || isDeveloper;

        const quotedMsg = msg.message.extendedTextMessage?.contextInfo;
        const stanzaId = quotedMsg?.stanzaId;
        const quotedSender = quotedMsg?.participant;
        const mentioned = quotedMsg?.mentionedJid?.[0] || quotedSender;

        // --- الأوامر المتاحة الآن (يجب أن تبدأ بـ .) ---
        
        if (isDeveloper && text.startsWith(".أضف نخبة")) {
            let target = mentioned || text.split(" ")[2] + "@s.whatsapp.net";
            if (!data.elite.includes(target)) {
                data.elite.push(target);
                saveData();
                return sock.sendMessage(remoteJid, { text: `🛡️ تمت إضافة @${target.split('@')[0]} للنخبة.`, mentions: [target] });
            }
        }

        if (isElite && remoteJid.endsWith('@g.us')) {
            if (text === ".ثبت" && stanzaId) {
                await sock.relayMessage(remoteJid, { pinInChatMsg: { key: { remoteJid, fromMe: false, id: stanzaId, participant: quotedSender }, type: 1, duration: 2592000 } }, {});
            }
            if (text === ".احذف" && stanzaId) {
                await sock.sendMessage(remoteJid, { delete: { remoteJid, fromMe: false, id: stanzaId, participant: quotedSender } });
            }
            if (text.startsWith(".طرد") && mentioned) {
                await sock.groupParticipantsUpdate(remoteJid, [mentioned], "remove");
            }
        }

        if (text === ".بوت") {
            await sock.sendMessage(remoteJid, { text: "🛡️ نظام سبارتا الملكي نشط وجاهز للأوامر." }, { quoted: msg });
        }

        if (text === ".ايدي") {
            await sock.sendMessage(remoteJid, { text: `🛡️ معرف المجموعة: ${remoteJid}` }, { quoted: msg });
        }
    });
}

process.on('uncaughtException', (err) => {
    lastError = `خطأ: ${err.message}`;
    console.error(err);
});

startSpartaBot();

