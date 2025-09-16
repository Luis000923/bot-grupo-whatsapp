// persistence-termux.js
// Versión alternativa de persistencia para Termux usando solo archivos JSON
// Evita la necesidad de compilar SQLite nativo

const fs = require('fs');
const path = require('path');
const config = require('./config');

// Rutas de archivos JSON para persistencia
const DATA_DIR = config.IS_TERMUX ? path.join(config.TERMUX_HOME, '.bot-data') : './data';
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');
const USER_POINTS_FILE = path.join(DATA_DIR, 'user_points.json');
const GROUP_CONFIG_FILE = path.join(DATA_DIR, 'group_config.json');

// Asegurar que el directorio existe
const ensureDirectoryExists = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

class PersistenceTermux {
    constructor() {
        ensureDirectoryExists(DATA_DIR);
        
        // Cargar datos desde archivos JSON
        this.events = this.loadJsonFile(EVENTS_FILE, []);
        this.userPoints = this.loadJsonFile(USER_POINTS_FILE, {});
        this.groupConfig = this.loadJsonFile(GROUP_CONFIG_FILE, {});
        
        // Buffer para agregaciones de puntos
        this._pointsBuffer = Object.create(null);
        this._pointsTimer = null;
        this._pointsFlushIntervalMs = 2000;
        
        console.log('Persistence (Termux JSON mode) initialized at:', DATA_DIR);
    }

    loadJsonFile(filePath, defaultValue) {
        try {
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.warn(`Error loading ${filePath}:`, error.message);
        }
        return defaultValue;
    }

    saveJsonFile(filePath, data) {
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        } catch (error) {
            console.error(`Error saving ${filePath}:`, error.message);
        }
    }

    loadData() {
        // Convertir formato para compatibilidad con el código existente
        const events = this.events;
        const points = Object.entries(this.userPoints).map(([key, points]) => {
            const [groupId, userId] = key.split('|');
            return { groupId, userId, points };
        });
        
        return Promise.resolve({ events, points });
    }

    // Métodos de eventos
    addEvent(name, fecha, hora, descripcion) {
        const event = {
            id: Date.now(),
            name,
            fecha,
            hora,
            descripcion
        };
        this.events.push(event);
        this.saveJsonFile(EVENTS_FILE, this.events);
        return Promise.resolve();
    }

    removeEvent(eventId) {
        this.events = this.events.filter(event => event.id !== parseInt(eventId));
        this.saveJsonFile(EVENTS_FILE, this.events);
        return Promise.resolve();
    }

    getEvents() {
        return Promise.resolve(this.events);
    }

    // Métodos de puntos de usuario
    addPoints(groupId, userId, points = 1) {
        const key = `${groupId}|${userId}`;
        this._pointsBuffer[key] = (this._pointsBuffer[key] || 0) + points;
        
        if (!this._pointsTimer) {
            this._pointsTimer = setTimeout(() => {
                this.flushPointsBuffer();
            }, this._pointsFlushIntervalMs);
        }
    }

    flushPointsBuffer() {
        if (Object.keys(this._pointsBuffer).length === 0) {
            this._pointsTimer = null;
            return;
        }

        // Aplicar cambios del buffer
        for (const [key, points] of Object.entries(this._pointsBuffer)) {
            this.userPoints[key] = (this.userPoints[key] || 0) + points;
        }
        
        // Limpiar buffer
        this._pointsBuffer = Object.create(null);
        this._pointsTimer = null;
        
        // Guardar a archivo
        this.saveJsonFile(USER_POINTS_FILE, this.userPoints);
    }

    getUserPoints(groupId, userId) {
        const key = `${groupId}|${userId}`;
        const currentPoints = this.userPoints[key] || 0;
        const bufferPoints = this._pointsBuffer[key] || 0;
        return Promise.resolve(currentPoints + bufferPoints);
    }

    getTopUsers(groupId, limit = 10) {
        // Flush buffer antes de obtener tops
        this.flushPointsBuffer();
        
        const groupUsers = Object.entries(this.userPoints)
            .filter(([key]) => key.startsWith(`${groupId}|`))
            .map(([key, points]) => {
                const userId = key.split('|')[1];
                return { userId, points };
            })
            .sort((a, b) => b.points - a.points)
            .slice(0, limit);
            
        return Promise.resolve(groupUsers);
    }

    // Métodos de configuración de grupo
    setWelcomeText(groupId, text) {
        this.groupConfig[groupId] = { ...this.groupConfig[groupId], welcomeText: text };
        this.saveJsonFile(GROUP_CONFIG_FILE, this.groupConfig);
        return Promise.resolve();
    }

    getWelcomeText(groupId) {
        const config = this.groupConfig[groupId];
        return Promise.resolve(config?.welcomeText || null);
    }

    // Método de limpieza
    close() {
        if (this._pointsTimer) {
            clearTimeout(this._pointsTimer);
            this.flushPointsBuffer();
        }
    }
}

module.exports = new PersistenceTermux();