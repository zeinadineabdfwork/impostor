// src/server.js — Bootstrap da aplicação (HTTP + WebSocket)
require('dotenv').config();

// Validação rápida de variáveis de ambiente críticas — falha cedo com mensagem útil
(() => {
  const required = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing required env vars: ${missing.join(', ')}.`);
    console.error('Copy .env.example to .env and fill the values (never commit .env).');
    process.exit(1);
  }
})();
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

// ─── Socket.io ───────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
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
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
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

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);
server.listen(PORT, () => {
  console.log(`\n🎮  ImpostorDraw Server running on port ${PORT}`);
  console.log(`   ENV : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   URL : http://localhost:${PORT}\n`);
});

module.exports = { app, server, io };
