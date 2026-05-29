// src/sockets/roomHandler.js
// Orquestração de salas: criar, entrar, matchmaking e desconexão
const {
  generateRoomCode, createRoomObject, pickTheme, pickImpostorIndex,
  MIN_PLAYERS, MAX_PLAYERS, MAX_ROUNDS,
} = require('../utils/gameLogic');
const { sanitizeUsername, sanitizeRoomCode } = require('../utils/sanitize');

/**
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {Object} activeRooms  — dicionário partilhado em memória
 * @param {Object} socketRoomMap — { socketId → roomCode }
 */
module.exports = function registerRoomHandler(io, socket, activeRooms, socketRoomMap) {

  // ─── Criar sala privada ────────────────────────────────────────────────────
  socket.on('room:create', ({ userId, username, avatarUrl }) => {
    const cleanName = sanitizeUsername(username);
    if (!cleanName) return socket.emit('error', { message: 'Nome inválido.' });

    const roomCode = generateRoomCode(6);
    activeRooms[roomCode] = createRoomObject({
      roomCode, isPrivate: true,
      hostSocketId: socket.id, hostUserId: userId,
      hostUsername: cleanName, hostAvatarUrl: avatarUrl || null,
    });

    socket.join(roomCode);
    socketRoomMap[socket.id] = roomCode;
    socket.emit('room:created', { roomCode, room: sanitizeRoomForClient(activeRooms[roomCode]) });
    console.log(`[Room] Created private room ${roomCode} by ${cleanName}`);
  });

  // ─── Entrar numa sala privada ──────────────────────────────────────────────
  socket.on('room:join', ({ roomCode, userId, username, avatarUrl }) => {
    const code  = sanitizeRoomCode(roomCode);
    const name  = sanitizeUsername(username);
    if (!code || !name) return socket.emit('error', { message: 'Dados inválidos.' });

    const room = activeRooms[code];
    if (!room)             return socket.emit('error', { message: 'Sala não encontrada.' });
    if (room.status !== 'LOBBY') return socket.emit('error', { message: 'Jogo já em curso.' });
    if (room.players.length >= MAX_PLAYERS) return socket.emit('error', { message: 'Sala cheia.' });

    const player = buildPlayer(socket.id, userId, name, avatarUrl);
    room.players.push(player);
    socket.join(code);
    socketRoomMap[socket.id] = code;

    io.to(code).emit('room:player-joined', { players: sanitizePlayers(room.players) });
    socket.emit('room:joined', { roomCode: code, room: sanitizeRoomForClient(room) });
    console.log(`[Room] ${name} joined private room ${code}`);
  });

  // ─── Quick Matchmaking (Battle Royal) ─────────────────────────────────────
  socket.on('room:quickmatch', ({ userId, username, avatarUrl }) => {
    const name = sanitizeUsername(username);
    console.log(`[Matchmaking] quickmatch request from ${socket.id} | userId=${userId} username=${name}`);
    if (!name) return socket.emit('error', { message: 'Nome inválido.' });

    // Procurar sala pública com vagas
    let targetRoom = null;
    for (const code in activeRooms) {
      const r = activeRooms[code];
      if (!r.isPrivate && r.status === 'LOBBY' && r.players.length < MAX_PLAYERS) {
        targetRoom = r;
        break;
      }
    }

    if (targetRoom) {
      const player = buildPlayer(socket.id, userId, name, avatarUrl);
      targetRoom.players.push(player);
      socket.join(targetRoom.roomId);
      socketRoomMap[socket.id] = targetRoom.roomId;
      io.to(targetRoom.roomId).emit('room:player-joined', { players: sanitizePlayers(targetRoom.players) });
      socket.emit('room:joined', { roomCode: targetRoom.roomId, room: sanitizeRoomForClient(targetRoom) });
      console.log(`[Matchmaking] ${name} joined existing room ${targetRoom.roomId}`);
      maybeAutoStartPublicRoom(io, targetRoom);
    } else {
      // Criar nova sala pública
      const roomCode = generateRoomCode(6);
      activeRooms[roomCode] = createRoomObject({
        roomCode, isPrivate: false,
        hostSocketId: socket.id, hostUserId: userId,
        hostUsername: name, hostAvatarUrl: avatarUrl || null,
      });
      socket.join(roomCode);
      socketRoomMap[socket.id] = roomCode;
      socket.emit('room:created', { roomCode, room: sanitizeRoomForClient(activeRooms[roomCode]) });
      console.log(`[Matchmaking] ${name} created new public room ${roomCode}`);
    }
  });

  // ─── Host inicia a partida ─────────────────────────────────────────────────
  socket.on('room:start', ({ roomCode }) => {
    const room = activeRooms[roomCode];
    if (!room) return socket.emit('error', { message: 'Sala não encontrada.' });
    if (room.players[0].socketId !== socket.id) return socket.emit('error', { message: 'Só o host pode iniciar.' });
    if (room.players.length < MIN_PLAYERS) {
      return socket.emit('error', { message: `Mínimo de ${MIN_PLAYERS} jogadores necessários.` });
    }
    if (room.status !== 'LOBBY') return socket.emit('error', { message: 'Jogo já em curso.' });

    console.log(`[Room] Starting game in ${roomCode} by host ${socket.userId}`);
    startGame(io, room);
  });

  // ─── Desconexão ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const roomCode = socketRoomMap[socket.id];
    if (!roomCode || !activeRooms[roomCode]) return;

    const room  = activeRooms[roomCode];
    const pIdx  = room.players.findIndex(p => p.socketId === socket.id);
    if (pIdx === -1) return;

    room.players[pIdx].connected = false;
    io.to(roomCode).emit('room:player-disconnected', { username: room.players[pIdx].username });

    // Tolerância de 25s antes de remover
    const TOLERANCE = parseInt(process.env.DISCONNECT_TOLERANCE_SECONDS || '25', 10) * 1000;
    setTimeout(() => {
      if (!activeRooms[roomCode]) return;
      if (!activeRooms[roomCode].players[pIdx]?.connected) {
        activeRooms[roomCode].players.splice(pIdx, 1);
        delete socketRoomMap[socket.id];
        if (activeRooms[roomCode].players.length === 0) {
          delete activeRooms[roomCode];
          console.log(`[Room] Empty room ${roomCode} cleaned up.`);
        } else {
          io.to(roomCode).emit('room:player-left', { players: sanitizePlayers(activeRooms[roomCode].players) });
        }
      }
    }, TOLERANCE);
  });

  // ─── Reconexão ─────────────────────────────────────────────────────────────
  socket.on('room:reconnect', ({ roomCode, userId }) => {
    const code = sanitizeRoomCode(roomCode);
    if (!code || !activeRooms[code]) return socket.emit('error', { message: 'Sala expirou.' });

    const room = activeRooms[code];
    const player = room.players.find(p => p.userId === userId);
    if (!player) return socket.emit('error', { message: 'Jogador não encontrado na sala.' });

    player.socketId  = socket.id;
    player.connected = true;
    socket.join(code);
    socketRoomMap[socket.id] = code;

    // Enviar estado completo para re-sincronização
    socket.emit('room:state-sync', {
      room: sanitizeRoomForClient(room),
      canvasState: room.canvasState,
    });
    io.to(code).emit('room:player-reconnected', { username: player.username });
    console.log(`[Room] ${player.username} reconnected to ${code}`);
  });
};

// ─── Helpers internos ────────────────────────────────────────────────────────
function buildPlayer(socketId, userId, username, avatarUrl) {
  return {
    socketId,
    userId:    userId || `guest_${socketId.slice(0,8)}`,
    username,
    avatarUrl: avatarUrl || null,
    role:      'innocent',
    turnsLeft: parseInt(process.env.MAX_ROUNDS || '6', 10),
    score:     0,
    hasVoted:  false,
    votedFor:  null,
    connected: true,
  };
}

function sanitizePlayers(players) {
  return players.map(({ socketId, userId, username, avatarUrl, role: _r, score, turnsLeft, connected }) => ({
    socketId, userId, username, avatarUrl, score, turnsLeft, connected,
    // role NÃO é enviado publicamente — apenas via evento privado ao próprio jogador
  }));
}

function sanitizeRoomForClient(room) {
  return {
    roomId:    room.roomId,
    isPrivate: room.isPrivate,
    status:    room.status,
    players:   sanitizePlayers(room.players),
    currentRound:     room.currentRound,
    totalRounds:      MAX_ROUNDS,
    currentTurnIndex: room.currentTurnIndex,
  };
}

function maybeAutoStartPublicRoom(io, room) {
    if (!room || room.isPrivate || room.status !== 'LOBBY') return;
    if (room.players.length < MIN_PLAYERS) return;

    console.log(`[Matchmaking] Room ${room.roomId} reached ${MIN_PLAYERS} players and will auto-start.`);
    startGame(io, room);
  }

  function startGame(io, room) {
  const theme = pickTheme();
  const impIdx = pickImpostorIndex(room.players.length);

  room.status       = 'PLAYING';
  room.currentTheme = theme;
  room.impostorIndex = impIdx;
  room.currentRound  = 1;
  room.currentTurnIndex = 0;
  room.canvasState   = [];

  // Atribuir papéis
  room.players.forEach((p, i) => {
    p.role      = i === impIdx ? 'impostor' : 'innocent';
    p.turnsLeft = parseInt(process.env.MAX_ROUNDS || '6', 10);
    p.hasVoted  = false;
    p.votedFor  = null;
    p.score     = 0;
  });

  // Emitir role individual (privado)
  room.players.forEach((p) => {
    const word = p.role === 'impostor' ? theme.impostorWord : theme.word;
    io.to(p.socketId).emit('game:role-assigned', {
      role: p.role,
      themeCategory: theme.category,
      word,
    });
  });

  // Emitir início de jogo publicamente
  io.to(room.roomId).emit('game:started', {
    players:          sanitizePlayers(room.players),
    currentTurnIndex: room.currentTurnIndex,
    totalRounds:      MAX_ROUNDS,
    currentRound:     1,
    themeCategory:    theme.category,
  });

  console.log(`[Game] Started in room ${room.roomId} | impostor: ${room.players[impIdx].username}`);
}

module.exports.startGame          = startGame;
module.exports.sanitizePlayers    = sanitizePlayers;
module.exports.sanitizeRoomForClient = sanitizeRoomForClient;
