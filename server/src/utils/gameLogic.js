// src/utils/gameLogic.js
// Algoritmos puros do jogo — sem efeitos colaterais de I/O

const { v4: uuidv4 } = require('uuid');

// ─── Constantes (lidas do .env ou default) ───────────────────────────────────
const MAX_STROKE_LENGTH = parseInt(process.env.MAX_STROKE_LENGTH || '200', 10);
const MAX_ROUNDS        = parseInt(process.env.MAX_ROUNDS         || '6',   10);
const MIN_PLAYERS       = parseInt(process.env.MIN_PLAYERS        || '3',   10);
const MAX_PLAYERS       = parseInt(process.env.MAX_PLAYERS        || '8',   10);

// ─── Banco de temas bilíngue ─────────────────────────────────────────────────
const THEME_BANK = [
  { category: 'Animais',    words: ['Elefante','Golfinho','Pinguim','Flamingo','Aranha','Cobra','Leão','Girafa'] },
  { category: 'Comida',     words: ['Pizza','Sushi','Taco','Croissant','Bolo','Hamburguer','Gelado','Crepe'] },
  { category: 'Veículos',   words: ['Helicóptero','Submarino','Foguetão','Tractor','Mota','Veleiro','Comboio','Scooter'] },
  { category: 'Objectos',   words: ['Guitarra','Telescópio','Ampulheta','Bússola','Ímã','Microscópio','Xadrez','Dado'] },
  { category: 'Lugares',    words: ['Vulcão','Farol','Castelo','Iglu','Pirâmide','Floresta','Caverna','Ilha'] },
  { category: 'Profissões', words: ['Astronauta','Pirata','Mago','Detetive','Chef','Arqueólogo','Bombeiro','Cirurgião'] },
  { category: 'Desporto',   words: ['Surf','Esgrima','Polo','Badminton','Curling','Luta de Sumo','Escalada','Canoagem'] },
];

/**
 * Gera código alfanumérico maiúsculo de N caracteres.
 * @param {number} length
 */
function generateRoomCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem O,0,I,1 (confusão visual)
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/**
 * Selecciona tema aleatório e gera palavras distintas para inocentes e impostor.
 * @returns {{ category, word, impostorWord }}
 */
function pickTheme() {
  const theme = THEME_BANK[Math.floor(Math.random() * THEME_BANK.length)];
  const shuffled = [...theme.words].sort(() => Math.random() - 0.5);
  return {
    category:     theme.category,
    word:         shuffled[0],          // palavra dos inocentes
    impostorWord: shuffled[1],          // palavra diferente para o impostor
  };
}

/**
 * Sorteia o índice do impostor aleatoriamente dentro do array de jogadores.
 * @param {number} playerCount
 */
function pickImpostorIndex(playerCount) {
  return Math.floor(Math.random() * playerCount);
}

/**
 * Calcula distância euclidiana entre dois pontos (Pitágoras).
 * Usado no cliente e re-verificado no servidor.
 * @param {{ x:number, y:number }} p1
 * @param {{ x:number, y:number }} p2
 */
function euclideanDistance(p1, p2) {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/**
 * Verifica se o comprimento acumulado de um traço ultrapassou o limite.
 * @param {number} accumulatedLength
 */
function isStrokeOverLimit(accumulatedLength) {
  return accumulatedLength >= MAX_STROKE_LENGTH;
}

/**
 * Tabela de pontuação.
 */
const SCORE_TABLE = {
  IMPOSTOR_SURVIVES:    300, // impostor sobrevive ao jogo completo
  VOTER_CATCHES_IMP:    150, // inocente que vota certo
  IMPOSTOR_CAUGHT_LOSE:  0,  // impostor perde
  WRONG_VOTE_PENALTY:  -30,  // quem vota errado
  EARLY_VOTE_BONUS:     50,  // descoberto antes da última rodada
};

/**
 * Calcula pontuações finais.
 * @param {Array}  players       — lista de jogadores com { id, role, votedFor, hasVoted }
 * @param {string} impostorId    — ID do jogador impostor
 * @param {boolean} impostorCaught
 * @param {number} roundCaught   — rodada em que foi descoberto (0 = não foi)
 */
function calculateScores(players, impostorId, impostorCaught, roundCaught = 0) {
  return players.map((p) => {
    let delta = 0;
    if (p.id === impostorId) {
      delta = impostorCaught ? SCORE_TABLE.IMPOSTOR_CAUGHT_LOSE : SCORE_TABLE.IMPOSTOR_SURVIVES;
    } else {
      if (p.votedFor === impostorId) {
        delta = SCORE_TABLE.VOTER_CATCHES_IMP;
        if (roundCaught > 0 && roundCaught < MAX_ROUNDS) delta += SCORE_TABLE.EARLY_VOTE_BONUS;
      } else if (p.hasVoted) {
        delta = SCORE_TABLE.WRONG_VOTE_PENALTY;
      }
    }
    return { ...p, scoreDelta: delta, totalScore: (p.score || 0) + delta };
  });
}

/**
 * Cria o objeto de sala inicial para activeRooms.
 */
function createRoomObject({ roomCode, isPrivate, hostSocketId, hostUserId, hostUsername, hostAvatarUrl }) {
  return {
    roomId:           roomCode,
    isPrivate,
    status:           'LOBBY',        // LOBBY | PLAYING | VOTING | FINISHED
    currentRound:     1,
    currentTurnIndex: 0,
    currentTheme:     null,
    impostorIndex:    -1,
    players: [{
      socketId:   hostSocketId,
      userId:     hostUserId,
      username:   hostUsername,
      avatarUrl:  hostAvatarUrl,
      role:       'innocent',
      turnsLeft:  MAX_ROUNDS,
      score:      0,
      hasVoted:   false,
      votedFor:   null,
      connected:  true,
    }],
    canvasState:    [],  // buffer de traços para re-sincronização
    votesReceived:  {},  // { socketId: voteCount }
    createdAt:      Date.now(),
  };
}

module.exports = {
  generateRoomCode,
  pickTheme,
  pickImpostorIndex,
  euclideanDistance,
  isStrokeOverLimit,
  calculateScores,
  createRoomObject,
  MAX_STROKE_LENGTH,
  MAX_ROUNDS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  SCORE_TABLE,
};
