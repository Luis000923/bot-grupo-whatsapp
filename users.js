// users.js
// Manejo de usuarios y sus datos

/**
 * Extrae el ID del usuario desde diferentes formatos
 * @param {string} input - Puede ser @usuario, número de teléfono, o referencia
 * @returns {string|null} - ID limpio del usuario o null si no es válido
 */
function extractUserId(input) {
    if (!input) return null;
    
    // Remover @ si existe
    let cleaned = input.replace('@', '');
    
    // Si es un número de teléfono, asegurar formato correcto
    if (/^\d+$/.test(cleaned)) {
        // Agregar código de país si no lo tiene
        if (!cleaned.includes('@')) {
            cleaned = cleaned + '@s.whatsapp.net';
        }
    }
    
    return cleaned;
}

/**
 * Valida si un ID de usuario es válido
 * @param {string} userId - ID del usuario
 * @returns {boolean}
 */
function isValidUserId(userId) {
    if (!userId) return false;
    
    // Formato básico de WhatsApp ID
    return /^\d+@(s\.whatsapp\.net|g\.us)$/.test(userId) || /^\d+$/.test(userId);
}

/**
 * Formatea un ID de usuario para mostrar
 * @param {string} userId - ID del usuario
 * @returns {string} - Formato de visualización
 */
function formatUserDisplay(userId) {
    if (!userId) return 'Usuario desconocido';
    
    // Extraer solo el número
    const number = userId.split('@')[0];
    return `@${number}`;
}

/**
 * Obtiene información básica del usuario desde metadata del grupo
 * @param {Object} groupMetadata - Metadata del grupo
 * @param {string} userId - ID del usuario
 * @returns {Object|null} - Información del usuario
 */
function getUserInfo(groupMetadata, userId) {
    if (!groupMetadata || !groupMetadata.participants || !userId) return null;
    
    const participant = groupMetadata.participants.find(p => p.id === userId);
    
    if (!participant) return null;
    
    return {
        id: participant.id,
        isAdmin: participant.admin === 'admin' || participant.admin === 'superadmin',
        isSuperAdmin: participant.admin === 'superadmin',
        displayName: formatUserDisplay(participant.id)
    };
}

/**
 * Verifica si un usuario es administrador del grupo
 * @param {Object} groupMetadata - Metadata del grupo
 * @param {string} userId - ID del usuario
 * @returns {boolean}
 */
function isUserAdmin(groupMetadata, userId) {
    const userInfo = getUserInfo(groupMetadata, userId);
    return userInfo ? userInfo.isAdmin : false;
}

/**
 * Obtiene lista de administradores del grupo
 * @param {Object} groupMetadata - Metadata del grupo
 * @returns {Array} - Array de IDs de administradores
 */
function getGroupAdmins(groupMetadata) {
    if (!groupMetadata || !groupMetadata.participants) return [];
    
    return groupMetadata.participants
        .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
        .map(p => p.id);
}

/**
 * Obtiene lista de participantes regulares (no admins) del grupo
 * @param {Object} groupMetadata - Metadata del grupo
 * @param {string} botId - ID del bot para excluirlo
 * @returns {Array} - Array de IDs de participantes regulares
 */
function getRegularParticipants(groupMetadata, botId = null) {
    if (!groupMetadata || !groupMetadata.participants) return [];
    
    return groupMetadata.participants
        .filter(p => {
            // No incluir admins
            if (p.admin === 'admin' || p.admin === 'superadmin') return false;
            // No incluir el bot
            if (botId && p.id === botId) return false;
            return true;
        })
        .map(p => p.id);
}

/**
 * Obtiene todos los participantes del grupo excepto el bot
 * @param {Object} groupMetadata - Metadata del grupo
 * @param {string} botId - ID del bot para excluirlo
 * @returns {Array} - Array de IDs de todos los participantes
 */
function getAllParticipants(groupMetadata, botId = null) {
    if (!groupMetadata || !groupMetadata.participants) return [];
    
    return groupMetadata.participants
        .filter(p => botId ? p.id !== botId : true)
        .map(p => p.id);
}

module.exports = {
    extractUserId,
    isValidUserId,
    formatUserDisplay,
    getUserInfo,
    isUserAdmin,
    getGroupAdmins,
    getRegularParticipants,
    getAllParticipants
};