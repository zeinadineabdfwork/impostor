// client/public/js/app.js
// Roteador de UI, estado global e todos os handlers de eventos Socket
/* global Auth, Canvas, SocketClient */

const App = (() => {
  // ── Estado global ──────────────────────────────────────────────────────────
  const state = {
    user: null, token: null, roomCode: null,
    players: [], mySocketId: null,
    currentTurnIndex: 0, currentRound: 1, totalRounds: 6,
    myRole: null, myWord: null, themeCategory: null,
    phase: 'auth', // auth|lobby|matchmaking|role|game|results
    voteTimer: null, turnTimer: null,
  };

  // ── Paleta e tamanhos ──────────────────────────────────────────────────────
  const COLORS = ['#1e293b','#ffffff','#ef4444','#6366f1','#10b981',
                  '#f59e0b','#06b6d4','#ec4899','#a855f7','#f97316','#84cc16','#78716c'];
  const SIZES  = [2, 4, 8, 16];
  const MAX_STROKE = 200;

  // ── Avatares padrão (emoji) ────────────────────────────────────────────────
  const AV_EMOJIS  = ['😎','🤖','👻','🦊','🐺','🎭','🦁','🐸','🦋','🎯','⚡','🔥','🐙','🦄','🐲','🎪'];
  const AV_COLORS  = ['#6366f1','#f43f5e','#10b981','#f59e0b','#8b5cf6',
                       '#06b6d4','#ec4899','#f97316','#84cc16','#14b8a6','#3b82f6','#a855f7'];
  let   selectedAvatarIdx = 0;

  function drawAvatarOnCanvas(canvas, idx) {
    const ctx = canvas.getContext('2d');
    const s   = canvas.width;
    const g   = ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
    g.addColorStop(0, AV_COLORS[idx % AV_COLORS.length]);
    g.addColorStop(1, AV_COLORS[(idx+3) % AV_COLORS.length]);
    ctx.fillStyle = g; ctx.fillRect(0,0,s,s);
    ctx.font = `${s*.56}px serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(AV_EMOJIS[idx % AV_EMOJIS.length], s/2, s/2+s*.04);
  }

  function getAvatarUrl() {
    const user = Auth.getUser();
    return (user && user.avatar_url) ? user.avatar_url : null;
  }

  // ── Screens ────────────────────────────────────────────────────────────────
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.add('hidden');
      s.style.display = '';
    });
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    el.style.display = id === 'screen-game' ? 'grid' : 'flex';
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  const toastQ = []; let toastBusy = false;
  function showToast(msg, type='info') {
    toastQ.push({msg,type});
    if (!toastBusy) _nextToast();
  }
  function _nextToast() {
    if (!toastQ.length) { toastBusy=false; return; }
    toastBusy = true;
    const {msg,type} = toastQ.shift();
    const t = document.createElement('div');
    t.className = `toast toast-${type}`; t.textContent = msg;
    document.getElementById('toast-wrap').appendChild(t);
    setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>{ t.remove(); _nextToast(); },300); }, 2400);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════════════════
  function init() {
    // Partículas de fundo
    initParticles();

    // Avatar picker
    const avBtn  = document.getElementById('av-ring');
    const avHint = document.getElementById('av-hint');
    if (avBtn) {
      avBtn.addEventListener('click', () => {
        selectedAvatarIdx = (selectedAvatarIdx + 1) % AV_EMOJIS.length;
        drawAvatarOnCanvas(document.getElementById('av-canvas'), selectedAvatarIdx);
      });
    }
    drawAvatarOnCanvas(document.getElementById('av-canvas'), 0);

    // Upload de avatar real
    const avatarFileInput = document.getElementById('avatar-file-input');
    const avatarUploadBtn = document.getElementById('btn-upload-avatar');
    if (avatarUploadBtn && avatarFileInput) {
      avatarUploadBtn.addEventListener('click', () => avatarFileInput.click());
      avatarFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try {
          showToast('A carregar avatar…','info');
          const res = await Auth.uploadAvatar(file);
          document.getElementById('av-ring').style.backgroundImage = `url(${res.avatar_url})`;
          showToast('Avatar actualizado!','success');
        } catch(err) { showToast(err.message,'danger'); }
      });
    }

    // Tab switcher
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b===btn));
        document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('hidden', p.id!=='panel-'+tab));
      });
    });

    // Enter key
    document.getElementById('inp-username')?.addEventListener('keydown', e=>{
      if (e.key==='Enter') doQuickPlay();
    });
    document.getElementById('inp-join-code')?.addEventListener('input', e=>{
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'');
    });
    document.getElementById('inp-create-code')?.addEventListener('input', e=>{
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'');
    });
    document.getElementById('inp-join-code')?.addEventListener('keydown', e=>{
      if(e.key==='Enter') doJoinPrivate();
    });

    // Botões auth
    document.getElementById('btn-quick-play')?.addEventListener('click', doQuickPlay);
    document.getElementById('btn-create-room')?.addEventListener('click', doCreateRoom);
    document.getElementById('btn-join-room')?.addEventListener('click', doJoinPrivate);
    document.getElementById('btn-cancel-mm')?.addEventListener('click', cancelMatchmaking);
    document.getElementById('btn-start-game')?.addEventListener('click', doStartGame);
    document.getElementById('btn-copy-code')?.addEventListener('click', copyRoomCode);
    document.getElementById('btn-play-again')?.addEventListener('click', doPlayAgain);
    document.getElementById('btn-back-lobby')?.addEventListener('click', ()=>showScreen('screen-auth'));

    // Auth modal
    document.getElementById('btn-open-register')?.addEventListener('click', ()=>toggleModal('modal-register',true));
    document.getElementById('btn-open-login')?.addEventListener('click', ()=>toggleModal('modal-login',true));
    document.querySelectorAll('.modal-close').forEach(b=>b.addEventListener('click',()=>{
      document.querySelectorAll('.modal-overlay').forEach(m=>m.classList.add('hidden'));
    }));
    document.getElementById('btn-do-register')?.addEventListener('click', doRegister);
    document.getElementById('btn-do-login')?.addEventListener('click', doLogin);
    document.getElementById('btn-logout')?.addEventListener('click', ()=>{ Auth.logout(); location.reload(); });

    // Sessão existente
    const savedUser = Auth.getUser();
    if (savedUser) {
      state.user = savedUser; state.token = Auth.getToken();
      updateAuthUI();
    }

    // Canvas toolbar
    buildColorSwatches();
    buildSizeButtons();
    document.getElementById('btn-eraser')?.addEventListener('click', ()=>{
      const on = Canvas.toggleEraser();
      document.getElementById('btn-eraser').classList.toggle('active', on);
    });
    document.getElementById('btn-undo')?.addEventListener('click', ()=>Canvas.undo());
    document.getElementById('btn-clear')?.addEventListener('click', ()=>Canvas.clear());

    // Canvas
    const canvasEl = document.getElementById('game-canvas');
    if (canvasEl) Canvas.init(canvasEl);
    window.addEventListener('resize', ()=>{ Canvas.resize(); });

    showScreen('screen-auth');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH FLOW
  // ═══════════════════════════════════════════════════════════════════════════
  function toggleModal(id, open) {
    document.getElementById(id)?.classList.toggle('hidden', !open);
  }

  async function doRegister() {
    const u = document.getElementById('reg-username')?.value.trim();
    const e = document.getElementById('reg-email')?.value.trim();
    const p = document.getElementById('reg-password')?.value;
    try {
      await Auth.register(u, e, p);
      state.user = Auth.getUser(); state.token = Auth.getToken();
      toggleModal('modal-register', false);
      updateAuthUI();
      showToast('Conta criada com sucesso!','success');
    } catch(err) { showToast(err.message,'danger'); }
  }

  async function doLogin() {
    const e = document.getElementById('login-email')?.value.trim();
    const p = document.getElementById('login-password')?.value;
    try {
      await Auth.login(e, p);
      state.user = Auth.getUser(); state.token = Auth.getToken();
      toggleModal('modal-login', false);
      updateAuthUI();
      showToast('Bem-vindo de volta!','success');
    } catch(err) { showToast(err.message,'danger'); }
  }

  function updateAuthUI() {
    const u = state.user;
    if (!u) return;
    const nameEl = document.getElementById('display-username');
    if (nameEl) nameEl.textContent = u.username;
    document.getElementById('btn-open-login')?.classList.add('hidden');
    document.getElementById('btn-open-register')?.classList.add('hidden');
    document.getElementById('btn-logout')?.classList.remove('hidden');
    document.getElementById('user-info-bar')?.classList.remove('hidden');
    // Pre-fill username
    const inp = document.getElementById('inp-username');
    if (inp && !inp.value) inp.value = u.username;
  }

  function getSessionData() {
    const raw = document.getElementById('inp-username')?.value.trim() || state.user?.username || 'Visitante';
    const username = raw.replace(/[^a-zA-Z0-9_\-]/g,'').slice(0,15) || 'Visitante';
    const userId   = state.user?.id || `guest_${Date.now()}`;
    const avatarUrl= getAvatarUrl();
    return { username, userId, avatarUrl };
  }

  async function ensureConnected() {
    if (!state.token) {
      // Login anónimo automático
      const { username } = getSessionData();
      const d = await Auth.guestLogin(username);
      state.user  = d.user;
      state.token = d.accessToken;
      console.log('[App] Guest login OK, userId:', state.user.id);
    }
    // Aguarda a conexão efectiva antes de continuar
    await SocketClient.connect(state.token);
    console.log('[App] Socket pronto, id:', SocketClient.getId());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROOM ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  async function doQuickPlay() {
    const { username, userId, avatarUrl } = getSessionData();
    if (!username || username.length < 2) return showToast('Nome deve ter 2+ letras!','danger');
    await ensureConnected();
    SocketClient.emit('room:quickmatch', { userId, username, avatarUrl });
    showScreen('screen-matchmaking');
    document.getElementById('mm-private-box')?.classList.add('hidden');
    document.getElementById('mm-status')?.textContent && (document.getElementById('mm-status').textContent = 'A encontrar outros jogadores…');
    startMMAnimation();
  }

  async function doCreateRoom() {
    const { username, userId, avatarUrl } = getSessionData();
    if (!username || username.length < 2) return showToast('Nome deve ter 2+ letras!','danger');
    const rawCode = document.getElementById('inp-create-code')?.value.trim().toUpperCase().replace(/[^A-Z0-9]/g,'') || null;
    if (rawCode && rawCode.length < 4) return showToast('Código deve ter pelo menos 4 caracteres!','danger');
    await ensureConnected();
    SocketClient.emit('room:create', { userId, username, avatarUrl, customCode: rawCode || undefined });
    showScreen('screen-matchmaking');
    startMMAnimation();
  }

  async function doJoinPrivate() {
    const code = document.getElementById('inp-join-code')?.value.trim().toUpperCase();
    if (!code || code.length < 4) return showToast('Código inválido!','danger');
    const { username, userId, avatarUrl } = getSessionData();
    if (!username || username.length < 2) return showToast('Nome deve ter 2+ letras!','danger');
    await ensureConnected();
    SocketClient.emit('room:join', { roomCode: code, userId, username, avatarUrl });
    showScreen('screen-matchmaking');
    startMMAnimation();
  }

  function doStartGame() {
    if (!state.roomCode) return;
    SocketClient.emit('room:start', { roomCode: state.roomCode });
  }

  function cancelMatchmaking() {
    SocketClient.disconnect();
    clearMMAnimation();
    showScreen('screen-auth');
  }

  function copyRoomCode() {
    if (!state.roomCode) return;
    navigator.clipboard?.writeText(state.roomCode).catch(()=>{});
    showToast(`Código ${state.roomCode} copiado!`,'success');
  }

  function doPlayAgain() {
    state.phase = 'auth';
    Canvas.clearAll();
    showScreen('screen-auth');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MATCHMAKING ANIMATION
  // ═══════════════════════════════════════════════════════════════════════════
  const MATCHMAKING_TARGET = 3;
  let mmInterval = null;

  function setMatchmakingProgress(count) {
    const counter = document.getElementById('mm-counter');
    const bar     = document.getElementById('mm-bar');
    const value   = Math.min(count, MATCHMAKING_TARGET);
    if (counter) counter.textContent = `${value} / ${MATCHMAKING_TARGET}`;
    if (bar)     bar.style.width     = `${(value/MATCHMAKING_TARGET)*100}%`;
  }

  function startMMAnimation() {
    const fake = 0;
    setMatchmakingProgress(fake);
    const counter = document.getElementById('mm-counter');
    const bar     = document.getElementById('mm-bar');
    mmInterval = setInterval(() => {
      if (counter) counter.textContent = `Procurando...`;
      if (bar)     bar.style.width = `100%`;
    }, 1800);
  }
  function clearMMAnimation() { clearInterval(mmInterval); }

  // ═══════════════════════════════════════════════════════════════════════════
  // SOCKET CALLBACKS
  // ═══════════════════════════════════════════════════════════════════════════
  function onConnected()           { console.log('[App] Socket connected'); }
  function onDisconnected(reason)  { showToast('Desconectado: '+reason,'danger'); }

  function onRoomCreated({ roomCode, room }) {
    state.roomCode = roomCode;
    state.players  = room.players;
    state.isPrivate = room.isPrivate;
    clearMMAnimation();
    document.getElementById('mm-code-display').textContent = roomCode;
    document.getElementById('mm-private-box')?.classList.remove('hidden');
    renderMMPlayers(room.players);
    setMatchmakingProgress(room.players.length);
    updateStartBtn(room.players);
  }

  function onRoomJoined({ roomCode, room }) {
    state.roomCode = roomCode;
    state.players  = room.players;
    state.isPrivate = room.isPrivate;
    clearMMAnimation();
    document.getElementById('mm-code-display').textContent = roomCode;
    renderMMPlayers(room.players);
    setMatchmakingProgress(room.players.length);
    updateStartBtn(room.players);
  }

  function onPlayerJoined({ players }) {
    state.players = players;
    renderMMPlayers(players);
    setMatchmakingProgress(players.length);
    updateStartBtn(players);
    showToast(`${players[players.length-1]?.username} entrou!`,'info');
  }

  function onPlayerLeft({ players }) {
    state.players = players;
    renderMMPlayers(players);
    setMatchmakingProgress(players.length);
    updateStartBtn(players);
  }

  function onPlayerDisconnected({ username }) { showToast(`${username} desconectou…`,'danger'); }
  function onPlayerReconnected({ username })  { showToast(`${username} reconectou!`,'success'); }

  function onStateSync({ room, canvasState }) {
    state.players          = room.players;
    state.currentTurnIndex = room.currentTurnIndex;
    state.currentRound     = room.currentRound;
    renderSidebar();
    // Replay canvas state
    canvasState?.forEach(pt => Canvas.remoteStream(pt));
  }

  function onRoleAssigned({ role, themeCategory, word }) {
    state.myRole       = role;
    state.myWord       = word;
    state.themeCategory= themeCategory;
    showRoleScreen(role, themeCategory, word);
  }

  function onGameStarted({ players, currentTurnIndex, totalRounds, currentRound, themeCategory }) {
    state.players          = players;
    state.currentTurnIndex = currentTurnIndex;
    state.totalRounds      = totalRounds;
    state.currentRound     = currentRound;
    state.themeCategory    = themeCategory;
    state.mySocketId       = SocketClient.getId();
    state.phase            = 'game';
  }

  function onTurnChange({ currentTurnIndex, players, currentRound }) {
    state.currentTurnIndex = currentTurnIndex;
    state.players          = players;
    state.currentRound     = currentRound;
    updateTurnUI();
    renderSidebar();
    document.getElementById('round-badge').textContent = `Rodada ${currentRound}/${state.totalRounds}`;
  }

  function onRoundComplete({ round }) {
    showToast(`Rodada ${round} completa!`,'info');
    if (navigator.vibrate) navigator.vibrate([80,40,80]);
  }

  function onVotingStarted({ players, timeoutSeconds }) {
    state.players = players;
    state.phase   = 'voting';
    Canvas.setMyTurn(false);
    buildVoteOverlay(players, timeoutSeconds || 40);
    document.getElementById('voting-overlay').classList.remove('hidden');
    if (navigator.vibrate) navigator.vibrate([150,60,150]);
    Voice.start();
  }

  function onVoteUpdate({ votesMap, votesIn, totalVoters }) {
    document.getElementById('vote-count').textContent = `${votesIn}/${totalVoters} votaram`;
  }

  function onVotingEnded({ impostorCaught, players, nobody }) {
    clearInterval(state.voteTimer);
    Voice.stop();
    document.getElementById('voting-overlay').classList.add('hidden');
    state.players = players;
    state.phase   = 'game';
    renderSidebar();
    if (nobody) showToast('Ninguém foi eliminado — o jogo continua!', 'info');
    // Retomar o turno actual
    updateTurnUI();
    Canvas.resize();
  }

  function onPlayerEliminated({ username }) { showToast(`${username} foi eliminado!`,'danger'); }

  function onGameOver(data) {
    clearInterval(state.voteTimer);
    Voice.stop();
    document.getElementById('voting-overlay').classList.add('hidden');
    showResultsScreen(data);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UI BUILDERS
  // ═══════════════════════════════════════════════════════════════════════════
  function showRoleScreen(role, category, word) {
    showScreen('screen-role');
    const isImp = role === 'impostor';
    document.getElementById('role-emoji').textContent = isImp ? '🕵️' : '🎨';
    const rn = document.getElementById('role-name');
    rn.textContent  = isImp ? 'IMPOSTOR' : 'INOCENTE';
    rn.className    = 'role-name ' + role;
    document.getElementById('role-desc').textContent = isImp
      ? 'O teu tema é DIFERENTE. Mimetiza os outros sem te traíres!'
      : 'Desenha o teu tema. Descobre quem tem o traço suspeito!';
    document.getElementById('theme-category').textContent = category;
    const tw = document.getElementById('theme-word');
    tw.textContent  = word;
    tw.className    = 'theme-word' + (isImp ? ' imp' : '');
    document.getElementById('btn-enter-game').onclick = enterGame;
  }

  function enterGame() {
    showScreen('screen-game');
    Canvas.resize();
    updateTurnUI();
    renderSidebar();
    document.getElementById('topbar-category').textContent = state.themeCategory || '?';
    document.getElementById('topbar-word').textContent     = state.myWord || '?';
    document.getElementById('topbar-room').textContent     = state.roomCode || '';
    document.getElementById('round-badge').textContent     = `Rodada ${state.currentRound}/${state.totalRounds}`;
  }

  function updateTurnUI() {
    const myId = SocketClient.getId();
    const cur  = state.players[state.currentTurnIndex];
    const mine = cur?.socketId === myId;
    Canvas.setMyTurn(mine);
    const dot  = document.getElementById('turn-dot');
    const txt  = document.getElementById('turn-txt');
    if (mine) {
      dot.style.background = 'var(--emerald)';
      txt.textContent = '✏ É o teu turno!';
      txt.style.color = 'var(--emerald)';
      showToast('✏ É o teu turno! Desenha!','success');
      if (navigator.vibrate) navigator.vibrate([100,50,100]);
    } else {
      dot.style.background = 'var(--muted)';
      txt.textContent = `🎨 Vez de ${cur?.username ?? '?'}`;
      txt.style.color = 'var(--muted2)';
    }
  }

  function renderSidebar() {
    const sb = document.getElementById('sidebar');
    if (!sb) return;
    sb.innerHTML = '<div class="sidebar-title">Jogadores</div>';
    state.players.forEach((p,i) => {
      const isMe  = p.socketId === SocketClient.getId();
      const isCur = i === state.currentTurnIndex;
      const div   = document.createElement('div');
      div.className = `player-card${isCur?' active-turn':''}${p.eliminated?' eliminated':''}`;
      div.innerHTML = `
        <div class="player-av" id="sbav-${i}">
          <canvas id="sbav-c-${i}" width="34" height="34"></canvas>
        </div>
        <div class="player-info">
          <div class="player-name">${p.username}${isMe?' <span class="me-tag">(Tu)</span>':''}</div>
          <div class="player-sub">${p.turnsLeft ?? 6} traços</div>
        </div>
        <div class="player-pts">${p.score ?? 0}pts</div>`;
      sb.appendChild(div);
      const c = document.getElementById(`sbav-c-${i}`);
      if (c) drawAvatarOnCanvas(c, i);
    });
  }

  function renderMMPlayers(players) {
    const wrap = document.getElementById('mm-players-list');
    if (!wrap) return;
    wrap.innerHTML = '';
    players.forEach(p => {
      const d = document.createElement('div');
      d.className = 'mm-player-chip';
      d.textContent = p.username;
      wrap.appendChild(d);
    });
  }

  function updateStartBtn(players) {
    const btn = document.getElementById('btn-start-game');
    if (!btn) return;

    if (state.isPrivate === false) {
      btn.disabled = true;
      btn.textContent = `Aguardando ${players.length}/3 jogadores...`;
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-disabled');
      return;
    }

    const ok = players.length >= 3;
    btn.disabled = !ok;
    btn.textContent = ok ? `▶ Iniciar (${players.length} jogadores)` : `Aguardando (mín. 3)…`;
    btn.classList.toggle('btn-primary', ok);
    btn.classList.toggle('btn-disabled', !ok);
  }

  function buildVoteOverlay(players, timeoutSec) {
    const cont    = document.getElementById('vote-btns');
    const timerEl = document.getElementById('vote-timer');
    const barEl   = document.getElementById('vote-timer-bar');
    const cntEl   = document.getElementById('vote-count');
    const nobody  = document.getElementById('btn-vote-nobody');
    if (!cont) return;

    cont.innerHTML = '';
    nobody.disabled = false;
    nobody.classList.remove('voted');
    let hasVoted = false;

    const castVote = (targetSocketId) => {
      if (hasVoted) return;
      hasVoted = true;
      clearInterval(state.voteTimer);
      SocketClient.emit('vote:cast', { targetSocketId });
      cont.querySelectorAll('.vote-btn').forEach(b => b.classList.add('voted-out'));
      nobody.disabled = true;
    };

    // Candidatos
    const activePlayers = players.filter(p => !p.eliminated);
    activePlayers.forEach(p => {
      const myId = SocketClient.getId();
      if (p.socketId === myId) return; // não votar em si mesmo
      const btn = document.createElement('div');
      btn.className = 'vote-btn';
      const c = document.createElement('canvas');
      c.width = c.height = 36;
      drawAvatarOnCanvas(c, state.players.indexOf(p));
      btn.appendChild(c);
      const info = document.createElement('div');
      info.innerHTML = `<div class="vote-name">${p.username}</div><div class="vote-pts">${p.score ?? 0} pts</div>`;
      btn.appendChild(info);
      btn.addEventListener('click', () => {
        castVote(p.socketId);
        btn.classList.add('voted');
      });
      cont.appendChild(btn);
    });

    // Botão ninguém
    nobody.onclick = () => {
      castVote('nobody');
      nobody.classList.add('voted');
      nobody.textContent = '✅ Votaste em ninguém';
    };

    // Countdown com barra animada
    let secs = timeoutSec;
    if (timerEl) timerEl.textContent = `⏱ ${secs}s`;
    if (barEl)   barEl.style.width   = '100%';
    if (cntEl)   cntEl.textContent   = `0/${activePlayers.length} votaram`;

    state.voteTimer = setInterval(() => {
      secs--;
      const pct = Math.max(0, (secs / timeoutSec) * 100);
      if (timerEl) timerEl.textContent = `⏱ ${secs}s`;
      if (barEl)   barEl.style.width   = pct + '%';
      if (secs <= 5) {
        if (barEl) barEl.style.background = 'var(--rose)';
        if (navigator.vibrate) navigator.vibrate([40,20,40]);
      }
      if (secs <= 0) {
        clearInterval(state.voteTimer);
        // Tempo esgotado sem votar → voto automático em ninguém
        if (!hasVoted) castVote('nobody');
      }
    }, 1000);
  }

  function showResultsScreen({ impostorCaught, winner, impostorSocketId, players, totalRounds }) {
    showScreen('screen-results');
    const isInnocent = winner === 'innocent';
    document.getElementById('result-emoji').textContent = isInnocent ? '🎉' : '🕵️';
    const rw = document.getElementById('result-winner');
    rw.textContent = isInnocent ? 'Inocentes Venceram!' : 'O Impostor Venceu!';
    rw.className   = 'result-winner ' + winner;
    document.getElementById('result-sub').textContent = isInnocent
      ? 'O infiltrado foi descoberto. Excelente trabalho em equipa!'
      : `O impostor sobreviveu ${totalRounds} rodada(s) sem ser detectado!`;

    // Reveal grid
    const grid = document.getElementById('reveal-grid');
    grid.innerHTML = '';
    players.forEach((p, i) => {
      const isImp = p.socketId === impostorSocketId;
      const card  = document.createElement('div');
      card.className = `reveal-card ${isImp?'is-imp':'is-inn'}`;
      const c = document.createElement('canvas');
      c.width = c.height = 50;
      drawAvatarOnCanvas(c, i);
      card.appendChild(c);
      card.innerHTML += `
        <div class="rv-name">${p.username}</div>
        <div class="rv-role ${isImp?'imp':'inn'}">${isImp?'🕵️ IMPOSTOR':'✅ INOCENTE'}</div>
        <div class="rv-score">${p.totalScore ?? p.score ?? 0} pts</div>`;
      grid.appendChild(card);
    });

    // Leaderboard
    const sorted = [...players].sort((a,b)=>(b.totalScore??b.score??0)-(a.totalScore??a.score??0));
    const lb = document.getElementById('lb-rows');
    lb.innerHTML = '';
    ['🥇','🥈','🥉'].forEach((medal,i) => {
      if (!sorted[i]) return;
      const row = document.createElement('div');
      row.className = 'lb-row';
      row.innerHTML = `<span class="lb-rank">${medal}</span><span class="lb-name">${sorted[i].username}</span><span class="lb-pts">${sorted[i].totalScore??sorted[i].score??0} pts</span>`;
      lb.appendChild(row);
    });
    sorted.slice(3).forEach((p,i) => {
      const row = document.createElement('div');
      row.className = 'lb-row';
      row.innerHTML = `<span class="lb-rank">${i+4}</span><span class="lb-name">${p.username}</span><span class="lb-pts">${p.totalScore??p.score??0} pts</span>`;
      lb.appendChild(row);
    });
  }

  // ── Canvas toolbar builders ────────────────────────────────────────────────
  function buildColorSwatches() {
    const wrap = document.getElementById('color-swatches');
    if (!wrap) return;
    wrap.innerHTML = '';
    COLORS.forEach(c => {
      const s = document.createElement('div');
      s.className = 'swatch';
      s.style.background = c;
      if (c === '#ffffff') s.style.border = '2px solid #64748b';
      s.addEventListener('click', () => {
        document.querySelectorAll('.swatch').forEach(x=>x.classList.remove('sel'));
        s.classList.add('sel');
        Canvas.setColor(c);
        document.getElementById('btn-eraser')?.classList.remove('active');
      });
      if (c === COLORS[0]) s.classList.add('sel');
      wrap.appendChild(s);
    });
  }

  function buildSizeButtons() {
    const wrap = document.getElementById('size-btns');
    if (!wrap) return;
    wrap.innerHTML = '';
    SIZES.forEach(sz => {
      const b = document.createElement('div');
      b.className = 'size-btn' + (sz===4?' sel':'');
      const dot = document.createElement('span');
      dot.style.cssText = `width:${sz}px;height:${sz}px;border-radius:50%;display:block;background:var(--text)`;
      b.appendChild(dot);
      b.addEventListener('click', () => {
        document.querySelectorAll('.size-btn').forEach(x=>x.classList.remove('sel'));
        b.classList.add('sel');
        Canvas.setSize(sz);
      });
      wrap.appendChild(b);
    });
  }

  // ── Partículas ─────────────────────────────────────────────────────────────
  function initParticles() {
    const c = document.getElementById('particle-bg');
    if (!c) return;
    const ctx2 = c.getContext('2d');
    let pts = [];
    function resize2() { c.width=innerWidth; c.height=innerHeight; }
    window.addEventListener('resize', resize2); resize2();
    for(let i=0;i<55;i++) pts.push({
      x:Math.random()*c.width, y:Math.random()*c.height,
      r:Math.random()*1.3+.3, dx:(Math.random()-.5)*.22, dy:(Math.random()-.5)*.22,
      o:Math.random()*.45+.08
    });
    function frame2(){
      ctx2.clearRect(0,0,c.width,c.height);
      pts.forEach(p=>{
        p.x+=p.dx; p.y+=p.dy;
        if(p.x<0)p.x=c.width; if(p.x>c.width)p.x=0;
        if(p.y<0)p.y=c.height; if(p.y>c.height)p.y=0;
        ctx2.beginPath(); ctx2.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx2.fillStyle=`rgba(99,102,241,${p.o})`; ctx2.fill();
      });
      requestAnimationFrame(frame2);
    }
    frame2();
  }

  // Expõe globalmente os callbacks de socket
  return {
    init, showToast, showScreen,
    onConnected, onDisconnected,
    onRoomCreated, onRoomJoined, onPlayerJoined, onPlayerLeft,
    onPlayerDisconnected, onPlayerReconnected, onStateSync,
    onRoleAssigned, onGameStarted, onTurnChange, onRoundComplete,
    onVotingStarted, onVoteUpdate, onVotingEnded,
    onPlayerEliminated, onGameOver,
    MAX_STROKE_LENGTH: MAX_STROKE,
  };
})();

window.addEventListener('DOMContentLoaded', () => App.init());

// ═══════════════════════════════════════════════════════════════════════════
// VOICE MODULE — Conversa por voz durante a votação
// Usa WebRTC via Simple Peer emulado com getUserMedia + Socket.io relay
// Abordagem: áudio capturado → chunks MediaRecorder → relay via socket
// ═══════════════════════════════════════════════════════════════════════════
const Voice = (() => {
  let localStream    = null;
  let audioContext   = null;
  let mediaRecorder  = null;
  let isSpeaking     = false;
  let isActive       = false;

  // Elementos UI
  const getBtn     = () => document.getElementById('btn-mic');
  const getStatus  = () => document.getElementById('voice-status');
  const getSpeakingList = () => document.getElementById('speaking-list');

  async function start() {
    if (isActive) return;
    isActive = true;

    // Limpar lista de quem fala
    const sl = getSpeakingList();
    if (sl) sl.innerHTML = '';

    const btn = getBtn();
    if (btn) {
      btn.addEventListener('pointerdown',  onMicDown);
      btn.addEventListener('pointerup',    onMicUp);
      btn.addEventListener('pointerleave', onMicUp);
      btn.addEventListener('touchstart',   onMicDown, { passive: true });
      btn.addEventListener('touchend',     onMicUp);
    }

    // Pedir permissão de microfone
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const st = getStatus();
      if (st) st.textContent = '🎙 Microfone pronto';
      console.log('[Voice] Microfone obtido.');
    } catch (err) {
      console.warn('[Voice] Sem permissão de microfone:', err.message);
      const st = getStatus();
      if (st) st.textContent = '🚫 Sem microfone';
      if (btn) btn.disabled = true;
    }

    // Ouvir áudio dos outros jogadores
    SocketClient.onVoiceChunk((data) => {
      if (!isActive) return;
      playAudioChunk(data.chunk, data.username);
      showSpeaking(data.username);
    });
  }

  function stop() {
    isActive   = false;
    isSpeaking = false;

    const btn = getBtn();
    if (btn) {
      btn.removeEventListener('pointerdown',  onMicDown);
      btn.removeEventListener('pointerup',    onMicUp);
      btn.removeEventListener('pointerleave', onMicUp);
      btn.removeEventListener('touchstart',   onMicDown);
      btn.removeEventListener('touchend',     onMicUp);
      btn.classList.remove('speaking');
    }

    // Parar stream do microfone
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop(); } catch(e) {}
    }
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
    if (audioContext) {
      try { audioContext.close(); } catch(e) {}
      audioContext = null;
    }

    // Remover listener de voz recebida
    SocketClient.offVoiceChunk();

    const sl = getSpeakingList();
    if (sl) sl.innerHTML = '';
    const st = getStatus();
    if (st) st.textContent = '';

    console.log('[Voice] Parado e limpo.');
  }

  function onMicDown(e) {
    e.preventDefault();
    if (!localStream || isSpeaking) return;
    isSpeaking = true;
    const btn = getBtn();
    if (btn) btn.classList.add('speaking');
    const st = getStatus();
    if (st) st.textContent = '🔴 A falar...';
    startCapture();
  }

  function onMicUp(e) {
    if (!isSpeaking) return;
    isSpeaking = false;
    const btn = getBtn();
    if (btn) btn.classList.remove('speaking');
    const st = getStatus();
    if (st) st.textContent = '🎙 Microfone pronto';
    stopCapture();
  }

  function startCapture() {
    if (!localStream) return;
    try {
      mediaRecorder = new MediaRecorder(localStream, { mimeType: 'audio/webm;codecs=opus' });
    } catch(e) {
      try {
        mediaRecorder = new MediaRecorder(localStream);
      } catch(e2) {
        console.warn('[Voice] MediaRecorder não suportado:', e2.message);
        return;
      }
    }

    mediaRecorder.ondataavailable = async (e) => {
      if (e.data && e.data.size > 0 && isActive) {
        const buffer = await e.data.arrayBuffer();
        const b64    = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        SocketClient.emit('voice:chunk', { chunk: b64 });
      }
    };

    mediaRecorder.start(150); // chunks a cada 150ms para baixa latência
  }

  function stopCapture() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop(); } catch(e) {}
    }
    mediaRecorder = null;
  }

  async function playAudioChunk(b64, username) {
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const binary = atob(b64);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();
    } catch(e) {
      // Chunk incompleto ou formato não suportado — ignorar silenciosamente
    }
  }

  function showSpeaking(username) {
    const sl = getSpeakingList();
    if (!sl) return;
    // Evitar duplicados
    if (sl.querySelector(`[data-user="${username}"]`)) return;
    const pill = document.createElement('span');
    pill.className = 'speaking-pill';
    pill.dataset.user = username;
    pill.textContent = `🔊 ${username}`;
    sl.appendChild(pill);
    setTimeout(() => pill.remove(), 2500);
  }

  return { start, stop };
})();
