-- ════════════════════════════════════════════════════════════
-- ImpostorDraw — Schema SQL (Supabase / PostgreSQL)
-- Execute no editor SQL do Supabase em ordem
-- ════════════════════════════════════════════════════════════

-- Extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Tabela de utilizadores ────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  username        VARCHAR(15) UNIQUE NOT NULL,
  email           VARCHAR(120) UNIQUE,                     -- NULL para guests
  password_hash   TEXT,                                    -- NULL para OAuth/guest
  avatar_url      VARCHAR(255) DEFAULT NULL,
  total_wins      INT          DEFAULT 0  NOT NULL,
  total_games     INT          DEFAULT 0  NOT NULL,
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Tabela de temas/palavras ──────────────────────────────────
CREATE TABLE IF NOT EXISTS game_themes (
  id           SERIAL      PRIMARY KEY,
  category     VARCHAR(50) NOT NULL,
  prompt_word  VARCHAR(100) NOT NULL,
  difficulty   SMALLINT    DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 3),
  created_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Histórico de partidas ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS match_history (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_code           VARCHAR(10) NOT NULL,
  winner_role         VARCHAR(20) NOT NULL CHECK (winner_role IN ('innocent','impostor')),
  total_rounds_played INT         NOT NULL,
  played_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ── Participantes de cada partida ─────────────────────────────
CREATE TABLE IF NOT EXISTS match_participants (
  id               UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id         UUID    NOT NULL REFERENCES match_history(id) ON DELETE CASCADE,
  user_id          UUID    NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  role             VARCHAR(10) NOT NULL CHECK (role IN ('innocent','impostor')),
  score            INT     DEFAULT 0,
  voted_correctly  BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── Índices de performance ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_username         ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email            ON users(email);
CREATE INDEX IF NOT EXISTS idx_themes_category        ON game_themes(category);
CREATE INDEX IF NOT EXISTS idx_match_history_played   ON match_history(played_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_parts_user       ON match_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_match_parts_match      ON match_participants(match_id);

-- ── Trigger: actualizar updated_at automaticamente ────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Seed: temas iniciais ──────────────────────────────────────
INSERT INTO game_themes (category, prompt_word, difficulty) VALUES
  ('Animais','Elefante',1),('Animais','Golfinho',1),('Animais','Pinguim',1),
  ('Animais','Flamingo',2),('Animais','Aranha',2),('Animais','Tubarão',1),
  ('Comida','Pizza',1),('Comida','Sushi',2),('Comida','Taco',1),
  ('Comida','Croissant',2),('Comida','Gelado',1),('Comida','Hamburguer',1),
  ('Veículos','Helicóptero',2),('Veículos','Submarino',2),('Veículos','Foguetão',2),
  ('Veículos','Bicicleta',1),('Veículos','Comboio',1),('Veículos','Veleiro',2),
  ('Objectos','Guitarra',1),('Objectos','Telescópio',3),('Objectos','Ampulheta',2),
  ('Objectos','Microscópio',3),('Objectos','Bússola',2),('Objectos','Escada',1),
  ('Lugares','Vulcão',2),('Lugares','Farol',2),('Lugares','Castelo',2),
  ('Lugares','Pirâmide',2),('Lugares','Iglu',2),('Lugares','Ilha',1),
  ('Profissões','Astronauta',2),('Profissões','Pirata',1),('Profissões','Mago',1),
  ('Profissões','Detetive',2),('Profissões','Chef',1),('Profissões','Bombeiro',1),
  ('Desporto','Surf',2),('Desporto','Esgrima',3),('Desporto','Polo',3),
  ('Desporto','Badminton',2),('Desporto','Escalada',2),('Desporto','Boxe',1)
ON CONFLICT DO NOTHING;
