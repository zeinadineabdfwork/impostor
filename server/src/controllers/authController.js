// src/controllers/authController.js
// Registo, login, token refresh e perfil anónimo
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const validator = require('validator');
const { query } = require('../config/database');
const { sanitizeUsername } = require('../utils/sanitize');

const SALT_ROUNDS = 12;

// ─── Helpers ────────────────────────────────────────────────────────────────
function signAccessToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function signRefreshToken(userId) {
  return jwt.sign({ sub: userId, type: 'refresh' }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '30d',
  });
}

// ─── Registo de conta completa ──────────────────────────────────────────────
async function register(req, res) {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Campos obrigatórios em falta.' });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres.' });
    }

    const clean = sanitizeUsername(username);
    if (!clean) return res.status(400).json({ error: 'Nome de utilizador inválido.' });

    // Verificar duplicados
    const exists = await query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [clean, email.toLowerCase()]
    );
    if (exists.rowCount > 0) {
      return res.status(409).json({ error: 'Username ou e-mail já em uso.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await query(
      `INSERT INTO users (id, username, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, avatar_url, total_wins, total_games, created_at`,
      [uuidv4(), clean, email.toLowerCase(), passwordHash]
    );

    const user = result.rows[0];
    const accessToken  = signAccessToken(user.id);
    const refreshToken = signRefreshToken(user.id);

    return res.status(201).json({ user, accessToken, refreshToken });
  } catch (err) {
    console.error('[authController.register]', err);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
}

// ─── Login ──────────────────────────────────────────────────────────────────
async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    const result = await query(
      'SELECT id, username, email, password_hash, avatar_url, total_wins, total_games FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas.' });

    delete user.password_hash;
    const accessToken  = signAccessToken(user.id);
    const refreshToken = signRefreshToken(user.id);

    return res.json({ user, accessToken, refreshToken });
  } catch (err) {
    console.error('[authController.login]', err);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
}

// ─── Login Anónimo (visitante) ───────────────────────────────────────────────
async function guestLogin(req, res) {
  try {
    const { username } = req.body;
    const clean = sanitizeUsername(username);
    if (!clean) return res.status(400).json({ error: 'Nome inválido.' });

    const guestId = `guest_${uuidv4().replace(/-/g,'').slice(0,10)}`;
    const accessToken = jwt.sign(
      { sub: guestId, type: 'guest', username: clean },
      process.env.JWT_SECRET,
      { expiresIn: '4h' }
    );

    return res.json({
      user: { id: guestId, username: clean, isGuest: true, avatar_url: null },
      accessToken,
    });
  } catch (err) {
    console.error('[authController.guestLogin]', err);
    return res.status(500).json({ error: 'Erro interno.' });
  }
}

// ─── Refresh Token ───────────────────────────────────────────────────────────
async function refreshToken(req, res) {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token em falta.' });

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    if (decoded.type !== 'refresh') return res.status(401).json({ error: 'Token inválido.' });

    const accessToken = signAccessToken(decoded.sub);
    return res.json({ accessToken });
  } catch (err) {
    return res.status(401).json({ error: 'Token expirado ou inválido.' });
  }
}

module.exports = { register, login, guestLogin, refreshToken };
