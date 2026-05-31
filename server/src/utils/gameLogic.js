// src/utils/gameLogic.js
// Lógica pura do jogo: geração de salas, temas, scores

const MIN_PLAYERS = parseInt(process.env.MIN_PLAYERS || '3', 10);
const MAX_PLAYERS = parseInt(process.env.MAX_PLAYERS || '8', 10);
const MAX_ROUNDS  = parseInt(process.env.MAX_ROUNDS  || '6', 10);
const MAX_STROKE_LENGTH = parseInt(process.env.MAX_STROKE_LENGTH || '200', 10);

// ── Geração de códigos ────────────────────────────────────────────────────────

/**
 * Gera um código aleatório para sala privada.
 * Ex: "K9F2XM"
 */
function generateRoomCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < len; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/**
 * Gera um código de matchmaking público — mais longo para ser único.
 * Formato: 3 letras + 3 dígitos + 2 letras + 4 dígitos  Ex: "ABC123AB3456"
 */
function generateMatchmakingCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const D = '0123456789';
  const rL = (n) => Array.from({length:n}, () => L[Math.floor(Math.random()*L.length)]).join('');
  const rD = (n) => Array.from({length:n}, () => D[Math.floor(Math.random()*D.length)]).join('');
  return rL(3) + rD(3) + rL(2) + rD(4);
}

// ── Criação de sala ──────────────────────────────────────────────────────────

function createRoomObject({ roomCode, isPrivate, hostSocketId, hostUserId, hostUsername, hostAvatarUrl }) {
  return {
    roomId: roomCode,
    isPrivate,
    status: 'LOBBY',
    players: [{
      socketId:  hostSocketId,
      userId:    hostUserId || `guest_${hostSocketId.slice(0,8)}`,
      username:  hostUsername,
      avatarUrl: hostAvatarUrl || null,
      role:      'innocent',
      turnsLeft: MAX_ROUNDS,
      score:     0,
      hasVoted:  false,
      votedFor:  null,
      connected: true,
    }],
    currentTheme:     null,
    impostorIndex:    -1,
    currentRound:     0,
    currentTurnIndex: 0,
    canvasState:      [],
    votesReceived:    {},
    _turnTimer:       null,
    _voteTimer:       null,
    _strokeLength:    0,
    _lastPoint:       null,
    createdAt:        Date.now(),
  };
}

// ── Temas ─────────────────────────────────────────────────────────────────────

const THEMES = [
  { category:'Animais',    word:'Elefante',    impostorWord:'Rinoceronte' },
  { category:'Animais',    word:'Golfinho',    impostorWord:'Tubarão' },
  { category:'Animais',    word:'Pinguim',     impostorWord:'Pato' },
  { category:'Comida',     word:'Pizza',       impostorWord:'Lasanha' },
  { category:'Comida',     word:'Sushi',       impostorWord:'Onigiri' },
  { category:'Comida',     word:'Hambúrguer',  impostorWord:'Sanduíche' },
  { category:'Desporto',   word:'Futebol',     impostorWord:'Rugby' },
  { category:'Desporto',   word:'Natação',     impostorWord:'Mergulho' },
  { category:'Tecnologia', word:'Smartphone',  impostorWord:'Tablet' },
  { category:'Tecnologia', word:'Computador',  impostorWord:'Televisão' },
  { category:'Lugares',    word:'Praia',       impostorWord:'Piscina' },
  { category:'Lugares',    word:'Montanha',    impostorWord:'Colina' },
  { category:'Veículos',   word:'Avião',       impostorWord:'Helicóptero' },
  { category:'Veículos',   word:'Barco',       impostorWord:'Kayak' },
  { category:'Profissões', word:'Médico',      impostorWord:'Enfermeiro' },
  { category:'Profissões', word:'Chef',        impostorWord:'Padeiro' },
];

function pickTheme() {
  return THEMES[Math.floor(Math.random() * THEMES.length)];
}

function pickImpostorIndex(numPlayers) {
  return Math.floor(Math.random() * numPlayers);
}

// ── Cálculo de scores ─────────────────────────────────────────────────────────

function calculateScores(players, impostorSocketId, impostorCaught, roundsSurvived) {
  return players.map(p => {
    let totalScore = p.score || 0;
    const isImpostor = p.id === impostorSocketId || p.socketId === impostorSocketId;

    if (isImpostor) {
      if (!impostorCaught) totalScore += 500 + roundsSurvived * 50;
    } else {
      if (impostorCaught) totalScore += 300;
      if (p.votedFor === impostorSocketId) totalScore += 100;
    }
    return { ...p, totalScore };
  });
}

// ── Anti-cheat ─────────────────────────────────────────────────────────────────

function euclideanDistance(a, b) {
  return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
}

function isStrokeOverLimit(len) {
  return len > MAX_STROKE_LENGTH;
}

module.exports = {
  MIN_PLAYERS, MAX_PLAYERS, MAX_ROUNDS, MAX_STROKE_LENGTH,
  generateRoomCode, generateMatchmakingCode,
  createRoomObject, pickTheme, pickImpostorIndex,
  calculateScores, euclideanDistance, isStrokeOverLimit,
};
