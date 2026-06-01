// client/public/js/socket-client.js
/* global io, App, Canvas */

const SocketClient = (() => {
  let socket = null;

  /**
   * Conecta ao servidor e retorna Promise que só resolve
   * quando o socket está efectivamente ligado.
   */
  function connect(token) {
    // Já conectado — resolve imediatamente
    if (socket && socket.connected) return Promise.resolve(socket);

    // Socket existe mas ainda está a ligar — aguarda
    if (socket && !socket.connected) {
      return new Promise((resolve, reject) => {
        const onConnect      = () => { cleanup(); resolve(socket); };
        const onConnectError = (err) => { cleanup(); reject(err); };
        const cleanup = () => {
          socket.off('connect',       onConnect);
          socket.off('connect_error', onConnectError);
        };
        socket.once('connect',       onConnect);
        socket.once('connect_error', onConnectError);
      });
    }

    // Criar nova ligação
    return new Promise((resolve, reject) => {
      socket = io(window.location.origin, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
      });

      // Resolver a Promise quando conectado pela primeira vez
      socket.once('connect', () => {
        console.log('[Socket] Connected:', socket.id);
        App.onConnected();
        resolve(socket);
        // Registar todos os listeners de eventos do jogo
        _registerListeners();
      });

      socket.once('connect_error', (err) => {
        console.error('[Socket] Erro de ligação:', err.message);
        App.showToast('Erro de conexão: ' + err.message, 'danger');
        reject(err);
      });
    });
  }

  function _registerListeners() {
    // Eventos de ligação
    socket.on('disconnect', (reason) => {
      console.warn('[Socket] Disconnected:', reason);
      App.onDisconnected(reason);
    });
    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });
    socket.on('error', ({ message }) => App.showToast(message, 'danger'));

    // ── Room ──────────────────────────────────────────────────
    socket.on('room:created',              (d) => App.onRoomCreated(d));
    socket.on('room:joined',               (d) => App.onRoomJoined(d));
    socket.on('room:player-joined',        (d) => App.onPlayerJoined(d));
    socket.on('room:player-left',          (d) => App.onPlayerLeft(d));
    socket.on('room:player-disconnected',  (d) => App.onPlayerDisconnected(d));
    socket.on('room:player-reconnected',   (d) => App.onPlayerReconnected(d));
    socket.on('room:state-sync',           (d) => App.onStateSync(d));

    // ── Game ──────────────────────────────────────────────────
    socket.on('game:role-assigned',        (d) => App.onRoleAssigned(d));
    socket.on('game:started',              (d) => App.onGameStarted(d));
    socket.on('game:turn-change',          (d) => App.onTurnChange(d));
    socket.on('game:round-complete',       (d) => App.onRoundComplete(d));
    socket.on('game:voting-started',       (d) => App.onVotingStarted(d));
    socket.on('game:voting-ended',         (d) => App.onVotingEnded(d));
    socket.on('game:player-eliminated',    (d) => App.onPlayerEliminated(d));
    socket.on('game:over',                 (d) => App.onGameOver(d));

    // ── Draw ──────────────────────────────────────────────────
    socket.on('draw:start',      (d) => Canvas.remoteStart(d));
    socket.on('draw:point',      (d) => Canvas.remotePoint(d));
    socket.on('draw:end',        ()  => Canvas.remoteEnd());
    socket.on('draw:stream',     (d) => Canvas.remoteStream(d));
    socket.on('draw:force-stop', ()  => Canvas.forceStop());

    // ── Vote ──────────────────────────────────────────────────
    socket.on('vote:update', (d) => App.onVoteUpdate(d));

    // Áudio de voz recebido de outro jogador
    socket.on('voice:chunk', (data) => {
      if (_voiceChunkCb) _voiceChunkCb(data);
    });

    // Keep-alive para Render free tier
    setInterval(() => { if (socket?.connected) socket.emit('ping:keep-alive'); }, 20000);
  }

  // Listeners de voz
  let _voiceChunkCb = null;
  function onVoiceChunk(cb)  { _voiceChunkCb = cb; }
  function offVoiceChunk()   { _voiceChunkCb = null; }

  function emit(event, data) {
    if (!socket || !socket.connected) {
      console.warn('[Socket] Não conectado — evento descartado:', event);
      return;
    }
    console.log('[Socket] emit:', event, data);
    socket.emit(event, data);
  }

  function disconnect() { socket?.disconnect(); socket = null; }
  function getId()      { return socket?.id; }
  function isConnected(){ return socket?.connected ?? false; }

  return { connect, emit, disconnect, getId, isConnected, onVoiceChunk, offVoiceChunk };
})();
