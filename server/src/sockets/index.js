// src/sockets/index.js
// Ponto central de acoplamento do Socket.io
// Autentica o handshake e regista todos os handlers

const { verifySocketToken } = require('../middlewares/authMiddleware');
const registerRoomHandler   = require('./roomHandler');
const registerGameHandler   = require('./gameHandler');

// Dicionário de estado em memória (RAM)
// Chave: roomCode | Valor: objeto de sala (ver gameLogic.createRoomObject)
const activeRooms  = {};

// Mapa inverso: socketId → roomCode (para lookup O(1) na desconexão)
const socketRoomMap = {};

/**
 * @param {import('socket.io').Server} io
 */
module.exports = function initSockets(io) {

  // ── Middleware de autenticação do handshake ──────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('AUTH_MISSING'));
    try {
      const decoded = verifySocketToken(token);
      socket.userId   = decoded.sub;
      socket.username = decoded.username || null;
      socket.userType = decoded.type || 'registered';
      return next();
    } catch (err) {
      return next(new Error('AUTH_INVALID'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id} | user: ${socket.userId}`);

    // Registar handlers modulares
    registerRoomHandler(io, socket, activeRooms, socketRoomMap);
    registerGameHandler(io, socket, activeRooms, socketRoomMap);

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected: ${socket.id} | reason: ${reason}`);
    });

    // Ping de saúde (evita timeout em Render free tier)
    socket.on('ping:keep-alive', () => socket.emit('pong:keep-alive'));
  });

  // Estatísticas de salas activas (usado pelo endpoint /health)
  function getRoomStats() {
    const total   = Object.keys(activeRooms).length;
    const playing = Object.values(activeRooms).filter(r => r.status === 'PLAYING').length;
    const lobby   = Object.values(activeRooms).filter(r => r.status === 'LOBBY').length;
    const players = Object.values(activeRooms).reduce((s, r) => s + r.players.length, 0);
    return { total, playing, lobby, players };
  }

  return { activeRooms, socketRoomMap, getRoomStats };
};
