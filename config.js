// config.js
// Carga de variables de entorno y configuración global

require('dotenv').config();

const config = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    DB_PATH: process.env.DB_PATH || './bot_data.sqlite',
    LOG_LEVEL: process.env.LOG_LEVEL || 'error',
    // Agrega aquí otras variables necesarias
};

module.exports = config;
