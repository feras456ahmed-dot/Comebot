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
const fs = require("fs");

const app = express();
app.get("/", (req, res) => res.send("🛡️ Sparta Elite System is Active!"));
app.listen(process.env.PORT || 8000);

// --- إدارة البيانات ---
let data = { elite: ["967730263509@s.whatsapp.net"], warnings: {} };
if (fs.existsSync('sparta_data.json')) {
    try { data = JSON.parse(fs.readFileSync('sparta_data.json')); } catch (e) {}
}
const saveData = () => fs.writeFileSync('sparta_data.json', JSON.stringify(data));

const developer = "967730263509@s.whatsapp.net";

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
        if (!msg.message) return; // تم حذف (msg.key.fromMe) للسماح للبوت بآمر نفسه

        const remoteJid = msg.key.remoteJid;
        // تعديل لجعل البوت يتعرف على نفسه كـ "مرسل"
        const sender = msg.key.fromMe ? (sock.decodeJid(sock.user.id)) : (msg.key.participant || remoteJid);
        
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
        
        // المطور هو صاحب الرقم أو البوت نفسه
        const isDeveloper = sender.includes("967730263509") || msg.key.fromMe;
        const isElite = data.elite.includes(sender) || isDeveloper;

        const quotedMsg = msg.message.extendedTextMessage?.contextInfo;
        const quotedSender = quotedMsg?.participant;
        const stanzaId = quotedMsg?.stanzaId;
        const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || quotedSender;

        // --- تنفيذ الأوامر (نفس الكود السابق) ---
        if (isDeveloper) {
            if (text === ".نخبة") {
                let list = "🛡️ *قائمة النخبة المصرح لهم:*\n\n";
                data.elite.forEach((e, i) => list += `${i + 1}. @${e.split('@')[0]}\n`);
                return sock.sendMessage(remoteJid, { text: list, mentions: data.elite });
            }
            // ... بقية أوامر المطور ...
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
            sock.sendMessage(remoteJid, { text: "🛡️ سبارتا في الخدمة (التحكم الذاتي مفعل)." }, { quoted: msg });
        }
    });
}
// دالة مساعدة لفك تشفير الآيدي
sock.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
        let decode = jid.split(':');
        return (decode[0] + '@' + decode[1].split('@')[1]) || jid;
    }
    return jid;
};

startSpartaBot();

