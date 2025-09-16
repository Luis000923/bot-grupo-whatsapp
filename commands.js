// commands.js
// Enrutador de comandos y handlers
const users = require('./users');
const validators = require('./utils/validators');
// Usar persistencia específica para Termux si estamos en ese entorno
const config = require('./config');
const persistence = config.IS_TERMUX ? require('./persistence-termux') : require('./persistence');
const utils = require('./utils');

// ---- Helpers para comandos aleatorios (evitar duplicación) ----
async function getParticipantPool(ctx) {
    const meta = await ctx.sock.groupMetadata(ctx.groupId);
    const all = meta.participants.map(p => p.id);
    const me = ctx.sock.user?.id || '';
    return all.filter(id => id !== me);
}

function pickUnique(pool, count) {
    if (!Array.isArray(pool) || pool.length < count) return null;
    const copy = pool.slice();
    const picks = [];
    for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * copy.length);
        picks.push(copy[idx]);
        copy.splice(idx, 1);
    }
    return picks;
}

function at(jid) { return `@${jid.split('@')[0]}`; }

async function handleRandomCommand(ctx, count, buildText, errorText) {
    const pool = await getParticipantPool(ctx);
    if (!pool || pool.length < count) {
        return ctx.sock.sendMessage(ctx.groupId, { text: errorText || '❌ No hay suficientes integrantes.' });
    }
    const picks = pickUnique(pool, count);
    const text = buildText(picks.map(at));
    return ctx.sock.sendMessage(ctx.groupId, { text, mentions: picks });
}

async function routeCommand(text, ctx) {
    const t = (text || '').trim();
    if (!t) return;
    // Ignorar todo lo que no sea comando (no empieza con '/')
    if (!t.startsWith('/')) return;

    // Ayuda
    if (t.startsWith('/ayuda')) {
        const isAdmin = await isSenderAdmin(ctx);
        const help = buildHelp(isAdmin);
        return ctx.sock.sendMessage(ctx.groupId, { text: help });
    }

    // Info de grupo
    if (t.startsWith('/info')) {
        const meta = await ctx.sock.groupMetadata(ctx.groupId);
        const info = users.getGroupInfo(meta);
        const adminNumbers = info.admins.map(a => `• @${a.split('@')[0]}`).join('\n');
        const msg = `ℹ️ *INFORMACIÓN DEL GRUPO*\n\n` +
            `📝 *Nombre:* ${info.name}\n` +
            `👑 *Administradores:*\n${adminNumbers}\n` +
            `📊 *Total admins:* ${info.admins.length}`;
        return ctx.sock.sendMessage(ctx.groupId, { text: msg, mentions: info.admins });
    }

    // (Comandos de eventos eliminados)

    // Líderes
    if (t.startsWith('/lideres')) {
        const meta = await ctx.sock.groupMetadata(ctx.groupId);
        const leaders = meta.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').map(p => p.id);
        if (leaders.length === 0) return ctx.sock.sendMessage(ctx.groupId, { text: '❌ No hay líderes (administradores) en este grupo.' });
        const mentions = leaders.map(l => `@${l.split('@')[0]}`).join(' ');
        return ctx.sock.sendMessage(ctx.groupId, { text: `👑 *Líderes del grupo:*\n${mentions}`, mentions: leaders });
    }

    // Bienvenido configurable
    if (t.startsWith('/bienvenido')) {
        const isAdmin = await isSenderAdmin(ctx);
        const meta = await ctx.sock.groupMetadata(ctx.groupId);

        // Subcomando para setear mensaje: solo admin
        if (t.startsWith('/bienvenido set')) {
            if (!isAdmin) return;
            const msg = t.replace('/bienvenido set', '').trim();
            if (!msg) return ctx.sock.sendMessage(ctx.groupId, { text: '❌ Usa: /bienvenido set [mensaje de bienvenida]'});
            await persistence.setGroupConfig(ctx.groupId, { welcomeText: msg });
            return ctx.sock.sendMessage(ctx.groupId, { text: '✅ Mensaje de bienvenida actualizado.' });
        }

        // Resolver objetivo: mención explícita, respuesta/quoted o @numero
        const ci = ctx.message.extendedTextMessage?.contextInfo;
        let mention = (ci?.mentionedJid || [])[0];
        if (!mention && ci?.quotedMessage && ci?.participant) {
            mention = ci.participant; // usuario al que se respondió
        }
        if (!mention) {
            // Intentar capturar @<numero> del texto y mapearlo a un participante del grupo
            const after = t.replace('/bienvenido', '').trim();
            const atToken = (after.split(/\s+/).find(tok => tok.startsWith('@')) || '');
            const digits = atToken.replace(/\D/g, '');
            if (digits.length >= 6) {
                const found = meta.participants.find(p => p.id.startsWith(digits + '@'));
                if (found) mention = found.id;
            }
        }
        if (!mention) return ctx.sock.sendMessage(ctx.groupId, { text: '❌ Debes mencionar o responder al nuevo integrante. Ej: /bienvenido @usuario o responde a su último mensaje con /bienvenido' });

        // Inicializar por primera vez con "ninguni" si no existe
        const cfg = await persistence.getGroupConfig(ctx.groupId);
        if (!cfg?.welcomeText) {
            await persistence.setGroupConfig(ctx.groupId, { welcomeText: 'ninguni' });
        }
        const cfg2 = await persistence.getGroupConfig(ctx.groupId);

    const textMsg = `${cfg2?.welcomeText || 'ninguni'} @${mention.split('@')[0]}`;
    // Solo mencionar al nuevo integrante
    return ctx.sock.sendMessage(ctx.groupId, { text: textMsg, mentions: [mention] });
    }

    // Top usando persistencia
    if (t.startsWith('/top')) {
        const top = await persistence.getTopUsers(ctx.groupId, 10);
        if (!top || top.length === 0) return ctx.sock.sendMessage(ctx.groupId, { text: '📊 No hay actividad registrada aún.' });
        let msg = '🏆 *TOP MENSAJES ENVIADOS DEL GRUPO*\n\n';
        const mentions = [];
        top.forEach((row, i) => {
            msg += `${i + 1}. @${row.userId.split('@')[0]} - ${row.points} mensajes enviados\n`;
            mentions.push(row.userId);
        });
        return ctx.sock.sendMessage(ctx.groupId, { text: msg, mentions });
    }

    // Más activo: usa datos de actividad locales (excluye al bot y usuarios fuera del grupo si es posible)
    if (t.startsWith('/masactivo')) {
        const meta = await ctx.sock.groupMetadata(ctx.groupId);
        const participants = new Set(meta.participants.map(p => p.id));
        const me = ctx.sock.user?.id || '';
        const groupActivity = ctx.activity?.[ctx.groupId] || {};
        // Filtrar a participantes actuales si hay; si no, usar todos
        const entries = Object.entries(groupActivity)
            .filter(([uid, count]) => participants.has(uid) && uid !== me && typeof count === 'number');
        const sourceAll = Object.entries(groupActivity).filter(([uid]) => uid !== me);
        const source = entries.length > 0 ? entries : sourceAll;
        if (!source || source.length === 0) {
            return ctx.sock.sendMessage(ctx.groupId, { text: '📊 No hay actividad registrada aún.' });
        }
        let bestUser = source[0][0];
        let bestCount = Number(source[0][1]) || 0;
        for (const [uid, cnt] of source) {
            const n = Number(cnt) || 0;
            if (n > bestCount) { bestCount = n; bestUser = uid; }
        }
        const text = `@${bestUser.split('@')[0]} es el más activo del grupo 🔥`;
        return ctx.sock.sendMessage(ctx.groupId, { text, mentions: [bestUser] });
    }

    // Menos activo: usa datos de actividad locales (excluye al bot y usuarios fuera del grupo si es posible)
    if (t.startsWith('/menosactivo')) {
        const meta = await ctx.sock.groupMetadata(ctx.groupId);
        const participants = new Set(meta.participants.map(p => p.id));
        const me = ctx.sock.user?.id || '';
        const groupActivity = ctx.activity?.[ctx.groupId] || {};
        const entries = Object.entries(groupActivity)
            .filter(([uid, count]) => participants.has(uid) && uid !== me && typeof count === 'number');
        const sourceAll = Object.entries(groupActivity).filter(([uid]) => uid !== me);
        const source = entries.length > 0 ? entries : sourceAll;
        if (!source || source.length === 0) {
            return ctx.sock.sendMessage(ctx.groupId, { text: '📊 No hay actividad registrada aún.' });
        }
        let worstUser = source[0][0];
        let worstCount = Number(source[0][1]) || 0;
        for (const [uid, cnt] of source) {
            const n = Number(cnt) || 0;
            if (n < worstCount) { worstCount = n; worstUser = uid; }
        }
        const text = `@${worstUser.split('@')[0]} es el fantasma del grupo 👻`;
        return ctx.sock.sendMessage(ctx.groupId, { text, mentions: [worstUser] });
    }

    // Novios: elige 2 miembros aleatorios del grupo (excluye al bot)
    if (t.startsWith('/novios')) {
        return handleRandomCommand(
            ctx,
            2,
            ([a, b]) => `${a} y ${b} son novios 💕 ¡Viva el amor!`,
            '❌ No hay suficientes integrantes para elegir dos personas.'
        );
    }

    // Crush: elige 2 miembros aleatorios del grupo (excluye al bot)
    if (t.startsWith('/crush')) {
        return handleRandomCommand(
            ctx,
            2,
            ([a, b]) => `${a} y ${b} secretamente se gustan 😳💘`,
            '❌ No hay suficientes integrantes para elegir dos personas.'
        );
    }

    // Mensaje directo al grupo: /ms escribe el mensaje
    if (t.startsWith('/ms')) {
        const msg = t.replace('/ms', '').trim();
        if (!msg) return ctx.sock.sendMessage(ctx.groupId, { text: '❌ Usa: /ms [mensaje a enviar al grupo]' });
        return ctx.sock.sendMessage(ctx.groupId, { text: msg });
    }

    // Lucky: elige 1 miembro aleatorio del grupo (excluye al bot)
    if (t.startsWith('/lucky')) {
        return handleRandomCommand(
            ctx,
            1,
            ([a]) => `${a} hoy es tu día de suerte 🍀`,
            '❌ No hay suficientes integrantes para elegir a alguien.'
        );
    }

    // Random: elige 1 miembro aleatorio del grupo (excluye al bot)
    if (t.startsWith('/gey')) {
        return handleRandomCommand(
            ctx,
            1,
            ([a]) => `${a} eres el gey del grupo todos los sabemos ya no lo tienes que ocultar. el que lea esto tambien es gey y le gusta las monas negras de 30 cm. *CULERO*🌈`,
            '❌ No hay suficientes integrantes para elegir a alguien.'
        );
    }

    // Simp: elige 1 miembro aleatorio del grupo (excluye al bot)
    if (t.startsWith('/simp')) {
        return handleRandomCommand(
            ctx,
            1,
            ([a]) => `${a} es el simp oficial del grupo 🫡`,
            '❌ No hay suficientes integrantes para elegir a alguien.'
        );
    }

    // Pro: elige 1 miembro aleatorio del grupo (excluye al bot)
    if (t.startsWith('/pro')) {
        return handleRandomCommand(
            ctx,
            1,
            ([a]) => `${a} es el pro en todo 💪`,
            '❌ No hay suficientes integrantes para elegir a alguien.'
        );
    }

    // Comando desconocido (opcional, solo si viene con '/')
    const err = validators.validateCommand(t.split(' ')[0], ['/ayuda','/info','/lideres','/bienvenido','/top','/masactivo','/menosactivo','/novios','/crush','/random','/lucky','/simp','/pro','/ms']);
    if (err) return ctx.sock.sendMessage(ctx.groupId, { text: err });
}

function buildHelp(isAdmin) {
    let helpText = `🤖 *COMANDOS DISPONIBLES*\n\n`;
    helpText += `👥 *Comandos generales:*\n`;
    helpText += `• /ayuda - Muestra esta lista\n`;
    helpText += `• /info - Info del grupo\n`;
    // eventos removidos
    helpText += `• /lideres - Menciona a todos los líderes del grupo\n`;
    helpText += `• /bienvenido @usuario - Da la bienvenida (usa mensaje configurado)\n`;
    helpText += `• /masactivo - Menciona al usuario con más mensajes\n`;
    helpText += `• /menosactivo - Menciona al usuario con menos mensajes\n`;
    helpText += `• /novios - Empareja 2 personas al azar\n`;
    helpText += `• /crush - Dos personas que secretamente se gustan\n`;
    helpText += `• /ms [mensaje] - Enviar mensaje al grupo\n`;
    helpText += `• /lucky - Hoy es tu día de suerte\n`;
    helpText += `• /gey - Elige a una persona al azar del grupo\n`;
    helpText += `• /simp - Declara al simp oficial del grupo\n`;
    helpText += `• /pro - El pro en todo\n`;
    helpText += `• /top - Top de mensajes\n\n`;
    if (isAdmin) {
        helpText += `🔧 *Comandos de administrador:*\n`;
        // eventos removidos
        helpText += `• /bienvenido set [mensaje] - Configura el mensaje de bienvenida del grupo\n\n`;
    }
    return helpText;
}

async function isSenderAdmin(ctx) {
    try {
        const meta = await ctx.sock.groupMetadata(ctx.groupId);
        return users.isGroupAdmin(meta, ctx.senderId);
    } catch {
        return false;
    }
}

function save(ctx) {
    utils.saveData('./bot_data.json', ctx.groupIds, ctx.activity);
}

module.exports = { routeCommand };
