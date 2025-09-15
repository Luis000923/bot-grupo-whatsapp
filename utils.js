// utils.js
// Funciones utilitarias generales (optimizadas para bajo consumo)

const fs = require('fs');
const fsp = require('fs').promises;

function loadData(dataFile) {
    if (fs.existsSync(dataFile)) {
        try {
            const raw = fs.readFileSync(dataFile, 'utf8').trim();
            const data = raw ? JSON.parse(raw) : {};
            // Si el archivo contiene 'events', lo ignoramos y reescribimos sin eventos
            const out = {
                groupIds: new Set(data.groupIds || []),
                activity: data.activity || {}
            };
            if (Object.prototype.hasOwnProperty.call(data, 'events')) {
                const clean = { groupIds: Array.from(out.groupIds), activity: out.activity };
                fs.writeFileSync(dataFile, JSON.stringify(clean, null, 2));
            }
            return {
                events: new Map(),
                ...out
            };
        } catch (e) {
            // Archivo corrupto: reescribir limpio
            const clean = { groupIds: [], activity: {} };
            fs.writeFileSync(dataFile, JSON.stringify(clean, null, 2));
            return {
                events: new Map(),
                groupIds: new Set(),
                activity: {}
            };
        }
    }
    return {
        events: new Map(),
        groupIds: new Set(),
        activity: {}
    };
}

function saveData(dataFile, a, b, c) {
    // Firmas soportadas:
    // (dataFile, events(Map), groupIds(Set), activity)
    // (dataFile, groupIds(Set), activity)
    let groupIds;
    let activity;
    if (a instanceof Map && b instanceof Set) {
        groupIds = b;
        activity = c || {};
    } else if (a instanceof Set) {
        groupIds = a;
        activity = b || {};
    } else {
        // Fallback: intentar forma objeto
        const obj = (typeof a === 'object' && a) || {};
        groupIds = obj.groupIds instanceof Set ? obj.groupIds : new Set();
        activity = obj.activity || {};
    }
    const data = {
        groupIds: Array.from(groupIds),
        activity
    };
    // Escritura asincrónica con debounce para minimizar I/O
    scheduleDebouncedWrite(dataFile, data);
}

// ---- Escritor debounced para minimizar escrituras sincronas ----
// Mantiene una cola por archivo y consolida cambios en bursts.
const _writeQueues = new Map(); // file -> { timer, pending, writing }

function scheduleDebouncedWrite(file, payload) {
    let q = _writeQueues.get(file);
    if (!q) {
        q = { timer: null, pending: null, writing: false };
        _writeQueues.set(file, q);
    }
    q.pending = payload;
    if (!q.timer) {
        q.timer = setTimeout(() => doWrite(file), 1500);
    }
}

async function doWrite(file) {
    const q = _writeQueues.get(file);
    if (!q) return;
    const data = q.pending;
    q.pending = data; // snapshot
    q.timer = null;
    q.writing = true;
    try {
        // JSON compacto para menor tamaño y CPU
        await fsp.writeFile(file, JSON.stringify(data));
    } catch (_) {
        // noop
    } finally {
        q.writing = false;
        // Si hubo cambios durante la escritura, programar otro ciclo breve
        if (q.pending !== data) {
            q.timer = setTimeout(() => doWrite(file), 500);
        }
    }
}

async function flushAllWrites() {
    const writes = [];
    for (const [file, q] of _writeQueues.entries()) {
        if (q.timer) clearTimeout(q.timer);
        if (q && q.pending) {
            writes.push(fsp.writeFile(file, JSON.stringify(q.pending)).catch(() => {}));
            q.timer = null;
            q.pending = null;
        }
    }
    if (writes.length) await Promise.all(writes);
}

// Asegurar flush en salidas comunes
for (const sig of ['SIGINT', 'SIGTERM', 'beforeExit']) {
    try { process.on(sig, () => { flushAllWrites().finally(() => { if (sig !== 'beforeExit') process.exit(); }); }); } catch (_) {}
}

module.exports = {
    loadData,
    saveData,
    flushAllWrites
};
