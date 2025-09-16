// config.js
// Carga de variables de entorno y configuración global

require('dotenv').config();
const os = require('os');
const path = require('path');

// Detectar si estamos en Termux
const isTermux = process.env.PREFIX && process.env.PREFIX.includes('com.termux');

// Configuración de rutas para Termux
const getTermuxPath = (relativePath) => {
    if (isTermux) {
        // En Termux, usar el directorio home del usuario
        return path.join(process.env.HOME, relativePath);
    }
    return relativePath;
};

const config = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    DB_PATH: process.env.DB_PATH || getTermuxPath('./bot_data.sqlite'),
    LOG_LEVEL: process.env.LOG_LEVEL || 'error',
    // Directorio para archivos de autenticación de Baileys
    AUTH_DIR: getTermuxPath('auth_info_baileys'),
    // Directorio para archivos temporales
    TEMP_DIR: isTermux ? process.env.TMPDIR || '/data/data/com.termux/files/usr/tmp' : './tmp',
    // Configuración específica de Termux
    IS_TERMUX: isTermux,
    TERMUX_HOME: isTermux ? process.env.HOME : null,
    // Puerto por defecto para el servidor web
    PORT: process.env.PORT || 3000,
    // Configuración de red para Termux
    HOST: isTermux ? '0.0.0.0' : 'localhost'
};

module.exports = config;
