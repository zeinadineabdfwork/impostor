// src/middlewares/authMiddleware.js
// Interceptador JWT para rotas HTTP protegidas
const jwt = require('jsonwebtoken');

/**
 * Valida o Bearer token no header Authorization.
 * Injeta req.userId e req.userType no request.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autorização em falta.' });
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId   = decoded.sub;
    req.userType = decoded.type || 'registered';
    req.username = decoded.username || null; // para guests
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

/**
 * Valida token de socket no handshake do Socket.io.
 * Retorna o payload decodificado ou lança erro.
 */
function verifySocketToken(token) {
  if (!token) throw new Error('Token ausente no socket.');
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { requireAuth, verifySocketToken };
