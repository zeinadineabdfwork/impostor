// client/public/js/socket-client.js
// Barramento de eventos Socket.io — emissor e receptor centralizado
/* global io, App */

const SocketClient = (() => {
  let socket = null;

  function connect(token) {
    if (socket?.connected) return socket;
    socket = io(window.location.origin, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
      App.onConnected();
    });
    socket.on('disconnect', (reason) => {
      console.warn('[Socket] Disconnected:', reason);
      App.onDisconnected(reason);
    });
    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
      App.showToast('Erro de conexão: ' + err.message, 'danger');
    });
    socket.on('error', ({ message }) => App.showToast(message, 'danger'));

    // ── Room events ───────────────────────────────────────────
    socket.on('room:created',             (d) => App.onRoomCreated(d));
    socket.on('room:joined',              (d) => App.onRoomJoined(d));
    socket.on('room:player-joined',       (d) => App.onPlayerJoined(d));
    socket.on('room:player-left',         (d) => App.onPlayerLeft(d));
    socket.on('room:player-disconnected', (d) => App.onPlayerDisconnected(d));
    socket.on('room:player-reconnected',  (d) => App.onPlayerReconnected(d));
    socket.on('room:state-sync',          (d) => App.onStateSync(d));

    // ── Game events ───────────────────────────────────────────
    socket.on('game:role-assigned',   (d) => App.onRoleAssigned(d));
    socket.on('game:started',         (d) => App.onGameStarted(d));
    socket.on('game:turn-change',     (d) => App.onTurnChange(d));
    socket.on('game:round-complete',  (d) => App.onRoundComplete(d));
    socket.on('game:voting-started',  (d) => App.onVotingStarted(d));
    socket.on('game:voting-ended',    (d) => App.onVotingEnded(d));
    socket.on('game:player-eliminated',(d)=> App.onPlayerEliminated(d));
    socket.on('game:over',            (d) => App.onGameOver(d));

    // ── Draw events ───────────────────────────────────────────
    socket.on('draw:start',      (d) => Canvas.remoteStart(d));
    socket.on('draw:point',      (d) => Canvas.remotePoint(d));
    socket.on('draw:end',        ()  => Canvas.remoteEnd());
    socket.on('draw:stream',     (d) => Canvas.remoteStream(d));
    socket.on('draw:force-stop', ()  => Canvas.forceStop());

    // ── Vote events ───────────────────────────────────────────
    socket.on('vote:update', (d) => App.onVoteUpdate(d));

    // Keep-alive para Render free tier
    setInterval(() => socket?.emit('ping:keep-alive'), 20000);

    return socket;
  }

  function emit(event, data) {
    if (!socket?.connected) return console.warn('[Socket] Not connected, dropped:', event);
    socket.emit(event, data);
  }

  function disconnect() { socket?.disconnect(); socket = null; }
  function getId()      { return socket?.id; }
  function isConnected(){ return socket?.connected ?? false; }

  return { connect, emit, disconnect, getId, isConnected };
})();
