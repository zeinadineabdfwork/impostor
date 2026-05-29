// src/server.js — Bootstrap da aplicação (HTTP + WebSocket)
require('dotenv').config();

// ── Validação de variáveis de ambiente críticas ───────────────────────────────
// Falha rápida com mensagem útil no terminal do Render
(() => {
  const required = [
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'DATABASE_URL',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error('');
    console.error('╔══════════════════════════════════════════════════════╗');
    console.error('║  ❌  VARIÁVEIS DE AMBIENTE EM FALTA                  ║');
    console.error('╠══════════════════════════════════════════════════════╣');
    missing.forEach((k) => console.error(`║  • ${k.padEnd(50)}║`));
    console.error('╠══════════════════════════════════════════════════════╣');
    console.error('║  Adiciona estas variáveis no painel do Render:       ║');
    console.error('║  Dashboard → Service → Environment → Add variable    ║');
    console.error('╚══════════════════════════════════════════════════════╝');
    console.error('');
    process.exit(1);
  }

  // Aviso específico sobre SUPABASE_URL mal formatada
  if (process.env.SUPABASE_URL?.includes('/rest/v1')) {
    console.error('');
    console.error('[server] ❌ SUPABASE_URL está mal configurada!');
    console.error('[server]    Valor actual :', process.env.SUPABASE_URL);
    console.error('[server]    Correcto     :', process.env.SUPABASE_URL.replace(/\/rest\/v1\/?$/, ''));
    console.error('[server]    Corrige no painel do Render: Environment → SUPABASE_URL');
    console.error('');
    process.exit(1);
  }

  console.log('[server] ✅ Variáveis de ambiente validadas.');
  console.log('[server]    NODE_ENV    :', process.env.NODE_ENV || 'development');
  console.log('[server]    DATABASE_URL:', process.env.DATABASE_URL ? '***configurada***' : 'EM FALTA');
  console.log('[server]    SUPABASE_URL:', process.env.SUPABASE_URL);
  console.log('[server]    CORS_ORIGIN :', process.env.CORS_ORIGIN || '*');
})();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const path       = require('path');
const rateLimit  = require('express-rate-limit');

const authRoutes  = require('./routes/authRoutes');
const userRoutes  = require('./routes/userRoutes');
const initSockets = require('./sockets/index');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');

const app    = express();
const server = http.createServer(app);

// ─── Socket.io ───────────────────────────────────────────────────────────────
const corsOrigins = process.env.CORS_ORIGIN?.split(',').map(o => o.trim()) || '*';

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

// Rate limit global
app.use(rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  max:      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '200', 10),
  standardHeaders: true,
  legacyHeaders: false,
}));

// ─── Ficheiros estáticos do cliente ──────────────────────────────────────────
const CLIENT_DIR = path.join(__dirname, '../../client/public');
app.use(express.static(CLIENT_DIR));
app.use('/assets', express.static(path.join(CLIENT_DIR, 'assets')));

// ─── Rotas API ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// ─── Health Check (Render keep-alive) ────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    rooms: getRoomStats(),
    ts: new Date().toISOString(),
  });
});

// ─── SPA fallback ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});

// ─── Error Handlers ───────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Captura de erros não tratados (evita crash silencioso no Render) ─────────
process.on('uncaughtException', (err) => {
  console.error('[server] ❌ uncaughtException:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('[server] ❌ unhandledRejection:', reason);
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);
server.listen(PORT, () => {
  console.log('');
  console.log(`🎮  ImpostorDraw Server a correr na porta ${PORT}`);
  console.log(`    ENV : ${process.env.NODE_ENV || 'development'}`);
  console.log(`    URL : http://localhost:${PORT}`);
  console.log('');
});

module.exports = { app, server, io };
