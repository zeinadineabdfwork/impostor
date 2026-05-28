// client/public/js/canvas.js
// Motor de desenho: captura de inputs, cálculo de traço, relay remoto

const Canvas = (() => {
  let el, ctx;
  let isDrawing   = false;
  let myTurn      = false;
  let strokeLen   = 0;
  let lastX = 0, lastY = 0;
  let color = '#1e293b';
  let size  = 4;
  let eraser = false;
  let undoStack = [];  // array de ImageData snapshots

  const MAX_STROKE = parseInt(window.MAX_STROKE_LENGTH || '200', 10);

  function init(canvasEl) {
    el  = canvasEl;
    ctx = el.getContext('2d');
    setStyle();

    el.addEventListener('pointerdown',  onDown,  { passive: false });
    el.addEventListener('pointermove',  onMove,  { passive: false });
    el.addEventListener('pointerup',    onUp,    { passive: false });
    el.addEventListener('pointerleave', onUp,    { passive: false });
    el.addEventListener('pointercancel',onUp,    { passive: false });
    el.setPointerCapture && el.addEventListener('pointerdown', e => el.setPointerCapture(e.pointerId));
  }

  function resize() {
    if (!el) return;
    const snap = ctx.getImageData(0, 0, el.width || 1, el.height || 1);
    const wrap = el.parentElement;
    el.width  = wrap.clientWidth;
    el.height = wrap.clientHeight;
    ctx.putImageData(snap, 0, 0);
    setStyle();
  }

  function setStyle() {
    if (!ctx) return;
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = eraser ? '#ffffff' : color;
    ctx.lineWidth   = eraser ? size * 3 : size;
    ctx.globalCompositeOperation = eraser ? 'destination-out' : 'source-over';
  }

  function getXY(e) {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // ── Início do traço ────────────────────────────────────────────────────────
  function onDown(e) {
    e.preventDefault();
    if (!myTurn) return;
    isDrawing = true;
    strokeLen = 0;
    undoStack.push(ctx.getImageData(0, 0, el.width, el.height));
    if (undoStack.length > 15) undoStack.shift();
    const { x, y } = getXY(e);
    lastX = x; lastY = y;
    ctx.beginPath(); ctx.moveTo(x, y);
    setStyle();
    SocketClient.emit('draw:start', { x, y, color, size: eraser ? size * 3 : size });
  }

  // ── Movimento do traço ──────────────────────────────────────────────────────
  function onMove(e) {
    e.preventDefault();
    if (!isDrawing) return;
    const { x, y } = getXY(e);
    const dist = Math.hypot(x - lastX, y - lastY);
    strokeLen += dist;

    if (strokeLen >= MAX_STROKE) {
      forceStop();
      return;
    }

    ctx.lineTo(x, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y);
    lastX = x; lastY = y;

    // Actualizar barra de traço
    const pct = Math.min(Math.round((strokeLen / MAX_STROKE) * 100), 100);
    document.getElementById('stroke-fill').style.width = pct + '%';
    document.getElementById('stroke-pct').textContent = pct + '%';
    document.getElementById('stroke-fill').classList.toggle('danger', pct > 70);

    SocketClient.emit('draw:point', { x, y });
  }

  // ── Fim do traço ────────────────────────────────────────────────────────────
  function onUp(e) {
    if (!isDrawing) return;
    e.preventDefault();
    isDrawing = false;
    ctx.closePath();
    strokeLen = 0;
    resetMeter();
    SocketClient.emit('draw:end');
    if (navigator.vibrate) navigator.vibrate(40);
  }

  function forceStop() {
    isDrawing = false;
    ctx.closePath();
    strokeLen = 0;
    resetMeter();
    SocketClient.emit('draw:end');
    if (navigator.vibrate) navigator.vibrate([60, 30, 60]);
  }

  function resetMeter() {
    document.getElementById('stroke-fill').style.width = '0%';
    document.getElementById('stroke-pct').textContent = '0%';
    document.getElementById('stroke-fill').classList.remove('danger');
  }

  // ── Relay remoto (outros jogadores) ────────────────────────────────────────
  function remoteStart({ x, y, color: c, size: s }) {
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.strokeStyle = c || '#1e293b';
    ctx.lineWidth   = s || 4;
    ctx.lineCap     = 'round';
    ctx.globalCompositeOperation = 'source-over';
  }
  function remotePoint({ x, y }) {
    ctx.lineTo(x, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y);
  }
  function remoteEnd() { ctx.closePath(); setStyle(); }
  function remoteStream({ x, y, state, color: c, size: s }) {
    if (state === 'start') { remoteStart({ x, y, color: c, size: s }); return; }
    remotePoint({ x, y });
  }

  // ── Controles ───────────────────────────────────────────────────────────────
  function setColor(c)  { color = c; eraser = false; setStyle(); }
  function setSize(s)   { size  = s; setStyle(); }
  function toggleEraser() { eraser = !eraser; setStyle(); return eraser; }
  function undo() {
    if (!myTurn || !undoStack.length) return;
    ctx.putImageData(undoStack.pop(), 0, 0);
    resetMeter();
  }
  function clear() {
    if (!myTurn) return;
    undoStack.push(ctx.getImageData(0, 0, el.width, el.height));
    ctx.clearRect(0, 0, el.width, el.height);
  }
  function setMyTurn(val) {
    myTurn = val;
    el.style.cursor = val ? 'crosshair' : 'not-allowed';
    el.style.opacity = val ? '1' : '0.8';
    if (val) resetMeter();
  }
  function clearAll() { ctx.clearRect(0, 0, el.width, el.height); undoStack = []; }

  return {
    init, resize, setColor, setSize, toggleEraser,
    undo, clear, clearAll, setMyTurn, forceStop,
    remoteStart, remotePoint, remoteEnd, remoteStream,
  };
})();
