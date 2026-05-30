// src/server.js — Bootstrap da aplicação (HTTP + WebSocket)
require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

// ─── Validação rápida de variáveis de ambiente críticas ──────────────────────
(() => {
  const required = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`[Server] FATAL: Variáveis de ambiente em falta: ${missing.join(', ')}`);
    console.error('[Server] Copia .env.example para .env e preenche os valores.');
    process.exit(1);
  }
})();

// Log do ambiente no arranque (útil para debug no Render)
console.log('[Server] ── Arranque ──────────────────────────────────────────');
console.log(`[Server] NODE_ENV     : ${process.env.NODE_ENV || 'development'}`);
console.log(`[Server] PORT         : ${process.env.PORT || '3000'}`);
console.log(`[Server] CORS_ORIGIN  : ${process.env.CORS_ORIGIN || '* (sem restrições)'}`);
console.log(`[Server] DATABASE_URL : ${process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':***@') : 'NÃO DEFINIDA'}`);
console.log(`[Server] SUPABASE_URL : ${process.env.SUPABASE_URL || 'NÃO DEFINIDA'}`);
console.log('[Server] ───────────────────────────────────────────────────────');

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const path       = require('path');
const rateLimit  = require('express-rate-limit');

const authRoutes            = require('./routes/authRoutes');
const userRoutes            = require('./routes/userRoutes');
const initSockets           = require('./sockets/index');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');

const app    = express();
const server = http.createServer(app);

// ─── CORS origins ─────────────────────────────────────────────────────────────
// Suporta lista separada por vírgulas. Se vazio, permite tudo (wildcard).
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean)
  : '*';

console.log('[Server] CORS origins configurados:', corsOrigins);

// ─── Socket.io ───────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

const { getRoomStats } = initSockets(io);

// ─── Middlewares HTTP ─────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Rate limit global — mais permissivo para não bloquear requests legítimos
app.use(rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  max:      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '200', 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`[RateLimit] Bloqueado: ${req.ip} — ${req.method} ${req.path}`);
    res.status(429).json({ error: 'Demasiados pedidos. Tenta mais tarde.' });
  },
}));

// ─── Ficheiros estáticos do cliente ──────────────────────────────────────────
const CLIENT_DIR = path.join(__dirname, '../../client/public');
app.use(express.static(CLIENT_DIR));
app.use('/assets', express.static(path.join(CLIENT_DIR, 'assets')));

// ─── Rotas API ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// ─── Health Check (Render keep-alive + diagnóstico) ──────────────────────────
app.get('/health', async (req, res) => {
  const { pool } = require('./config/database');
  let dbStatus = 'unknown';
  let dbLatencyMs = null;

  try {
    const t0 = Date.now();
    await pool.query('SELECT 1');
    dbLatencyMs = Date.now() - t0;
    dbStatus = 'ok';
  } catch (err) {
    dbStatus = `error: ${err.message}`;
    console.error('[Health] DB check falhou:', err.message);
  }

  const status = dbStatus === 'ok' ? 200 : 503;
  res.status(status).json({
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    uptime: Math.floor(process.uptime()),
    db: { status: dbStatus, latencyMs: dbLatencyMs },
    rooms: getRoomStats(),
    env: process.env.NODE_ENV,
    ts: new Date().toISOString(),
  });
});

// ─── SPA fallback ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  // Só faz fallback para ficheiros HTML (não para chamadas de API sem resposta)
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint de API não encontrado.' });
  }
  res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});

// ─── Error Handlers ───────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Tratamento de erros não capturados (evitar crash silencioso) ─────────────
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] UnhandledRejection em:', promise);
  console.error('[Process] Razão:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Process] UncaughtException:', err.message);
  console.error('[Process] Stack:', err.stack);
  process.exit(1);
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎮  ImpostorDraw Server a correr na porta ${PORT}`);
  console.log(`   ENV : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   URL : http://localhost:${PORT}\n`);
});

module.exports = { app, server, io };
