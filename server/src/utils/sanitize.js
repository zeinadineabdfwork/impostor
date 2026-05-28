// src/utils/sanitize.js
// Funções de limpeza e validação de inputs do utilizador
const xss = require('xss');

/**
 * Limpa e valida um nome de utilizador.
 * Permite: letras, números, underscore, hífen. 2–15 caracteres.
 * @param {string} raw
 * @returns {string|null} — nome limpo ou null se inválido
 */
function sanitizeUsername(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = xss(raw.trim()).replace(/[^a-zA-Z0-9_\-ÀÁÂÃÄÅàáâãäåÉÊéêÍÎíîÓÔÕóôõÚÛúû]/g, '');
  if (cleaned.length < 2 || cleaned.length > 15) return null;
  return cleaned;
}

/**
 * Sanitiza texto de chat — remove HTML mas mantém texto.
 * @param {string} raw
 */
function sanitizeChatMessage(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return xss(raw.trim()).slice(0, 200);
}

/**
 * Sanitiza código de sala.
 * @param {string} raw
 */
function sanitizeRoomCode(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.length >= 4 && cleaned.length <= 8 ? cleaned : null;
}

module.exports = { sanitizeUsername, sanitizeChatMessage, sanitizeRoomCode };
