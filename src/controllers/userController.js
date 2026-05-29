// src/controllers/userController.js
const path  = require('path');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { sanitizeUsername } = require('../utils/sanitize');

// ─── Obter perfil ────────────────────────────────────────────────────────────
async function getProfile(req, res) {
  try {
    const { userId } = req.params;
    const result = await query(
      `SELECT id, username, avatar_url, total_wins, total_games, created_at,
              CASE WHEN total_games > 0 THEN ROUND((total_wins::numeric / total_games) * 100, 1) ELSE 0 END AS win_rate
       FROM users WHERE id = $1`,
      [userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Utilizador não encontrado.' });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('[userController.getProfile] ❌', err.message);
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
    console.error('[userController.updateUsername] ❌', err.message);
    return res.status(500).json({ error: 'Erro interno.' });
  }
}

// ─── Upload de avatar ────────────────────────────────────────────────────────
// ATENÇÃO: No Render (free tier) o filesystem é efémero — ficheiros locais
// são apagados em cada deploy/restart. Para avatares persistentes usa o
// Supabase Storage (recomendado) ou outro serviço de objectos (S3, Cloudinary).
//
// Esta versão usa Supabase Storage se disponível, senão cai para disco local
// com um aviso claro no terminal.
async function uploadAvatar(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum ficheiro enviado.' });

    // Processar imagem para WebP 128x128
    const webpBuffer = await sharp(req.file.buffer)
      .resize(128, 128, { fit: 'cover', position: 'centre' })
      .webp({ quality: 85 })
      .toBuffer();

    const filename  = `${req.userId}_${uuidv4().slice(0, 8)}.webp`;
    let avatarUrl;

    // Tentar Supabase Storage primeiro
    const { supabaseAdmin } = require('../config/supabaseClient');
    if (supabaseAdmin) {
      const storagePath = `avatars/${filename}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from(process.env.SUPABASE_AVATARS_BUCKET || 'avatars')
        .upload(storagePath, webpBuffer, {
          contentType: 'image/webp',
          upsert: true,
        });

      if (uploadError) {
        console.error('[userController.uploadAvatar] ❌ Supabase Storage error:', uploadError.message);
        console.error('[userController.uploadAvatar]    Verifica se o bucket "avatars" existe no Supabase Storage.');
        return res.status(500).json({ error: 'Erro ao fazer upload do avatar.' });
      }

      const { data: publicData } = supabaseAdmin.storage
        .from(process.env.SUPABASE_AVATARS_BUCKET || 'avatars')
        .getPublicUrl(storagePath);

      avatarUrl = publicData.publicUrl;
      console.log('[userController.uploadAvatar] ✅ Avatar guardado no Supabase Storage:', avatarUrl);
    } else {
      // Fallback: disco local (só funciona em dev — no Render os ficheiros perdem-se!)
      console.warn('[userController.uploadAvatar] ⚠️  supabaseAdmin não disponível.');
      console.warn('[userController.uploadAvatar]    A guardar avatar em disco LOCAL.');
      console.warn('[userController.uploadAvatar]    ATENÇÃO: No Render estes ficheiros perdem-se em cada restart!');
      console.warn('[userController.uploadAvatar]    Define SUPABASE_SERVICE_ROLE_KEY para usar Supabase Storage.');

      const fs = require('fs');
      const destDir = process.env.AVATARS_UPLOAD_DIR || './public/assets/avatars/uploads';
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      const destPath = path.join(destDir, filename);
      fs.writeFileSync(destPath, webpBuffer);
      avatarUrl = `/assets/avatars/uploads/${filename}`;
    }

    await query('UPDATE users SET avatar_url=$1, updated_at=NOW() WHERE id=$2', [avatarUrl, req.userId]);
    return res.json({ avatar_url: avatarUrl });
  } catch (err) {
    console.error('[userController.uploadAvatar] ❌', err.message);
    console.error(err.stack);
    return res.status(500).json({ error: 'Erro ao processar avatar.' });
  }
}

// ─── Histórico de partidas ────────────────────────────────────────────────────
async function getMatchHistory(req, res) {
  try {
    const { userId } = req.params;
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
    console.error('[userController.getMatchHistory] ❌', err.message);
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
    console.error('[userController.getLeaderboard] ❌', err.message);
    return res.status(500).json({ error: 'Erro interno.' });
  }
}

module.exports = { getProfile, updateUsername, uploadAvatar, getMatchHistory, getLeaderboard };
