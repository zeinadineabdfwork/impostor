// src/controllers/userController.js
// Perfil, avatar upload, estatísticas e histórico
const path  = require('path');
const fs    = require('fs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { sanitizeUsername } = require('../utils/sanitize');

// ─── Lazy-load do sharp (módulo nativo — pode falhar no Render se binários errados) ──
let sharp = null;
function getSharp() {
  if (!sharp) {
    try {
      sharp = require('sharp');
      console.log('[Avatar] sharp carregado com sucesso.');
    } catch (err) {
      console.error('[Avatar] AVISO: sharp não disponível:', err.message);
      console.error('[Avatar] Upload de avatar vai falhar. Verifica se sharp está instalado corretamente para Linux.');
      sharp = false;
    }
  }
  return sharp;
}

// ─── Obter perfil ────────────────────────────────────────────────────────────
async function getProfile(req, res) {
  try {
    const { userId } = req.params;
    console.log(`[userController.getProfile] userId=${userId}`);
    const result = await query(
      `SELECT id, username, avatar_url, total_wins, total_games, created_at,
              CASE WHEN total_games > 0 THEN ROUND((total_wins::numeric / total_games) * 100, 1) ELSE 0 END AS win_rate
       FROM users WHERE id = $1`,
      [userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Utilizador não encontrado.' });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('[userController.getProfile] ERRO:', err.message);
    return res.status(500).json({ error: 'Erro interno.' });
  }
}

// ─── Actualizar username ──────────────────────────────────────────────────────
async function updateUsername(req, res) {
  try {
    const { username } = req.body;
    const clean = sanitizeUsername(username);
    if (!clean) return res.status(400).json({ error: 'Nome inválido.' });

    const dup = await query('SELECT id FROM users WHERE username=$1 AND id != $2', [clean, req.userId]);
    if (dup.rowCount > 0) return res.status(409).json({ error: 'Nome já em uso.' });

    await query('UPDATE users SET username=$1, updated_at=NOW() WHERE id=$2', [clean, req.userId]);
    return res.json({ username: clean });
  } catch (err) {
    console.error('[userController.updateUsername] ERRO:', err.message);
    return res.status(500).json({ error: 'Erro interno.' });
  }
}

// ─── Upload de avatar ────────────────────────────────────────────────────────
async function uploadAvatar(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum ficheiro enviado.' });

    const sharpLib = getSharp();
    if (!sharpLib) {
      console.error('[userController.uploadAvatar] sharp não disponível — upload impossível.');
      return res.status(500).json({ error: 'Processamento de imagem não disponível neste servidor.' });
    }

    const uploadDir = process.env.AVATARS_UPLOAD_DIR || path.join(__dirname, '../../../client/public/assets/avatars/uploads');

    // Garantir que o diretório existe
    if (!fs.existsSync(uploadDir)) {
      console.log(`[Avatar] A criar diretório de uploads: ${uploadDir}`);
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filename = `${req.userId}_${uuidv4().slice(0,8)}.webp`;
    const destPath = path.join(uploadDir, filename);

    console.log(`[Avatar] A processar avatar para ${req.userId} → ${destPath}`);

    // Converter e redimensionar para 128×128 WebP
    await sharpLib(req.file.buffer)
      .resize(128, 128, { fit: 'cover', position: 'centre' })
      .webp({ quality: 85 })
      .toFile(destPath);

    const avatarUrl = `/assets/avatars/uploads/${filename}`;
    await query('UPDATE users SET avatar_url=$1, updated_at=NOW() WHERE id=$2', [avatarUrl, req.userId]);

    console.log(`[Avatar] Avatar atualizado para ${req.userId}: ${avatarUrl}`);
    return res.json({ avatar_url: avatarUrl });
  } catch (err) {
    console.error('[userController.uploadAvatar] ERRO:', err.message);
    console.error('[userController.uploadAvatar] Stack:', err.stack);
    return res.status(500).json({ error: 'Erro ao processar avatar.' });
  }
}

// ─── Histórico de partidas ────────────────────────────────────────────────────
async function getMatchHistory(req, res) {
  try {
    const { userId } = req.params;
    console.log(`[userController.getMatchHistory] userId=${userId}`);
    const result = await query(
      `SELECT mh.id, mh.room_code, mh.winner_role, mh.total_rounds_played, mh.played_at,
              mp.role, mp.score, mp.voted_correctly
       FROM match_history mh
       JOIN match_participants mp ON mp.match_id = mh.id
       WHERE mp.user_id = $1
       ORDER BY mh.played_at DESC
       LIMIT 20`,
      [userId]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('[userController.getMatchHistory] ERRO:', err.message);
    return res.status(500).json({ error: 'Erro interno.' });
  }
}

// ─── Leaderboard global ───────────────────────────────────────────────────────
async function getLeaderboard(req, res) {
  try {
    const result = await query(
      `SELECT id, username, avatar_url, total_wins, total_games,
              CASE WHEN total_games > 0 THEN ROUND((total_wins::numeric / total_games) * 100, 1) ELSE 0 END AS win_rate
       FROM users
       WHERE total_games >= 5
       ORDER BY total_wins DESC, win_rate DESC
       LIMIT 50`
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('[userController.getLeaderboard] ERRO:', err.message);
    return res.status(500).json({ error: 'Erro interno.' });
  }
}

module.exports = { getProfile, updateUsername, uploadAvatar, getMatchHistory, getLeaderboard };
