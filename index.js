const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    fetchLatestBaileysVersion, 
    DisconnectReason 
} = require("@whiskeysockets/baileys");
const pino = require("pino");

async function startComebot() {
    // إنشاء الجلسة في مجلد جديد ونظيف
    const { state, saveCreds } = await useMultiFileAuthState('come_session');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    console.log(`🛡️ جاري تشغيل Comebot بإصدار Baileys v${version}`);

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: ["Ubuntu", "Chrome", "20.0.0.4"], // متصفح مستقر للربط
        generateHighQualityLinkPreview: true
    });

    // منطق طلب كود الربط (Pairing Code)
    if (!sock.authState.creds.registered) {
        const phoneNumber = "4915510974213";
        // انتظار بسيط لضمان استقرار الاتصال قبل طلب الكود
        await delay(5000); 
        try {
            const code = await sock.requestPairingCode(phoneNumber);
            console.log("\n" + "=".repeat(30));
            console.log(`🔥 كود الربط الخاص بك هو: ${code}`);
            console.log("=".repeat(30) + "\n");
        } catch (error) {
            console.error("❌ فشل طلب كود الربط، جرب إعادة التشغيل:", error);
        }
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const sender = msg.key.participant || from;
        const pushName = msg.pushName || "محارب سبارتا";
        const body = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();

        if (body.startsWith(".بوت")) {
            let ppUrl;
            try { 
                ppUrl = await sock.profilePictureUrl(sender, 'image'); 
            } catch { 
                ppUrl = "https://telegra.ph/file/02969963e6a27e74360e2.jpg"; 
            }

            const welcomeText = `مرحباً بك في مستودع Comebot الجديد ⚔️🛡️\n\n👤 *الاسم:* ${pushName}\n🆔 *الأيدي:* ${sender.split('@')[0]}\n\nأهلاً بك يا @${sender.split('@')[0]} في مملكة سبارتا المتجددة!`;

            await sock.sendMessage(from, { 
                image: { url: ppUrl },
                caption: welcomeText,
                mentions: [sender]
            });
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log("⚠️ انقطع الاتصال، جاري إعادة المحاولة:", shouldReconnect);
            if (shouldReconnect) startComebot();
        } else if (connection === 'open') {
            console.log("✅ تمت العملية! Comebot متصل الآن بعرش سبارتا.");
        }
    });
}

// البدء
startComebot();

