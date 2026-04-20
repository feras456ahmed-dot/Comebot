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

const app = express();
app.get("/", (req, res) => res.send("🛡️ Sparta System is Active!"));
app.listen(process.env.PORT || 8000);

// مخزن مؤقت لبيانات الترقية والإعفاء
let tempStorage = {};

const ranks = [
    "الإمبراطور", "نائب الإمبراطور", "الـلورد", "سلطان", "نائب سلطان",
    "الملك", "نائب الملك", "الدوق", "نائب الدوق", "أدميرال",
    "نائب أدميرال", "يونكو", "عميد", "تشيبوكاي", "ملازم",
    "حامل بيرق", "حامل راية", "مشرف متدرب"
];

async function startSpartaBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }),
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startSpartaBot();
        }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const remoteJid = msg.key.remoteJid;
        const sender = msg.key.participant || remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();

        // --- نظام التجهيز (في الخاص) ---
        if (!remoteJid.endsWith('@g.us')) {
            
            if (text === ".تجهيز ترقية" || text === ".تجهيز اعفاء") {
                tempStorage[sender] = { step: 1, type: text.includes("ترقية") ? "promote" : "demote" };
                return await sock.sendMessage(remoteJid, { text: "🛡️ نظام سبارتا جاهز.\nاكتب لقب الشخص المستهدف:" });
            }

            let userStep = tempStorage[sender];
            if (userStep) {
                if (userStep.step === 1) {
                    userStep.name = text;
                    userStep.step = 2;
                    return await sock.sendMessage(remoteJid, { text: "✅ تم تسجيل اللقب.\nالآن أرسل رقم الشخص (بالصيغة الدولية مثل +964...):" });
                }
                if (userStep.step === 2) {
                    userStep.targetNumber = text.replace(/\D/g, '') + "@s.whatsapp.net";
                    userStep.step = 3;
                    let rankList = ranks.map((r, i) => `${i + 1}. *${r}*`).join("\n");
                    return await sock.sendMessage(remoteJid, { text: `🛡️ اختر رقم الرتبة:\n\n${rankList}` });
                }
                if (userStep.step === 3) {
                    let rankIndex = parseInt(text) - 1;
                    if (ranks[rankIndex]) {
                        userStep.rankNum = parseInt(text);
                        userStep.rankName = ranks[rankIndex];
                        userStep.step = 4;
                        return await sock.sendMessage(remoteJid, { text: "✅ تم اختيار الرتبة.\nالآن اكتب وصف القروب الجديد:" });
                    }
                }
                if (userStep.step === 4) {
                    userStep.newDesc = text;
                    userStep.step = 5;
                    return await sock.sendMessage(remoteJid, { text: `✅ تم التجهيز بنجاح!\n\nاذهب للقروب ومنشن الشخص واكتب:\n${userStep.type === "promote" ? ".رقي" : ".إعفاء"}` });
                }
            }
        }

        // --- نظام التنفيذ (في القروب) ---
        if (remoteJid.endsWith('@g.us')) {
            let userStep = tempStorage[sender];
            
            if ((text.startsWith(".رقي") || text.startsWith(".إعفاء")) && userStep && userStep.step === 5) {
                const target = userStep.targetNumber;

                try {
                    // تغيير الوصف
                    await sock.groupUpdateDescription(remoteJid, userStep.newDesc);

                    if (userStep.type === "promote") {
                        // ترقية (مشرف) إذا كانت الرتبة 1-13
                        if (userStep.rankNum <= 13) {
                            await sock.groupParticipantsUpdate(remoteJid, [target], "promote");
                        }
                        await sock.sendMessage(remoteJid, { 
                            text: `🛡️ تهانينا @${target.split('@')[0]} !\nتمت ترقيتك لرتبة: *${userStep.rankName}*\n\nالوصف الجديد للقلعة تم تحديثه.`,
                            mentions: [target]
                        });
                    } else {
                        // إعفاء (سحب إشراف)
                        await sock.groupParticipantsUpdate(remoteJid, [target], "demote");
                        await sock.sendMessage(remoteJid, { 
                            text: `🛡️ تم إعفاء @${target.split('@')[0]} من مهامه.\nالرتبة السابقة: *${userStep.rankName}*`,
                            mentions: [target]
                        });
                    }
                    delete tempStorage[sender]; // مسح البيانات بعد التنفيذ
                } catch (e) {
                    await sock.sendMessage(remoteJid, { text: "❌ فشل التنفيذ. تأكد أن البوت مشرف!" });
                }
            }
        }
    });
}

startSpartaBot();

