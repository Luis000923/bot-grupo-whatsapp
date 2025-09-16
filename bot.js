const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const QRCode = require('qrcode');
const commands = require('./commands');
const utils = require('./utils');
// Usar persistencia específica para Termux si estamos en ese entorno
const config = require('./config');
const persistence = config.IS_TERMUX ? require('./persistence-termux') : require('./persistence');
const express = require('express');
const pidusage = require('pidusage');
const checkDiskSpace = require('check-disk-space').default;
const path = require('path');
const http = require('http');
const os = require('os');
const config = require('./config');

const DATA_FILE = config.IS_TERMUX ? path.join(config.TERMUX_HOME, 'bot_data.json') : './bot_data.json';
let { events, groupIds, activity } = utils.loadData(DATA_FILE);
const groupNames = {}; // id -> subject (en memoria)
// Buffer de mensajes recientes por grupo (no persistente)
const recentMessages = Object.create(null); // { [groupId]: [{ time, sender, text }] }
const MAX_MSGS_PER_GROUP = 100;

function startBot() {
    useMultiFileAuthState(config.AUTH_DIR).then(({ state, saveCreds }) => {
    let sock;
    // Exponer socket actual para API
    global.__CURRENT_SOCK__ = undefined;
    let reconnecting = false;
    let attempts = 0;

        const connect = () => {
            sock = makeWASocket({
                auth: state,
                logger: pino({ level: (config.LOG_LEVEL || 'error') }),
                browser: ['Bot WhatsApp', 'Chrome', '1.2.0']
            });
            global.__CURRENT_SOCK__ = sock;

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;
                if (qr) {
                    const qrPath = config.IS_TERMUX ? path.join(config.TERMUX_HOME, 'qr_whatsapp.png') : 'qr_whatsapp.png';
                    QRCode.toFile(qrPath, qr)
                        .then(() => console.log(` QR guardado como ${qrPath}`))
                        .catch((err) => console.error(' Error generando imagen QR:', err));
                    console.log(' Escanea este código QR para conectar tu bot');
                }
                if (connection === 'close') {
                    const errObj = lastDisconnect?.error;
                    const statusCode = errObj instanceof Boom ? errObj.output?.statusCode : undefined;
                    const msg = (errObj && (errObj.message || errObj.stack)) || '';
                    const isConflict = /conflict|replaced/i.test(msg);
                    const loggedOut = statusCode === DisconnectReason.loggedOut;

                    if (isConflict) {
                        console.error('⚠️ Conflicto de sesión detectado: otra sesión de WhatsApp Web reemplazó esta conexión.');
                        console.error('👉 Cierra las otras sesiones en tu teléfono (Dispositivos vinculados) y asegúrate de tener sólo UNA instancia del bot ejecutándose.');
                        console.error('⏹️ No se intentará reconectar automáticamente hasta resolver el conflicto.');
                        return; // evita bucles de reconexión por conflicto
                    }

                    const shouldReconnect = !loggedOut;
                    console.log(' Conexión cerrada. Reconectando:', shouldReconnect, '| status:', statusCode ?? 'desconocido');
                    if (shouldReconnect && !reconnecting) {
                        reconnecting = true;
                        attempts += 1;
                        const base = Math.min(60000, Math.pow(2, Math.min(attempts, 6)) * 1000); // 1s,2s,4s,8s,16s,32s, máx 60s
                        const jitter = Math.floor(Math.random() * 1000);
                        const delay = Math.min(60000, base + jitter);
                        console.log(`🔁 Reintentando conexión en ${Math.round(delay / 1000)}s (intento ${attempts})`);
                        setTimeout(() => {
                            reconnecting = false;
                            connect();
                        }, delay);
                    } else if (!shouldReconnect) {
                        console.log(`⛔ Sesión cerrada (logged out). Borra la carpeta ${config.AUTH_DIR} para un nuevo QR.`);
                    }
                } else if (connection === 'open') {
                    console.log('✅ Bot conectado exitosamente!');
                    attempts = 0; // reset backoff
                    // Precargar lista de grupos y nombres
                    try {
                        if (sock.groupFetchAllParticipating) {
                            const m = await sock.groupFetchAllParticipating();
                            const arr = Object.values(m);
                            for (const g of arr) {
                                groupIds.add(g.id);
                                if (g.subject) groupNames[g.id] = g.subject;
                            }
                            utils.saveData(DATA_FILE, groupIds, activity);
                            console.log(`📋 Grupos cargados: ${arr.length}`);
                        }
                    } catch (e) {
                        console.warn('No se pudieron precargar grupos:', e?.message || e);
                    }
                }
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('messages.upsert', async (m) => {
                const message = m.messages[0];
                if (!message.message || message.key.fromMe) return;
                const groupId = message.key.remoteJid;
                const senderId = message.key.participant || message.key.remoteJid;
                if (!groupId?.endsWith('@g.us')) return;

                // Añade el grupo si es nuevo
                if (!groupIds.has(groupId)) {
                    groupIds.add(groupId);
                    try {
                        const meta = await sock.groupMetadata(groupId);
                        if (meta?.subject) groupNames[groupId] = meta.subject;
                    } catch {}
                    utils.saveData(DATA_FILE, groupIds, activity);
                    console.log(`📱 Bot configurado para el grupo: ${groupNames[groupId] ? groupNames[groupId] + ' ' : ''}(${groupId})`);
                }

                // Registrar actividad del usuario
                if (!activity[groupId]) activity[groupId] = {};
                if (!activity[groupId][senderId]) activity[groupId][senderId] = 0;
                if (!message.message.stickerMessage) {
                    activity[groupId][senderId]++;
                    // También sumar puntos persistentes para /top
                    try { await persistence.addUserPoints(groupId, senderId, 1); } catch(e) { /* ignore */ }
                }
                utils.saveData(DATA_FILE, groupIds, activity);

                // Capturar texto legible
                let txt = '';
                try {
                    const msg = message.message;
                    txt = msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || msg.videoMessage?.caption || '';
                    if (!txt) {
                        if (msg.stickerMessage) txt = '[sticker]';
                        else if (msg.imageMessage) txt = '[imagen]';
                        else if (msg.videoMessage) txt = '[video]';
                        else if (msg.audioMessage) txt = '[audio]';
                        else if (msg.documentMessage) txt = '[documento]';
                        else txt = '[mensaje]';
                    }
                } catch {}

                // Guardar en buffer reciente
                if (!recentMessages[groupId]) recentMessages[groupId] = [];
                recentMessages[groupId].push({ time: Date.now(), sender: senderId, text: txt });
                if (recentMessages[groupId].length > MAX_MSGS_PER_GROUP) recentMessages[groupId].shift();

                // Enrutamiento de comandos
                const context = { events, groupIds, activity, sock, groupId, senderId, message };
                const text = message.message.conversation || message.message.extendedTextMessage?.text || '';
                Promise.resolve(commands.routeCommand(text, context)).catch((e) => console.error(e));
            });
        };
        connect();
    }).catch((error) => console.error('❌ Error iniciando el bot:', error));
}

startBot();

console.log(`
🤖 WhatsApp Bot iniciado
📱 Escanea el código QR para conectar
⚙️ El bot se configurará automáticamente al primer mensaje del grupo
`);

process.on('uncaughtException', (err) => {
    console.error('❌ Excepción no capturada:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('❌ Promesa rechazada no manejada:', reason);
});

// ---- Dashboard y API de métricas ----
const app = express();
let PORT = Number(process.env.PORT) || config.PORT;
app.use(express.json());
// Buffer de salidas para panel (no persistente)
const panelLog = [];
// CORS simple para permitir usar el panel desde file:// o distintos orígenes
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

function pushPanel(entry){
    panelLog.push({ time: Date.now(), ...entry });
    if (panelLog.length > 200) panelLog.shift();
}

app.get('/api/metrics', async (req, res) => {
    try {
        const { cpu, memory } = await pidusage(process.pid);
        const memTotal = os.totalmem?.() || 0;
        const memFree = os.freemem?.() || 0;
        const memUsed = memTotal - memFree;
        const disk = await checkDiskSpace(path.parse(process.cwd()).root);
        const diskTotal = disk.size || 0;
        const diskFree = disk.free || 0;
        const diskUsed = Math.max(0, diskTotal - diskFree);
        const groupsCount = groupIds?.size || 0;
        const usersCount = Object.values(activity || {}).reduce((acc, g) => acc + Object.keys(g).length, 0);
        res.json({
            cpuPercent: cpu, // pidusage: porcentaje (~0-100)
            memProcessBytes: memory,
            memSystemTotal: memTotal,
            memSystemUsed: memUsed,
            diskTotal,
            diskUsed,
            groupsCount,
            usersCount,
            uptimeSec: Math.floor(process.uptime())
        });
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

app.use('/dashboard', express.static(path.join(__dirname, 'public')));

// Listar grupos (intenta obtener desde API de WhatsApp; si no, usa memoria)
app.get('/api/groups', async (req, res) => {
    try {
        const sockRef = global.__CURRENT_SOCK__;
        let result = [];
        if (sockRef?.groupFetchAllParticipating) {
            try {
                const m = await sockRef.groupFetchAllParticipating();
                result = Object.values(m).map(g => ({ id: g.id, name: g.subject }));
                // Actualizar caché en memoria
                for (const g of result) {
                    groupIds.add(g.id);
                    if (g.name) groupNames[g.id] = g.name;
                }
                utils.saveData(DATA_FILE, groupIds, activity);
            } catch {}
        }
        if (result.length === 0) {
            result = Array.from(groupIds || []).map(id => ({ id, name: groupNames[id] }));
        }
        res.json({ groups: result });
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

// Resumen de grupos con últimos mensajes para la UI
app.get('/api/groups/summary', (req, res) => {
    try {
        const list = Array.from(groupIds || []).map(id => ({
            id,
            name: groupNames[id] || id,
            last: (recentMessages[id] || []).slice(-1)[0]
        }));
        res.json({ groups: list });
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

// Mensajes recientes por grupo
app.get('/api/group/:id/messages', (req, res) => {
    try {
        const id = req.params.id;
        const all = recentMessages[id] || [];
        // Permitir limitar cantidad
        const n = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
        const slice = all.slice(-n);
        res.json({ id, name: groupNames[id] || id, messages: slice });
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

// Últimas salidas capturadas para mostrar en la terminal del panel
app.get('/api/panel-logs', (req, res) => {
    try {
        res.json({ logs: panelLog });
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

// Handler reutilizable para ejecutar comandos desde el panel
async function handlePanelCommand({ groupId, text }, res){
    if (!text || !groupId) return res.status(400).json({ error: 'groupId y text son requeridos' });
    let cmd = String(text);
    if (!cmd.startsWith('/')) cmd = `/${cmd}`;
    const sockRef = global.__CURRENT_SOCK__;
    if (!sockRef) return res.status(503).json({ error: 'socket no disponible' });
    const outputs = [];
    const proxySock = new Proxy(sockRef, {
        get(target, prop){
            if (prop === 'sendMessage'){
                return (jid, content) => {
                    const t = (content && content.text) || JSON.stringify(content);
                    outputs.push({ groupId: jid, text: t });
                    pushPanel({ groupId: jid, text: t });
                    return Promise.resolve();
                };
            }
            return target[prop];
        }
    });

    // Excepción: /ms debe realmente enviar el mensaje al grupo
    const isMS = /^\/ms(\s|$)/i.test(cmd);
    const ctx = {
        events,
        groupIds,
        activity,
        sock: isMS ? sockRef : proxySock,
        groupId,
        senderId: sockRef.user?.id || 'admin@bot',
        message: { key: { remoteJid: groupId }, message: { conversation: cmd } }
    };
    await Promise.resolve(commands.routeCommand(cmd, ctx));
    utils.saveData(DATA_FILE, groupIds, activity);
    return res.json({ ok: true, outputs });
}

// Ejecutar comando (POST)
app.post('/api/command', async (req, res) => {
    try {
        await handlePanelCommand({ groupId: req.body?.groupId, text: req.body?.text }, res);
    } catch (e) {
        pushPanel({ groupId: req.body?.groupId, text: `ERROR: ${String(e)}` });
        res.status(500).json({ error: String(e) });
    }
});

// Fallback GET para entornos donde el POST falle (por ejemplo, restricciones del navegador)
app.get('/api/command', async (req, res) => {
    try {
        const groupId = req.query.groupId;
        const text = req.query.text;
        await handlePanelCommand({ groupId, text }, res);
    } catch (e) {
        pushPanel({ groupId: req.query?.groupId, text: `ERROR: ${String(e)}` });
        res.status(500).json({ error: String(e) });
    }
});

function getLocalIpCandidates(){
    const ifs = os.networkInterfaces?.() || {};
    const skip = [/virtualbox/i, /vmware/i, /vbox/i, /veth/i, /vethernet/i, /hyper-v/i, /hamachi/i, /docker/i, /wsl/i, /loopback/i, /bluetooth/i, /npcap/i];
    const ips = [];
    for (const name of Object.keys(ifs)) {
        if (skip.some(rx => rx.test(name))) continue;
        for (const addr of ifs[name] || []) {
            if (addr.family !== 'IPv4' || addr.internal) continue;
            const ip = addr.address;
            // Solo rangos privados típicos y evitar 169.254 y 192.168.56.* (VirtualBox Host-Only)
            if (/^10\./.test(ip) || /^192\.168\.(?!56\.)/.test(ip) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) {
                ips.push({ name, ip });
            }
        }
    }
    return ips;
}

function getLocalIp(){
    if (process.env.HOST_IP) return process.env.HOST_IP;
    const ips = getLocalIpCandidates();
    // Preferir 192.168.x.x si existe
    const cand = ips.find(x => /^192\.168\./.test(x.ip)) || ips[0];
    return cand?.ip || '127.0.0.1';
}

function startHttpServer(port, retries=5){
    const server = http.createServer(app);
    server.on('error', (err) => {
        if (err && err.code === 'EADDRINUSE' && retries > 0) {
            console.warn(`⚠️ Puerto ${port} en uso, intentando ${port+1}...`);
            setTimeout(() => startHttpServer(port + 1, retries - 1), 200);
        } else {
            console.error('❌ Error iniciando servidor HTTP:', err);
        }
    });
    server.listen(port, '0.0.0.0', () => {
        PORT = port;
        const ip = getLocalIp();
        const others = getLocalIpCandidates().map(x => `${x.ip} (${x.name})`).join(', ');
        console.log(`📊 Dashboard disponible en http://localhost:${PORT}/dashboard | http://${ip}:${PORT}/dashboard`);
        if (others) console.log(`🌐 Otras IPs locales detectadas: ${others}`);
    });
    return server;
}

startHttpServer(PORT);

// Salida limpia: asegurar flush de buffers de disco y DB
const { flushAllWrites } = require('./utils');
function gracefulExit(code=0){
    try { persistence.flushPoints?.().catch(()=>{}); } catch {}
    Promise.resolve(flushAllWrites?.()).finally(() => process.exit(code));
}
process.on('SIGINT', () => gracefulExit(0));
process.on('SIGTERM', () => gracefulExit(0));

