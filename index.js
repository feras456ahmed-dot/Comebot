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

// --- إدارة البيانات (النخبة والإنذارات) ---
let data = { elite: ["967730263509@s.whatsapp.net"], warnings: {} };
if (fs.existsSync('sparta_data.json')) {
    data = JSON.parse(fs.readFileSync('sparta_data.json'));
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
        } else if (connection === "open") console.log("✅ نظام النخبة متصل.");
    });

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const remoteJid = msg.key.remoteJid;
        const sender = msg.key.participant || remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
        const isDeveloper = sender === developer;
        const isElite = data.elite.includes(sender) || isDeveloper;

        // استخراج المنشن أو الرقم أو الرد
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedSender = msg.message.extendedTextMessage?.contextInfo?.participant;
        const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || quotedSender;

        // --- 1. أوامر المطور فقط (أنت) ---
        if (isDeveloper) {
            if (text.startsWith(".أضف نخبة")) {
                let target = mentioned || text.split(" ")[2] + "@s.whatsapp.net";
                if (!data.elite.includes(target)) {
                    data.elite.push(target);
                    saveData();
                    return sock.sendMessage(remoteJid, { text: `✅ تمت إضافة @${target.split('@')[0]} إلى قائمة النخبة.`, mentions: [target] });
                }
            }
            if (text.startsWith(".طرد نخبة")) {
                let target = mentioned || text.split(" ")[2] + "@s.whatsapp.net";
                data.elite = data.elite.filter(e => e !== target);
                saveData();
                return sock.sendMessage(remoteJid, { text: `❌ تم سحب صلاحيات النخبة من @${target.split('@')[0]}.`, mentions: [target] });
            }
            if (text === ".نخبة") {
                let list = "🛡️ *قائمة النخبة المصرح لهم:*\n\n";
                data.elite.forEach((e, i) => list += `${i + 1}. @${e.split('@')[0]}\n`);
                return sock.sendMessage(remoteJid, { text: list, mentions: data.elite });
            }
        }

        // --- 2. أوامر النخبة (إدارية) ---
        if (isElite && remoteJid.endsWith('@g.us')) {
            if (text === ".ثبت" && quoted) {
                await sock.sendMessage(remoteJid, { pin: msg.message.extendedTextMessage.contextInfo.stanzaId, type: 1, duration: 2592000 });
            }
            if (text === ".الغ تثبيت" && quoted) {
                await sock.sendMessage(remoteJid, { pin: msg.message.extendedTextMessage.contextInfo.stanzaId, type: 2 });
            }
            if (text === ".احذف" && quoted) {
                await sock.sendMessage(remoteJid, { delete: { remoteJid, fromMe: false, id: msg.message.extendedTextMessage.contextInfo.stanzaId, participant: quotedSender } });
            }
            if (text.startsWith(".طرد") && mentioned) {
                await sock.groupParticipantsUpdate(remoteJid, [mentioned], "remove");
                sock.sendMessage(remoteJid, { text: `🛡️ تم طرد @${mentioned.split('@')[0]} بأمر النخبة.`, mentions: [mentioned] });
            }
            if (text.startsWith(".أضف") && text.split(" ")[1]) {
                let num = text.split(" ")[1].replace(/\D/g, '') + "@s.whatsapp.net";
                await sock.groupParticipantsUpdate(remoteJid, [num], "add");
            }
            if (text.startsWith(".انذار") && mentioned) {
                data.warnings[mentioned] = (data.warnings[mentioned] || 0) + 1;
                saveData();
                sock.sendMessage(remoteJid, { text: `⚠️ إنذار لـ @${mentioned.split('@')[0]}\nعدد إنذاراته الآن: ${data.warnings[mentioned]}`, mentions: [mentioned] });
            }
            if (text.startsWith(".انذارات") && mentioned) {
                let count = data.warnings[mentioned] || 0;
                sock.sendMessage(remoteJid, { text: `🛡️ العضو @${mentioned.split('@')[0]} لديه ${count} إنذارات.`, mentions: [mentioned] });
            }
        }

        // --- 3. الأوامر العامة ---
        if (text === ".انذاراتي") {
            let count = data.warnings[sender] || 0;
            sock.sendMessage(remoteJid, { text: `🛡️ إنذاراتك الحالية هي: ${count}` }, { quoted: msg });
        }
        if (text === ".بوت") {
            sock.sendMessage(remoteJid, { text: "🛡️ نظام سبارتا (نسخة النخبة) في الخدمة." }, { quoted: msg });
        }
    });
}

startSpartaBot();

