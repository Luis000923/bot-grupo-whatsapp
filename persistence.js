// persistence.js
// Servicio de persistencia con SQLite y capa de abstracción

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Usar la ruta configurada para Termux
const DB_PATH = path.isAbsolute(config.DB_PATH) ? config.DB_PATH : path.join(__dirname, config.DB_PATH);

// Asegurar que el directorio existe
const ensureDirectoryExists = (filePath) => {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

class Persistence {
    constructor() {
        // Asegurar que el directorio de la base de datos existe
        ensureDirectoryExists(DB_PATH);
        
        this.db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
                if (config.IS_TERMUX) {
                    console.log('Tip: Asegúrate de tener permisos de escritura en:', DB_PATH);
                }
            } else {
                console.log('Database connected successfully at:', DB_PATH);
            }
        });
        
        this.init();
    // Buffer para agregaciones de puntos { `${groupId}|${userId}`: count }
    this._pointsBuffer = Object.create(null);
    this._pointsTimer = null;
    this._pointsFlushIntervalMs = 2000; // consolidar cada 2s
    }

    init() {
        this.db.run(`CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            fecha TEXT,
            hora TEXT,
            descripcion TEXT
        )`);
        this.db.run(`CREATE TABLE IF NOT EXISTS user_points (
            groupId TEXT,
            userId TEXT,
            points INTEGER,
            PRIMARY KEY (groupId, userId)
        )`);
        this.db.run(`CREATE TABLE IF NOT EXISTS group_config (
            groupId TEXT PRIMARY KEY,
            welcomeText TEXT
        )`);
    }

    loadData() {
        // Devuelve todos los eventos y puntos de usuarios
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM events', (err, events) => {
                if (err) return reject(err);
                this.db.all('SELECT * FROM user_points', (err2, points) => {
                    if (err2) return reject(err2);
                    resolve({ events, points });
                });
            });
        });
    }

    saveData(data) {
        // No implementado: SQLite guarda automáticamente
        return Promise.resolve();
    }

    addEvent(event) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO events (name, fecha, hora, descripcion) VALUES (?, ?, ?, ?)',
                [event.name, event.fecha, event.hora, event.descripcion],
                function (err) {
                    if (err) return reject(err);
                    resolve(this.lastID);
                }
            );
        });
    }

    getEvents() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM events', (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    }

    addUserPoints(groupId, userId, points = 1) {
        // Acumular en memoria y flush periódico para reducir I/O
        const k = `${groupId}|${userId}`;
        this._pointsBuffer[k] = (this._pointsBuffer[k] || 0) + (points || 0);
        if (!this._pointsTimer) {
            this._pointsTimer = setTimeout(() => this.flushPoints().catch(()=>{}), this._pointsFlushIntervalMs);
        }
        return Promise.resolve();
    }

    getTopUsers(groupId, limit = 10) {
        // Antes de leer, asegurar flush de buffer para consistencia
        return this.flushPoints().then(() => new Promise((resolve, reject) => {
            this.db.all(
                'SELECT userId, points FROM user_points WHERE groupId = ? ORDER BY points DESC LIMIT ?',
                [groupId, limit],
                (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                }
            );
        }));
    }

    getGroupConfig(groupId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM group_config WHERE groupId = ?', [groupId], (err, row) => {
                if (err) return reject(err);
                resolve(row || null);
            });
        });
    }

    setGroupConfig(groupId, { welcomeText }) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO group_config (groupId, welcomeText) VALUES (?, ?)
                 ON CONFLICT(groupId) DO UPDATE SET welcomeText=excluded.welcomeText`,
                [groupId, welcomeText],
                function (err) {
                    if (err) return reject(err);
                    resolve();
                }
            );
        });
    }
}

module.exports = new Persistence();

// Métodos auxiliares añadidos al prototipo sin romper export default instancia
Persistence.prototype.flushPoints = function flushPoints() {
    const buf = this._pointsBuffer;
    this._pointsBuffer = Object.create(null);
    if (this._pointsTimer) { clearTimeout(this._pointsTimer); this._pointsTimer = null; }
    const entries = Object.entries(buf);
    if (!entries.length) return Promise.resolve();
    return new Promise((resolve) => {
        this.db.serialize(() => {
            this.db.run('BEGIN');
            for (const [k, delta] of entries) {
                const idx = k.indexOf('|');
                const groupId = k.substring(0, idx);
                const userId = k.substring(idx + 1);
                this.db.run(
                    `INSERT INTO user_points (groupId, userId, points) VALUES (?, ?, ?)
                     ON CONFLICT(groupId, userId) DO UPDATE SET points = points + ?`,
                    [groupId, userId, delta, delta]
                );
            }
            this.db.run('COMMIT', () => resolve());
        });
    });
};
