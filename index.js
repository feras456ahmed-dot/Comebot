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
                h1 { color: #ff0000; text-shadow: 0 0 10px #ff0000; margin-bottom: 5px; }
                .status { margin-bottom: 20px; color: #00ff00; font-size: 14px; }
                .error-box { background: #000; color: #ff4444; padding: 15px; border-radius: 8px; font-family: monospace; text-align: left; overflow-x: auto; border: 1px dashed #444; max-height: 200px; font-size: 12px; }
                .copy-btn { margin-top: 15px; background: #ff0000; color: #fff; border: none; padding: 12px 20px; border-radius: 5px; cursor: pointer; font-weight: bold; width: 100%; transition: 0.3s; }
                .copy-btn:hover { background: #aa0000; transform: scale(1.02); }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>🛡️ نظام سبارتا</h1>
                <div class="status">الحالة: متصل ✅</div>
                <div class="error-box" id="errorCode">${lastError}</div>
                <button class="copy-btn" onclick="copyError()">نسخ تقرير الحالة / الخطأ</button>
            </div>
            <script>
                function copyError() {
                    const text = document.getElementById('errorCode').innerText;
                    navigator.clipboard.writeText(text);
                    alert('تم نسخ النص بنجاح!');
                }
            </script>
        </body>
        </html>
    `);
});
app.listen(process.env.PORT || 8000);

// --- 2. إدارة البيانات والصلاحيات ---
let data = { elite: ["967730263509@s.whatsapp.net"], warnings: {} };
if (fs.existsSync('sparta_data.json')) {
    try { data = JSON.parse(fs.readFileSync('sparta_data.json')); } catch (e) {}
}
const saveData = () => fs.writeFileSync('sparta_data.json', JSON.stringify(data));

const developer = "967730263509@s.whatsapp.net";

// دالة فك تشفير الآيدي
const decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
        let decode = jidDecode(jid) || {};
        return decode.user && decode.server && decode.user + '@' + decode.server || jid;
    }
    return jid;
};

// --- 3. تشغيل البوت الرئيسي ---
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
        } else if (connection === "open") {
            console.log("✅ نظام سبارتا متصل الآن.");
        }
    });

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        const remoteJid = msg.key.remoteJid;
        const sender = msg.key.fromMe ? decodeJid(sock.user.id) : (msg.key.participant || remoteJid);
        
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
        const isDeveloper = sender.includes("967730263509") || msg.key.fromMe;
        const isElite = data.elite.includes(sender) || isDeveloper;

        const quotedMsg = msg.message.extendedTextMessage?.contextInfo;
        const quotedSender = quotedMsg?.participant;
        const stanzaId = quotedMsg?.stanzaId;
        const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || quotedSender;

        // --- أوامر المطور ---
        if (isDeveloper) {
            if (text.startsWith(".أضف نخبة")) {
                let target = mentioned || text.split(" ")[2] + "@s.whatsapp.net";
                if (!data.elite.includes(target)) {
                    data.elite.push(target);
                    saveData();
                    return sock.sendMessage(remoteJid, { text: `✅ تمت إضافة @${target.split('@')[0]} للنخبة.`, mentions: [target] });
                }
            }
            if (text === ".نخبة") {
                let list = "🛡️ *قائمة النخبة:* \n\n";
                data.elite.forEach((e, i) => list += `${i + 1}. @${e.split('@')[0]}\n`);
                return sock.sendMessage(remoteJid, { text: list, mentions: data.elite });
            }
        }

        // --- أوامر النخبة (في المجموعات) ---
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

        // --- أوامر عامة ---
        if (text === ".بوت") {
            sock.sendMessage(remoteJid, { text: "🛡️ نظام سبارتا الملكي في الخدمة." }, { quoted: msg });
        }
        if (text === ".ايدي") {
            sock.sendMessage(remoteJid, { text: `🛡️ ID: ${remoteJid}` }, { quoted: msg });
        }
    });
}

// معالجة الأخطاء لعرضها في الموقع
process.on('uncaughtException', (err) => {
    lastError = `حدث خطأ: \n${err.stack}`;
    console.error(err);
});

startSpartaBot();

