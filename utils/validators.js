// utils/validators.js
// Validadores para diferentes tipos de entrada del usuario

/**
 * Valida si una cadena es un comando válido
 * @param {string} text - Texto a validar
 * @returns {boolean}
 */
function isValidCommand(text) {
    if (!text || typeof text !== 'string') return false;
    return text.startsWith('/') && text.length > 1;
}

/**
 * Valida formato de fecha (DD/MM/YYYY o DD-MM-YYYY)
 * @param {string} dateString - Fecha a validar
 * @returns {boolean}
 */
function isValidDate(dateString) {
    if (!dateString) return false;
    
    // Formatos soportados: DD/MM/YYYY, DD-MM-YYYY
    const dateRegex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
    const match = dateString.match(dateRegex);
    
    if (!match) return false;
    
    const day = parseInt(match[1]);
    const month = parseInt(match[2]);
    const year = parseInt(match[3]);
    
    // Validaciones básicas
    if (day < 1 || day > 31) return false;
    if (month < 1 || month > 12) return false;
    if (year < 2020 || year > 2030) return false;
    
    // Crear fecha para validación más precisa
    const date = new Date(year, month - 1, day);
    return date.getDate() === day && 
           date.getMonth() === month - 1 && 
           date.getFullYear() === year;
}

/**
 * Valida formato de hora (HH:MM)
 * @param {string} timeString - Hora a validar
 * @returns {boolean}
 */
function isValidTime(timeString) {
    if (!timeString) return false;
    
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
    return timeRegex.test(timeString);
}

/**
 * Valida si un texto es un número válido
 * @param {string} text - Texto a validar
 * @returns {boolean}
 */
function isValidNumber(text) {
    if (!text) return false;
    const num = parseFloat(text);
    return !isNaN(num) && isFinite(num);
}

/**
 * Valida si un texto es un entero positivo
 * @param {string} text - Texto a validar
 * @returns {boolean}
 */
function isValidPositiveInteger(text) {
    if (!text) return false;
    const num = parseInt(text);
    return !isNaN(num) && num > 0 && num.toString() === text;
}

/**
 * Valida si un ID de grupo es válido
 * @param {string} groupId - ID del grupo
 * @returns {boolean}
 */
function isValidGroupId(groupId) {
    if (!groupId) return false;
    // Formato básico de grupo de WhatsApp
    return groupId.endsWith('@g.us') && groupId.length > 15;
}

/**
 * Valida si un ID de usuario es válido para WhatsApp
 * @param {string} userId - ID del usuario
 * @returns {boolean}
 */
function isValidWhatsAppId(userId) {
    if (!userId) return false;
    // Formato: número@s.whatsapp.net
    return /^\d{10,15}@s\.whatsapp\.net$/.test(userId);
}

/**
 * Valida longitud de texto
 * @param {string} text - Texto a validar
 * @param {number} minLength - Longitud mínima
 * @param {number} maxLength - Longitud máxima
 * @returns {boolean}
 */
function isValidLength(text, minLength = 0, maxLength = 1000) {
    if (!text && minLength > 0) return false;
    if (!text) return true; // Permitir texto vacío si minLength es 0
    
    return text.length >= minLength && text.length <= maxLength;
}

/**
 * Valida si el texto contiene solo caracteres seguros (sin comandos maliciosos)
 * @param {string} text - Texto a validar
 * @returns {boolean}
 */
function isSafeText(text) {
    if (!text) return true;
    
    // Evitar caracteres que podrían ser problemáticos
    const dangerousPatterns = [
        /<script/i,
        /javascript:/i,
        /vbscript:/i,
        /onload=/i,
        /onerror=/i,
        /<iframe/i
    ];
    
    return !dangerousPatterns.some(pattern => pattern.test(text));
}

/**
 * Normaliza texto para uso seguro
 * @param {string} text - Texto a normalizar
 * @returns {string}
 */
function normalizeText(text) {
    if (!text) return '';
    
    return text
        .trim()
        .replace(/\s+/g, ' ') // Múltiples espacios a uno solo
        .slice(0, 1000); // Limitar longitud
}

/**
 * Valida argumentos de comando
 * @param {Array} args - Argumentos del comando
 * @param {number} minArgs - Número mínimo de argumentos
 * @param {number} maxArgs - Número máximo de argumentos
 * @returns {boolean}
 */
function validateCommandArgs(args, minArgs = 0, maxArgs = 10) {
    if (!Array.isArray(args)) return false;
    return args.length >= minArgs && args.length <= maxArgs;
}

module.exports = {
    isValidCommand,
    isValidDate,
    isValidTime,
    isValidNumber,
    isValidPositiveInteger,
    isValidGroupId,
    isValidWhatsAppId,
    isValidLength,
    isSafeText,
    normalizeText,
    validateCommandArgs
};