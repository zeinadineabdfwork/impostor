// src/config/database.js
// Camada de acesso à base de dados usando o SDK do Supabase (sem pg, sem DATABASE_URL)
// Isto resolve o problema de IPv6/ENETUNREACH no Render Free Tier.

const { supabase, supabaseAdmin } = require('./supabaseClient');

console.log('[DB] A usar Supabase SDK como camada de dados (sem conexão directa PostgreSQL).');

// Testar conexão ao arrancar
supabaseAdmin
  .from('users')
  .select('count', { count: 'exact', head: true })
  .then(({ error }) => {
    if (error) {
      console.error('[DB] FALHA ao conectar ao Supabase!');
      console.error('[DB] Mensagem:', error.message);
      console.error('[DB] Verifique SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
    } else {
      console.log('[DB] Conexão ao Supabase OK.');
    }
  });

/**
 * Adaptador query() compatível com a interface pg.
 * Converte SQL básico em chamadas ao Supabase SDK.
 *
 * NOTA: Para queries complexas usa directamente supabaseAdmin.rpc()
 * ou supabaseAdmin.from() nos controllers/handlers.
 *
 * Suporta apenas as queries usadas neste projecto:
 *  - SELECT com WHERE simples
 *  - INSERT ... RETURNING
 *  - UPDATE ... WHERE id = $x
 *  - SELECT NOW() (health check)
 */
async function query(text, params = []) {
  const start = Date.now();
  const sql = text.trim().replace(/\s+/g, ' ');
  console.log(`[DB] query: ${sql.substring(0, 100)}`);

  try {
    const result = await executeSQL(sql, params);
    console.log(`[DB] OK (${Date.now() - start}ms, rows: ${result.rowCount})`);
    return result;
  } catch (err) {
    console.error(`[DB] ERRO (${Date.now() - start}ms): ${err.message}`);
    console.error(`[DB]   SQL: ${sql}`);
    console.error(`[DB]   Params: ${JSON.stringify(params)}`);
    throw err;
  }
}

async function executeSQL(sql, params) {
  const upper = sql.toUpperCase();

  // ── SELECT NOW() — health check ──────────────────────────────────────────
  if (upper.startsWith('SELECT NOW()')) {
    return { rows: [{ now: new Date().toISOString() }], rowCount: 1 };
  }

  // ── SELECT 1 — ping ────────────────────────────────────────────────────────
  if (upper === 'SELECT 1') {
    return { rows: [{ '?column?': 1 }], rowCount: 1 };
  }

  // ── Usar RPC para SQL arbitrário via função exec_sql no Supabase ───────────
  // Se não tiveres a função, usa o fallback de mapeamento directo abaixo.
  // A função exec_sql é a forma mais fiável de correr SQL arbitrário.
  const { data, error } = await supabaseAdmin.rpc('exec_sql', {
    query_text: sql,
    query_params: params,
  });

  if (error) {
    // Fallback: tentar mapeamento directo para operações conhecidas
    return await directMapping(sql, params, upper);
  }

  const rows = Array.isArray(data) ? data : (data ? [data] : []);
  return { rows, rowCount: rows.length };
}

// ── Mapeamento directo para operações conhecidas (fallback sem exec_sql) ────
async function directMapping(sql, params, upper) {
  // ── INSERT INTO users ──────────────────────────────────────────────────────
  if (upper.includes('INSERT INTO USERS')) {
    if (upper.includes('(ID, USERNAME, EMAIL, PASSWORD_HASH)')) {
      const [id, username, email, password_hash] = params;
      const { data, error } = await supabaseAdmin
        .from('users')
        .insert({ id, username, email, password_hash })
        .select('id, username, avatar_url, total_wins, total_games, created_at')
        .single();
      if (error) throw new Error(error.message);
      return { rows: [data], rowCount: 1 };
    }
  }

  // ── SELECT FROM users ──────────────────────────────────────────────────────
  if (upper.includes('FROM USERS WHERE')) {
    // Por email
    if (upper.includes('WHERE EMAIL = $1')) {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('id, username, email, password_hash, avatar_url, total_wins, total_games')
        .eq('email', params[0])
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { rows: data ? [data] : [], rowCount: data ? 1 : 0 };
    }
    // Por id
    if (upper.includes('WHERE ID = $1')) {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('id, username, avatar_url, total_wins, total_games, created_at')
        .eq('id', params[0])
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { rows: data ? [data] : [], rowCount: data ? 1 : 0 };
    }
    // Verificar duplicados (username OR email)
    if (upper.includes('WHERE USERNAME = $1 OR EMAIL = $2')) {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('id')
        .or(`username.eq.${params[0]},email.eq.${params[1]}`);
      if (error) throw new Error(error.message);
      return { rows: data || [], rowCount: (data || []).length };
    }
    // Verificar username duplicado excluindo próprio id
    if (upper.includes('WHERE USERNAME=$1 AND ID != $2')) {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('username', params[0])
        .neq('id', params[1]);
      if (error) throw new Error(error.message);
      return { rows: data || [], rowCount: (data || []).length };
    }
  }

  // ── UPDATE users ───────────────────────────────────────────────────────────
  if (upper.includes('UPDATE USERS SET')) {
    if (upper.includes('TOTAL_GAMES')) {
      const won = params[0];
      const userId = params[1];
      // Buscar valores actuais primeiro
      const { data: current } = await supabaseAdmin
        .from('users')
        .select('total_games, total_wins')
        .eq('id', userId)
        .single();
      if (!current) return { rows: [], rowCount: 0 };
      const { error } = await supabaseAdmin
        .from('users')
        .update({
          total_games: (current.total_games || 0) + 1,
          total_wins:  (current.total_wins  || 0) + (won || 0),
          updated_at:  new Date().toISOString(),
        })
        .eq('id', userId);
      if (error) throw new Error(error.message);
      return { rows: [], rowCount: 1 };
    }
    if (upper.includes('USERNAME')) {
      const { error } = await supabaseAdmin
        .from('users')
        .update({ username: params[0], updated_at: new Date().toISOString() })
        .eq('id', params[1]);
      if (error) throw new Error(error.message);
      return { rows: [], rowCount: 1 };
    }
    if (upper.includes('AVATAR_URL')) {
      const { error } = await supabaseAdmin
        .from('users')
        .update({ avatar_url: params[0], updated_at: new Date().toISOString() })
        .eq('id', params[1]);
      if (error) throw new Error(error.message);
      return { rows: [], rowCount: 1 };
    }
  }

  // ── INSERT INTO match_history ──────────────────────────────────────────────
  if (upper.includes('INSERT INTO MATCH_HISTORY')) {
    const [id, room_code, winner_role, total_rounds_played] = params;
    const { error } = await supabaseAdmin
      .from('match_history')
      .insert({ id, room_code, winner_role, total_rounds_played });
    if (error) throw new Error(error.message);
    return { rows: [], rowCount: 1 };
  }

  // ── INSERT INTO match_participants ─────────────────────────────────────────
  if (upper.includes('INSERT INTO MATCH_PARTICIPANTS')) {
    const [id, match_id, user_id, role, score, voted_correctly] = params;
    const { error } = await supabaseAdmin
      .from('match_participants')
      .insert({ id, match_id, user_id, role, score, voted_correctly });
    if (error) throw new Error(error.message);
    return { rows: [], rowCount: 1 };
  }

  // ── SELECT match_history ───────────────────────────────────────────────────
  if (upper.includes('FROM MATCH_HISTORY')) {
    const { data, error } = await supabaseAdmin
      .from('match_history')
      .select(`id, room_code, winner_role, total_rounds_played, played_at,
               match_participants!inner(role, score, voted_correctly)`)
      .eq('match_participants.user_id', params[0])
      .order('played_at', { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    // Achatar resultado para manter compatibilidade
    const rows = (data || []).map(m => ({
      id: m.id, room_code: m.room_code, winner_role: m.winner_role,
      total_rounds_played: m.total_rounds_played, played_at: m.played_at,
      ...(m.match_participants?.[0] || {}),
    }));
    return { rows, rowCount: rows.length };
  }

  // ── Leaderboard ────────────────────────────────────────────────────────────
  if (upper.includes('FROM USERS') && upper.includes('ORDER BY TOTAL_WINS')) {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, username, avatar_url, total_wins, total_games')
      .gte('total_games', 5)
      .order('total_wins', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const rows = (data || []).map(u => ({
      ...u,
      win_rate: u.total_games > 0
        ? Math.round((u.total_wins / u.total_games) * 1000) / 10
        : 0,
    }));
    return { rows, rowCount: rows.length };
  }

  throw new Error(`[DB] Query não mapeada: ${sql.substring(0, 120)}`);
}

// getClient simples para compatibilidade (não usado em transacções neste projecto)
async function getClient() {
  return {
    query: (text, params) => query(text, params),
    release: () => {},
  };
}

module.exports = { query, getClient, pool: { query, end: () => Promise.resolve() } };
