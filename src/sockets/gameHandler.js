// src/sockets/gameHandler.js
// Loop do jogo: traços, turnos, votação e resultados
const {
  euclideanDistance, isStrokeOverLimit, calculateScores,
  MAX_STROKE_LENGTH, MAX_ROUNDS, MIN_PLAYERS,
} = require('../utils/gameLogic');
const { query } = require('../config/database');
const { sanitizePlayers } = require('./roomHandler');
const { v4: uuidv4 } = require('uuid');

const VOTE_TIMEOUT    = parseInt(process.env.VOTE_TIMEOUT_SECONDS    || '25', 10) * 1000;
const TURN_TIMEOUT    = parseInt(process.env.TURN_TIMEOUT_SECONDS    || '30', 10) * 1000;

/**
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {Object} activeRooms
 * @param {Object} socketRoomMap
 */
module.exports = function registerGameHandler(io, socket, activeRooms, socketRoomMap) {

  // ─── Streaming de traço (mouse/touch move) ─────────────────────────────────
  socket.on('draw:stream', ({ x, y, state, color, size }) => {
    const roomCode = socketRoomMap[socket.id];
    if (!roomCode) return;
    const room = activeRooms[roomCode];
    if (!room || room.status !== 'PLAYING') return;

    // Anti-cheat: só o jogador do turno actual pode enviar traços
    const currentPlayer = room.players[room.currentTurnIndex];
    if (!currentPlayer || currentPlayer.socketId !== socket.id) return;

    // Re-transmitir para os outros jogadores (relay síncrono)
    socket.to(roomCode).emit('draw:stream', { x, y, state, color, size });

    // Guardar no buffer (para re-sincronização de reconexões)
    room.canvasState.push({ x, y, state, color, size, ts: Date.now() });
    // Limitar buffer a 5000 pontos para não estourar memória
    if (room.canvasState.length > 5000) room.canvasState.splice(0, 100);
  });

  // ─── Início de traço ─────────────────────────────────────────────────────
  socket.on('draw:start', ({ x, y, color, size }) => {
    const roomCode = socketRoomMap[socket.id];
    if (!roomCode) return;
    const room = activeRooms[roomCode];
    if (!room || room.status !== 'PLAYING') return;

    const currentPlayer = room.players[room.currentTurnIndex];
    if (!currentPlayer || currentPlayer.socketId !== socket.id) return;

    room._strokeLength = 0;
    room._lastPoint    = { x, y };

    socket.to(roomCode).emit('draw:start', { x, y, color, size });
    room.canvasState.push({ x, y, state: 'start', color, size, ts: Date.now() });
  });

  // ─── Ponto de traço com validação de comprimento ───────────────────────────
  socket.on('draw:point', ({ x, y }) => {
    const roomCode = socketRoomMap[socket.id];
    if (!roomCode) return;
    const room = activeRooms[roomCode];
    if (!room || room.status !== 'PLAYING') return;

    const currentPlayer = room.players[room.currentTurnIndex];
    if (!currentPlayer || currentPlayer.socketId !== socket.id) return;
    if (!room._lastPoint) return;

    const dist = euclideanDistance(room._lastPoint, { x, y });
    room._strokeLength = (room._strokeLength || 0) + dist;
    room._lastPoint    = { x, y };

    // Barreira anti-cheat no servidor
    if (isStrokeOverLimit(room._strokeLength)) {
      socket.emit('draw:force-stop');
      endTurn(io, socket, room, roomCode);
      return;
    }

    socket.to(roomCode).emit('draw:point', { x, y });
  });

  // ─── Fim de traço (pointerup / touchend) ──────────────────────────────────
  socket.on('draw:end', () => {
    const roomCode = socketRoomMap[socket.id];
    if (!roomCode) return;
    const room = activeRooms[roomCode];
    if (!room || room.status !== 'PLAYING') return;

    const currentPlayer = room.players[room.currentTurnIndex];
    if (!currentPlayer || currentPlayer.socketId !== socket.id) return;

    socket.to(roomCode).emit('draw:end');
    endTurn(io, socket, room, roomCode);
  });

  // ─── Votação ───────────────────────────────────────────────────────────────
  socket.on('vote:cast', ({ targetSocketId }) => {
    const roomCode = socketRoomMap[socket.id];
    if (!roomCode) return;
    const room = activeRooms[roomCode];
    if (!room || room.status !== 'VOTING') return;

    const voter = room.players.find(p => p.socketId === socket.id);
    if (!voter || voter.hasVoted) return; // voto duplo bloqueado

    voter.hasVoted = true;
    voter.votedFor = targetSocketId;

    // Incrementar contador de votos no alvo
    room.votesReceived[targetSocketId] = (room.votesReceived[targetSocketId] || 0) + 1;

    io.to(roomCode).emit('vote:update', {
      voterName:   voter.username,
      votesMap:    room.votesReceived,
      totalVoters: room.players.filter(p => !p.eliminated).length,
      votesIn:     room.players.filter(p => p.hasVoted).length,
    });

    // Verificar se todos votaram
    const activePlayers = room.players.filter(p => !p.eliminated);
    const allVoted = activePlayers.every(p => p.hasVoted);
    if (allVoted) {
      clearTimeout(room._voteTimer);
      resolveVote(io, room, roomCode);
    }
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// FUNÇÕES INTERNAS
// ═══════════════════════════════════════════════════════════════════════════════

function endTurn(io, socket, room, roomCode) {
  clearTimeout(room._turnTimer);
  room._strokeLength = 0;
  room._lastPoint    = null;

  // Decrementar turno do jogador actual
  const current = room.players[room.currentTurnIndex];
  if (current) current.turnsLeft = Math.max(0, current.turnsLeft - 1);

  // Avançar para o próximo jogador
  const totalPlayers = room.players.length;
  let nextIdx = (room.currentTurnIndex + 1) % totalPlayers;
  let safety  = totalPlayers;
  while (room.players[nextIdx]?.eliminated && safety-- > 0) {
    nextIdx = (nextIdx + 1) % totalPlayers;
  }

  const roundComplete = nextIdx <= room.currentTurnIndex;
  room.currentTurnIndex = nextIdx;

  io.to(roomCode).emit('game:turn-change', {
    currentTurnIndex: room.currentTurnIndex,
    players: sanitizePlayers(room.players),
    currentRound: room.currentRound,
  });

  if (roundComplete) {
    // Rodada completa → fase de votação
    room.currentRound++;
    io.to(roomCode).emit('game:round-complete', { round: room.currentRound - 1 });

    // Verificar se esgotou todas as rodadas
    if (room.currentRound > MAX_ROUNDS) {
      // Impostor sobreviveu → vitória do impostor
      return resolveGameOver(io, room, roomCode, false);
    }

    // Iniciar votação
    setTimeout(() => startVoting(io, room, roomCode), 800);
  } else {
    // Próximo turno com timer de segurança
    room._turnTimer = setTimeout(() => {
      // Se o jogador não agiu no tempo, passa o turno
      const curr = room.players[room.currentTurnIndex];
      if (curr && curr.connected) {
        io.to(curr.socketId).emit('draw:force-stop');
      }
      endTurn(io, null, room, roomCode);
    }, TURN_TIMEOUT);
  }
}

function startVoting(io, room, roomCode) {
  room.status = 'VOTING';
  room.players.forEach(p => { p.hasVoted = false; p.votedFor = null; });
  room.votesReceived = {};

  io.to(roomCode).emit('game:voting-started', {
    players: sanitizePlayers(room.players),
    timeoutSeconds: parseInt(process.env.VOTE_TIMEOUT_SECONDS || '25', 10),
  });

  // Timer automático: se não votarem todos, resolve com os votos existentes
  room._voteTimer = setTimeout(() => {
    resolveVote(io, room, roomCode);
  }, VOTE_TIMEOUT);
}

function resolveVote(io, room, roomCode) {
  // Apurar o jogador mais votado
  let maxVotes = 0;
  let eliminatedSocketId = null;
  for (const [sid, count] of Object.entries(room.votesReceived)) {
    if (count > maxVotes) { maxVotes = count; eliminatedSocketId = sid; }
  }

  const impostorSocketId = room.players[room.impostorIndex]?.socketId;
  const impostorCaught   = eliminatedSocketId === impostorSocketId;

  if (impostorCaught) {
    return resolveGameOver(io, room, roomCode, true);
  } else {
    // Jogador errado eliminado ou ninguém votou suficientemente
    if (eliminatedSocketId) {
      const eliminated = room.players.find(p => p.socketId === eliminatedSocketId);
      if (eliminated) eliminated.eliminated = true;
      io.to(roomCode).emit('game:player-eliminated', { username: eliminated?.username });
    }

    // Se restam menos de MIN_PLAYERS activos → impostor ganha
    const activePlayers = room.players.filter(p => !p.eliminated);
    if (activePlayers.length < MIN_PLAYERS - 1) {
      return resolveGameOver(io, room, roomCode, false);
    }

    // Continuar jogo — resetar para nova rodada
    room.status = 'PLAYING';
    io.to(roomCode).emit('game:voting-ended', {
      eliminatedSocketId,
      impostorCaught: false,
      players: sanitizePlayers(room.players),
    });
  }
}

async function resolveGameOver(io, room, roomCode, impostorCaught) {
  room.status = 'FINISHED';
  const impostorSocketId = room.players[room.impostorIndex]?.socketId;

  const scored = calculateScores(
    room.players.map(p => ({ ...p, id: p.socketId })),
    impostorSocketId,
    impostorCaught,
    impostorCaught ? room.currentRound : 0
  );

  io.to(roomCode).emit('game:over', {
    impostorCaught,
    winner:        impostorCaught ? 'innocent' : 'impostor',
    impostorSocketId,
    players:       scored,
    totalRounds:   room.currentRound - 1,
  });

  // Persistir resultado no banco
  try {
    await persistMatchResult(room, scored, impostorCaught);
  } catch (err) {
    console.error('[GameHandler] Failed to persist match result:', err.message);
  }

  // Limpar sala após 30s
  setTimeout(() => { delete activeRooms?.[roomCode]; }, 30000);
}

async function persistMatchResult(room, scoredPlayers, impostorCaught) {
  const matchId = uuidv4();
  await query(
    `INSERT INTO match_history (id, room_code, winner_role, total_rounds_played)
     VALUES ($1, $2, $3, $4)`,
    [matchId, room.roomId, impostorCaught ? 'innocent' : 'impostor', room.currentRound - 1]
  );

  for (const p of scoredPlayers) {
    if (p.userId?.startsWith('guest_')) continue; // Não guardar guests
    await query(
      `INSERT INTO match_participants (id, match_id, user_id, role, score, voted_correctly)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), matchId, p.userId, p.role, p.totalScore,
       p.role !== 'impostor' && p.votedFor === room.players[room.impostorIndex]?.socketId]
    );
    // Actualizar estatísticas globais
    const won = (impostorCaught && p.role !== 'impostor') || (!impostorCaught && p.role === 'impostor');
    await query(
      `UPDATE users SET total_games = total_games + 1, total_wins = total_wins + $1, updated_at = NOW() WHERE id = $2`,
      [won ? 1 : 0, p.userId]
    );
  }
}
