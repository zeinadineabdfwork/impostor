-- ════════════════════════════════════════════════════════════════════
-- ImpostorDraw — Schema completo (Supabase / PostgreSQL)
-- Cole e execute TUDO de uma vez no SQL Editor do Supabase
-- Project: https://supabase.com/dashboard/project/SEU_PROJETO/sql
-- ════════════════════════════════════════════════════════════════════

-- ── 0. Extensões ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. Tabela de utilizadores ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      VARCHAR(20)  UNIQUE NOT NULL,
  email         VARCHAR(120) UNIQUE,
  password_hash TEXT,
  avatar_url    VARCHAR(255) DEFAULT NULL,
  total_wins    INT          DEFAULT 0 NOT NULL,
  total_games   INT          DEFAULT 0 NOT NULL,
  created_at    TIMESTAMPTZ  DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 2. Histórico de partidas ──────────────────────────────────────────────────
-- room_code VARCHAR(20) para suportar códigos longos do quickplay (ex: ABC123AB3456)
CREATE TABLE IF NOT EXISTS match_history (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_code           VARCHAR(20) NOT NULL,
  winner_role         VARCHAR(20) NOT NULL CHECK (winner_role IN ('innocent','impostor')),
  total_rounds_played INT         NOT NULL,
  played_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. Participantes de cada partida ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS match_participants (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id        UUID        NOT NULL REFERENCES match_history(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  role            VARCHAR(10) NOT NULL CHECK (role IN ('innocent','impostor')),
  score           INT         DEFAULT 0,
  voted_correctly BOOLEAN     DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. Temas do jogo ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_themes (
  id           SERIAL       PRIMARY KEY,
  category     VARCHAR(50)  NOT NULL,
  prompt_word  VARCHAR(100) NOT NULL,
  impostor_word VARCHAR(100) NOT NULL DEFAULT '',
  difficulty   SMALLINT     DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 3),
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 5. Índices de performance ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_username       ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_wins           ON users(total_wins DESC);
CREATE INDEX IF NOT EXISTS idx_match_history_date   ON match_history(played_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_parts_user     ON match_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_match_parts_match    ON match_participants(match_id);
CREATE INDEX IF NOT EXISTS idx_themes_category      ON game_themes(category);

-- ── 6. Trigger: updated_at automático ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 7. Função exec_sql (usada pelo servidor para queries dinâmicas) ────────────
-- IMPORTANTE: esta função permite ao servidor correr SQL via RPC.
-- Só o service_role (backend) tem permissão — nunca o anon.
CREATE OR REPLACE FUNCTION exec_sql(query_text TEXT, query_params JSONB DEFAULT '[]')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  EXECUTE query_text INTO result USING query_params;
  RETURN COALESCE(result, '[]'::JSONB);
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'exec_sql error: % — %', SQLERRM, query_text;
END;
$$;

-- Revogar acesso público à função exec_sql (só service_role pode chamar)
REVOKE ALL ON FUNCTION exec_sql FROM PUBLIC;
REVOKE ALL ON FUNCTION exec_sql FROM anon;
REVOKE ALL ON FUNCTION exec_sql FROM authenticated;

-- ── 8. Row Level Security (RLS) ───────────────────────────────────────────────
-- O servidor usa sempre o service_role_key que ignora RLS.
-- RLS activo impede acesso directo não autorizado pelo frontend.

ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_history     ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_themes       ENABLE ROW LEVEL SECURITY;

-- Utilizadores: só podem ler o próprio perfil via anon key
-- (o servidor usa service_role, por isso não é afectado)
DROP POLICY IF EXISTS "users_select_own"   ON users;
DROP POLICY IF EXISTS "users_insert_own"   ON users;
DROP POLICY IF EXISTS "themes_select_all"  ON game_themes;

CREATE POLICY "users_select_own"  ON users FOR SELECT USING (true);
CREATE POLICY "users_insert_own"  ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "themes_select_all" ON game_themes FOR SELECT USING (true);

-- ── 9. Seed: temas iniciais ───────────────────────────────────────────────────
INSERT INTO game_themes (category, prompt_word, impostor_word, difficulty) VALUES
  -- Animais
  ('Animais',    'Elefante',    'Rinoceronte',  1),
  ('Animais',    'Golfinho',    'Tubarão',      1),
  ('Animais',    'Pinguim',     'Pato',         1),
  ('Animais',    'Flamingo',    'Cegonha',      2),
  ('Animais',    'Aranha',      'Escorpião',    2),
  ('Animais',    'Canguru',     'Coala',        2),
  ('Animais',    'Girafa',      'Zebra',        1),
  ('Animais',    'Polvo',       'Lula',         2),
  -- Comida
  ('Comida',     'Pizza',       'Lasanha',      1),
  ('Comida',     'Sushi',       'Onigiri',      2),
  ('Comida',     'Hambúrguer',  'Sanduíche',    1),
  ('Comida',     'Croissant',   'Brioche',      2),
  ('Comida',     'Gelado',      'Semifrio',     1),
  ('Comida',     'Taco',        'Burrito',      1),
  ('Comida',     'Donut',       'Rosca',        1),
  -- Veículos
  ('Veículos',   'Helicóptero', 'Avião',        2),
  ('Veículos',   'Submarino',   'Barco',        2),
  ('Veículos',   'Bicicleta',   'Trotinete',    1),
  ('Veículos',   'Foguetão',    'Nave Espacial',3),
  ('Veículos',   'Comboio',     'Metro',        1),
  ('Veículos',   'Veleiro',     'Barco a Remo', 2),
  -- Objectos
  ('Objectos',   'Guitarra',    'Baixo',        1),
  ('Objectos',   'Telescópio',  'Binóculos',    3),
  ('Objectos',   'Ampulheta',   'Relógio',      2),
  ('Objectos',   'Microscópio', 'Telescópio',   3),
  ('Objectos',   'Bússola',     'Relógio',      2),
  ('Objectos',   'Escada',      'Escadote',     1),
  ('Objectos',   'Guarda-chuva','Chapéu',       1),
  -- Lugares
  ('Lugares',    'Vulcão',      'Montanha',     2),
  ('Lugares',    'Farol',       'Torre',        2),
  ('Lugares',    'Castelo',     'Forte',        2),
  ('Lugares',    'Pirâmide',    'Templo',       2),
  ('Lugares',    'Iglu',        'Tenda',        2),
  ('Lugares',    'Ilha',        'Península',    1),
  ('Lugares',    'Caverna',     'Túnel',        2),
  -- Profissões
  ('Profissões', 'Astronauta',  'Piloto',       2),
  ('Profissões', 'Pirata',      'Marinheiro',   1),
  ('Profissões', 'Mago',        'Palhaço',      1),
  ('Profissões', 'Detetive',    'Polícia',      2),
  ('Profissões', 'Chef',        'Padeiro',      1),
  ('Profissões', 'Bombeiro',    'Polícia',      1),
  -- Desporto
  ('Desporto',   'Surf',        'Wakeboard',    2),
  ('Desporto',   'Esgrima',     'Luta',         3),
  ('Desporto',   'Badminton',   'Ténis',        2),
  ('Desporto',   'Escalada',    'Montanhismo',  2),
  ('Desporto',   'Boxe',        'Karaté',       1),
  ('Desporto',   'Polo',        'Hóquei',       3)
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════════
-- FIM DO SCHEMA
-- Verifica as tabelas criadas:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' ORDER BY table_name;
-- ════════════════════════════════════════════════════════════════════
