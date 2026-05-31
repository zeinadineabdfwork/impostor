// src/sockets/roomHandler.js
// Orquestração de salas: criar, entrar, matchmaking e desconexão

const {
  generateRoomCode, generateMatchmakingCode,
  createRoomObject, pickTheme, pickImpostorIndex,
  MIN_PLAYERS, MAX_PLAYERS, MAX_ROUNDS,
} = require('../utils/gameLogic');
const { sanitizeUsername, sanitizeRoomCode } = require('../utils/sanitize');

// ── Pool de matchmaking público ───────────────────────────────────────────────
// Cada entrada: { code, createdAt }
// Quando tem MIN_PLAYERS utilizadores nessa sala → jogo começa automaticamente
let _currentPublicCode = null;
let _currentPublicCreatedAt = null;
const PUBLIC_CODE_TTL = 90 * 1000; // 90 segundos — depois gera novo código

function getOrCreatePublicCode() {
  const now = Date.now();
  // Se não há código ou expirou, criar novo
  if (!_currentPublicCode || (now - _currentPublicCreatedAt) > PUBLIC_CODE_TTL) {
    _currentPublicCode = generateMatchmakingCode();
    _currentPublicCreatedAt = now;
    console.log(`[Matchmaking] Novo código público gerado: ${_currentPublicCode}`);
  }
  return _currentPublicCode;
}

function resetPublicCode() {
  _currentPublicCode = null;
  _currentPublicCreatedAt = null;
}

/**
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {Object} activeRooms   — dicionário partilhado em memória
 * @param {Object} socketRoomMap — { socketId → roomCode }
 */
module.exports = function registerRoomHandler(io, socket, activeRooms, socketRoomMap) {

  // ─── Criar sala privada com código escolhido pelo utilizador ──────────────
  socket.on('room:create', ({ userId, username, avatarUrl, customCode }) => {
    const cleanName = sanitizeUsername(username);
    if (!cleanName) return socket.emit('error', { message: 'Nome inválido.' });

    let roomCode;

    if (customCode) {
      // Validar código personalizado: 4-12 caracteres alfanuméricos
      const cleaned = customCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
      if (cleaned.length < 4) {
        return socket.emit('error', { message: 'Código deve ter pelo menos 4 caracteres.' });
      }
      if (activeRooms[cleaned]) {
        return socket.emit('error', { message: 'Este código já está em uso. Escolhe outro.' });
      }
      roomCode = cleaned;
      console.log(`[Room] Criando sala privada com código personalizado: ${roomCode} por ${cleanName}`);
    } else {
      // Código aleatório se não foi fornecido
      roomCode = generateRoomCode(6);
      console.log(`[Room] Criando sala privada com código aleatório: ${roomCode} por ${cleanName}`);
    }

    activeRooms[roomCode] = createRoomObject({
      roomCode, isPrivate: true,
      hostSocketId: socket.id, hostUserId: userId,
      hostUsername: cleanName, hostAvatarUrl: avatarUrl || null,
    });

    socket.join(roomCode);
    socketRoomMap[socket.id] = roomCode;
    socket.emit('room:created', { roomCode, room: sanitizeRoomForClient(activeRooms[roomCode]) });
    console.log(`[Room] Sala privada ${roomCode} criada por ${cleanName}`);
  });

  // ─── Entrar numa sala privada pelo código ──────────────────────────────────
  socket.on('room:join', ({ roomCode, userId, username, avatarUrl }) => {
    const code = sanitizeRoomCode(roomCode);
    const name = sanitizeUsername(username);
    if (!code || !name) return socket.emit('error', { message: 'Dados inválidos.' });

    const room = activeRooms[code];
    if (!room)                    return socket.emit('error', { message: 'Sala não encontrada. Verifica o código.' });
    if (room.status !== 'LOBBY')  return socket.emit('error', { message: 'Jogo já em curso nesta sala.' });
    if (room.players.length >= MAX_PLAYERS) return socket.emit('error', { message: 'Sala cheia.' });

    const player = buildPlayer(socket.id, userId, name, avatarUrl);
    room.players.push(player);
    socket.join(code);
    socketRoomMap[socket.id] = code;

    io.to(code).emit('room:player-joined', { players: sanitizePlayers(room.players) });
    socket.emit('room:joined', { roomCode: code, room: sanitizeRoomForClient(room) });
    console.log(`[Room] ${name} entrou na sala privada ${code} (${room.players.length}/${MAX_PLAYERS})`);
  });

  // ─── Quick Matchmaking ─────────────────────────────────────────────────────
  // Lógica:
  //  1. Gera (ou reutiliza) um código público partilhado
  //  2. Envia esse código ao utilizador para ele "ver" que está a entrar
  //  3. Coloca-o na sala com esse código
  //  4. Quando MIN_PLAYERS chegarem → jogo começa automaticamente
  //  5. Depois do jogo começar, o próximo quickplay gera um código novo
  socket.on('room:quickmatch', ({ userId, username, avatarUrl }) => {
    const name = sanitizeUsername(username);
    if (!name) return socket.emit('error', { message: 'Nome inválido.' });

    const publicCode = getOrCreatePublicCode();
    console.log(`[Matchmaking] ${name} (${socket.id}) a entrar no código público: ${publicCode}`);

    // Sala ainda não existe → criar
    if (!activeRooms[publicCode]) {
      activeRooms[publicCode] = createRoomObject({
        roomCode: publicCode, isPrivate: false,
        hostSocketId: socket.id, hostUserId: userId,
        hostUsername: name, hostAvatarUrl: avatarUrl || null,
      });
      socket.join(publicCode);
      socketRoomMap[socket.id] = publicCode;
      socket.emit('room:joined', { roomCode: publicCode, room: sanitizeRoomForClient(activeRooms[publicCode]) });
      console.log(`[Matchmaking] Sala ${publicCode} criada. Jogadores: 1/${MIN_PLAYERS}`);
    } else {
      // Sala existe → entrar
      const room = activeRooms[publicCode];

      if (room.status !== 'LOBBY') {
        // Esta sala já começou — forçar novo código e tentar de novo
        resetPublicCode();
        const newCode = getOrCreatePublicCode();
        console.log(`[Matchmaking] Sala ${publicCode} já em jogo. Novo código: ${newCode}`);
        activeRooms[newCode] = createRoomObject({
          roomCode: newCode, isPrivate: false,
          hostSocketId: socket.id, hostUserId: userId,
          hostUsername: name, hostAvatarUrl: avatarUrl || null,
        });
        socket.join(newCode);
        socketRoomMap[socket.id] = newCode;
        socket.emit('room:joined', { roomCode: newCode, room: sanitizeRoomForClient(activeRooms[newCode]) });
        console.log(`[Matchmaking] Sala ${newCode} criada. Jogadores: 1/${MIN_PLAYERS}`);
        return;
      }

      if (room.players.length >= MAX_PLAYERS) {
        resetPublicCode();
        return socket.emit('error', { message: 'Sala cheia, tenta novamente.' });
      }

      const player = buildPlayer(socket.id, userId, name, avatarUrl);
      room.players.push(player);
      socket.join(publicCode);
      socketRoomMap[socket.id] = publicCode;

      io.to(publicCode).emit('room:player-joined', { players: sanitizePlayers(room.players) });
      socket.emit('room:joined', { roomCode: publicCode, room: sanitizeRoomForClient(room) });
      console.log(`[Matchmaking] ${name} entrou em ${publicCode}. Jogadores: ${room.players.length}/${MIN_PLAYERS}`);

      // Verificar se atingiu o mínimo → iniciar automaticamente
      if (room.players.length >= MIN_PLAYERS) {
        console.log(`[Matchmaking] Sala ${publicCode} com ${room.players.length} jogadores → a iniciar jogo!`);
        resetPublicCode(); // próximo quickplay terá novo código
        setTimeout(() => startGame(io, room), 1500);
      }
    }
  });

  // ─── Host inicia a partida manualmente (sala privada) ─────────────────────
  socket.on('room:start', ({ roomCode }) => {
    const room = activeRooms[roomCode];
    if (!room) return socket.emit('error', { message: 'Sala não encontrada.' });
    if (room.players[0].socketId !== socket.id) return socket.emit('error', { message: 'Só o host pode iniciar.' });
    if (room.players.length < MIN_PLAYERS) {
      return socket.emit('error', { message: `Mínimo de ${MIN_PLAYERS} jogadores necessários.` });
    }
    if (room.status !== 'LOBBY') return socket.emit('error', { message: 'Jogo já em curso.' });

    console.log(`[Room] Host ${socket.id} a iniciar jogo em ${roomCode}`);
    startGame(io, room);
  });

  // ─── Desconexão ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const roomCode = socketRoomMap[socket.id];
    if (!roomCode || !activeRooms[roomCode]) return;

    const room = activeRooms[roomCode];
    const pIdx = room.players.findIndex(p => p.socketId === socket.id);
    if (pIdx === -1) return;

    room.players[pIdx].connected = false;
    io.to(roomCode).emit('room:player-disconnected', { username: room.players[pIdx].username });
    console.log(`[Room] ${room.players[pIdx].username} desconectou de ${roomCode}`);

    const TOLERANCE = parseInt(process.env.DISCONNECT_TOLERANCE_SECONDS || '25', 10) * 1000;
    setTimeout(() => {
      if (!activeRooms[roomCode]) return;
      if (!activeRooms[roomCode].players[pIdx]?.connected) {
        const leaving = activeRooms[roomCode].players.splice(pIdx, 1)[0];
        delete socketRoomMap[socket.id];
        console.log(`[Room] ${leaving?.username} removido de ${roomCode}. Restantes: ${activeRooms[roomCode].players.length}`);
        if (activeRooms[roomCode].players.length === 0) {
          delete activeRooms[roomCode];
          console.log(`[Room] Sala ${roomCode} eliminada (vazia).`);
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

    const room   = activeRooms[code];
    const player = room.players.find(p => p.userId === userId);
    if (!player) return socket.emit('error', { message: 'Jogador não encontrado na sala.' });

    player.socketId  = socket.id;
    player.connected = true;
    socket.join(code);
    socketRoomMap[socket.id] = code;

    socket.emit('room:state-sync', { room: sanitizeRoomForClient(room), canvasState: room.canvasState });
    io.to(code).emit('room:player-reconnected', { username: player.username });
    console.log(`[Room] ${player.username} reconectou a ${code}`);
  });
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  return players.map(({ socketId, userId, username, avatarUrl, score, turnsLeft, connected }) => ({
    socketId, userId, username, avatarUrl, score, turnsLeft, connected,
    // role NÃO enviado publicamente — só via evento privado ao próprio jogador
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

function startGame(io, room) {
  const theme   = pickTheme();
  const impIdx  = pickImpostorIndex(room.players.length);

  room.status        = 'PLAYING';
  room.currentTheme  = theme;
  room.impostorIndex = impIdx;
  room.currentRound  = 1;
  room.currentTurnIndex = 0;
  room.canvasState   = [];

  room.players.forEach((p, i) => {
    p.role      = i === impIdx ? 'impostor' : 'innocent';
    p.turnsLeft = parseInt(process.env.MAX_ROUNDS || '6', 10);
    p.hasVoted  = false;
    p.votedFor  = null;
    p.score     = 0;
  });

  room.players.forEach((p) => {
    const word = p.role === 'impostor' ? theme.impostorWord : theme.word;
    io.to(p.socketId).emit('game:role-assigned', {
      role: p.role, themeCategory: theme.category, word,
    });
  });

  io.to(room.roomId).emit('game:started', {
    players:          sanitizePlayers(room.players),
    currentTurnIndex: room.currentTurnIndex,
    totalRounds:      MAX_ROUNDS,
    currentRound:     1,
    themeCategory:    theme.category,
  });

  console.log(`[Game] Iniciado em ${room.roomId} | Impostor: ${room.players[impIdx].username} | Tema: ${theme.word}`);
}

module.exports.startGame             = startGame;
module.exports.sanitizePlayers       = sanitizePlayers;
module.exports.sanitizeRoomForClient = sanitizeRoomForClient;
